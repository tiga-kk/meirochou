import { GasApiClient } from "./api/gas-api-client";
import { Config } from "./config.js";
import { parseCircleCsv, serializeCircleCsv } from "./data/csv-circle-codec";
import {
  type LoadedEventRegistry,
  loadEventRegistryWithUrl,
} from "./data/event-registry";
import { GasRefreshService } from "./data/gas-refresh-service";
import {
  circleRecordToCircle,
  decodeLegacyCircles,
  decodeLegacyHistory,
  decodeLegacyStringList,
  extractLegacyCircleRows,
} from "./data/local-state-adapters";
import { applySourceDiff, diffCircleSources } from "./data/source-diff";
import { EventDayRepository } from "./state/event-day-repository";
import { EventDayTransitionService } from "./state/event-day-transition-service";
import { GasOutboxService } from "./state/gas-outbox-service";
import { GasSyncCoordinator } from "./state/gas-sync-coordinator";
import { PurchaseMutationService } from "./state/purchase-mutation-service";
import {
  SourceSettingsService,
  StaleSourceStateError,
} from "./state/source-settings-service";
import { createEmptyEventDayState } from "./state/storage-schema";
import { StorageService } from "./state/storage-service.js";
import type {
  ActionHistoryEntry,
  ActionType,
  Circle,
  CircleRecord,
  EventDayRef,
  EventRegistryV1,
  GasDataSource,
  GasOutboxResult,
  GasRefreshPreview,
  GasSyncSummary,
  HistoryEntry,
  LocalEventDayState,
  MapBundleManifestV1,
  PurchaseMutationResult,
  SourceDiff,
} from "./types/domain";

export interface CsvReplacementPreview {
  readonly previewId: string;
  readonly ref: EventDayRef;
  readonly expectedSourceGeneration: string;
  readonly incomingHash: string;
  readonly fileName: string;
  readonly diff: SourceDiff;
  readonly expiresAt: string;
}

export interface LegacyImportPreview {
  readonly previewId: string;
  readonly target: EventDayRef;
  readonly circleCount: number;
  readonly purchasedCount: number;
  readonly holdCount: number;
  readonly historyCount: number;
  readonly issues: readonly string[];
}

export interface DataManagerOptions {
  readonly now?: () => Date;
  readonly createSourceGeneration?: () => string;
  readonly createPreviewId?: () => string;
  readonly previewTtlMs?: number;
  readonly client?: GasApiClient;
  readonly repository?: EventDayRepository;
  readonly sourceSettings?: SourceSettingsService;
  readonly refreshService?: GasRefreshService;
  readonly outboxService?: GasOutboxService;
  readonly purchaseMutationService?: PurchaseMutationService;
  readonly syncCoordinator?: GasSyncCoordinator;
}

interface CsvPreviewRecord extends CsvReplacementPreview {
  readonly text: string;
  readonly circles: readonly CircleRecord[];
}

interface LegacyPreviewRecord {
  readonly target: EventDayRef;
  readonly circles: readonly CircleRecord[];
  readonly purchased: readonly string[];
  readonly hold: readonly string[];
  readonly history: readonly HistoryEntry[];
  readonly redo: readonly HistoryEntry[];
  readonly issues: readonly string[];
}

export class StaleCsvPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleCsvPreviewError";
  }
}

export class LegacyImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyImportError";
  }
}

function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sameRef(left: EventDayRef | null, right: EventDayRef): boolean {
  return Boolean(
    left && left.eventId === right.eventId && left.dayId === right.dayId,
  );
}

/** LocalStorage-backed service for the currently selected event/day. */
export class DataManager {
  readonly storage: StorageService;
  readonly repository: EventDayRepository;
  readonly sourceSettings: SourceSettingsService;
  readonly client: GasApiClient;
  readonly refreshService: GasRefreshService;
  readonly outboxService: GasOutboxService;
  readonly purchaseMutationService: PurchaseMutationService;
  readonly syncCoordinator: GasSyncCoordinator;
  readonly csvPreviews = new Map<string, CsvPreviewRecord>();

  wantToBuy: Circle[] = [];
  spreadsheetTitle = "";
  purchasedList: string[] = [];
  holdList: string[] = [];
  actionHistory: ActionHistoryEntry[] = [];
  redoStack: ActionHistoryEntry[] = [];
  activeRef: EventDayRef | null = null;
  activeState: LocalEventDayState | null = null;
  eventRegistry: EventRegistryV1 | null = null;

  private readonly now: () => Date;
  private readonly createSourceGeneration: () => string;
  private readonly createPreviewId: () => string;
  private readonly previewTtlMs: number;
  private readonly legacyPreviews = new Map<string, LegacyPreviewRecord>();

  constructor(storage?: StorageService, options: DataManagerOptions = {}) {
    this.storage = storage || new StorageService();
    this.repository =
      options.repository || new EventDayRepository(this.storage);
    this.sourceSettings =
      options.sourceSettings || new SourceSettingsService(this.repository);
    this.client = options.client || new GasApiClient();

    let generationSequence = 0;
    let previewSequence = 0;
    this.now = options.now || (() => new Date());
    this.createSourceGeneration =
      options.createSourceGeneration ||
      (() => `source-${Date.now()}-${generationSequence++}`);
    this.createPreviewId =
      options.createPreviewId ||
      (() => `csv-preview-${Date.now()}-${previewSequence++}`);
    this.previewTtlMs = options.previewTtlMs ?? 5 * 60 * 1000;

    this.refreshService =
      options.refreshService ||
      new GasRefreshService(this.repository, this.client, this.sourceSettings, {
        now: this.now,
        createSourceGeneration: this.createSourceGeneration,
        createPreviewId: this.createPreviewId,
        previewTtlMs: this.previewTtlMs,
      });

    this.outboxService =
      options.outboxService ||
      new GasOutboxService(this.repository, this.client);

    this.purchaseMutationService =
      options.purchaseMutationService ||
      new PurchaseMutationService(this.repository, this.outboxService);

    this.syncCoordinator =
      options.syncCoordinator ||
      new GasSyncCoordinator(this.repository, this.outboxService);
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private sourceApplyTimestamp(current: LocalEventDayState): string {
    const candidate = this.timestamp();
    const currentTimestamp = Math.max(
      Date.parse(current.timestamps.updatedAt),
      Date.parse(current.timestamps.sourceUpdatedAt),
    );
    const candidateTimestamp = Date.parse(candidate);
    if (candidateTimestamp > currentTimestamp) return candidate;
    return new Date(currentTimestamp + 1).toISOString();
  }

  private requireRegistered(ref: EventDayRef): void {
    const event = this.eventRegistry?.events.find(
      (candidate) => candidate.eventId === ref.eventId,
    );
    if (!event?.days.some((day) => day.dayId === ref.dayId)) {
      throw new Error("Event/Day not found in registry");
    }
  }

  eventRegistryUrl: string | null = null;
  transitionService: EventDayTransitionService | null = null;

  private async ensureRegistry(): Promise<LoadedEventRegistry> {
    if (this.eventRegistry && this.eventRegistryUrl) {
      return {
        registry: this.eventRegistry,
        registryUrl: this.eventRegistryUrl,
      };
    }
    if (this.eventRegistry && !this.eventRegistryUrl) {
      this.eventRegistryUrl =
        typeof document !== "undefined" && document.baseURI
          ? new URL("/assets/events/manifest.json", document.baseURI).href
          : "/assets/events/manifest.json";
      return {
        registry: this.eventRegistry,
        registryUrl: this.eventRegistryUrl,
      };
    }
    const loaded = await loadEventRegistryWithUrl();
    this.eventRegistry = loaded.registry;
    this.eventRegistryUrl = loaded.registryUrl;
    return loaded;
  }

  /** Load and cache the registry together with the URL used to resolve bundles. */
  async loadEventRegistry(): Promise<LoadedEventRegistry> {
    return this.ensureRegistry();
  }

  /** Create the event-scoped transition service after registry loading. */
  getTransitionService(
    currentManifest?: MapBundleManifestV1 | null,
  ): EventDayTransitionService {
    if (!this.eventRegistry || !this.eventRegistryUrl) {
      throw new Error(
        "Registry must be loaded before accessing transition service",
      );
    }
    this.transitionService = new EventDayTransitionService(
      this.repository,
      this.eventRegistryUrl,
      this.eventRegistry,
      { currentManifest },
    );
    return this.transitionService;
  }

  /** Activate a state after a transition service has durably committed it. */
  activateCommittedState(
    ref: EventDayRef,
    state: LocalEventDayState,
  ): LocalEventDayState {
    this.activeRef = { eventId: ref.eventId, dayId: ref.dayId };
    this.activeState = state;
    this.applyStateToMemory(state);
    return state;
  }

  private createEmptyState(): LocalEventDayState {
    return createEmptyEventDayState(
      { type: "csv", fileName: "empty.csv" },
      this.createSourceGeneration(),
      this.timestamp(),
    );
  }

  private applyStateToMemory(state: LocalEventDayState): void {
    this.wantToBuy = state.circles
      .filter((circle) => !circle.removedFromSource)
      .map(circleRecordToCircle);
    this.spreadsheetTitle = "";
    this.purchasedList = [...state.purchased];
    this.holdList = [...state.hold];
    this.actionHistory = state.history
      .filter(
        (entry): entry is HistoryEntry & { type: ActionType } =>
          entry.type === "purchase" || entry.type === "hold",
      )
      .map(({ type, space }) => ({ type, space }));
    this.redoStack = state.redo
      .filter(
        (entry): entry is HistoryEntry & { type: ActionType } =>
          entry.type === "purchase" || entry.type === "hold",
      )
      .map(({ type, space }) => ({ type, space }));
  }

  private persistState(state: LocalEventDayState): LocalEventDayState {
    if (!this.activeRef) throw new Error("No event/day is open");
    this.repository.save(this.activeRef, state);
    this.activeState = state;
    this.applyStateToMemory(state);
    return state;
  }

  private parseCsv(text: string): readonly CircleRecord[] {
    const result = parseCircleCsv(text);
    if (!result.ok) {
      throw new Error(
        `CSV parse failed: ${result.issues.map((issue) => issue.message).join("; ")}`,
      );
    }
    return result.circles;
  }

  /** Open a registry-approved event/day, creating only an empty local state when needed. */
  async openEventDay(ref: EventDayRef): Promise<LocalEventDayState> {
    await this.ensureRegistry();
    this.requireRegistered(ref);
    const existing = this.repository.load(ref);
    const state = existing || this.createEmptyState();
    if (!existing) {
      this.repository.saveWithLastOpened(ref, state);
    } else {
      this.repository.setLastOpened(ref);
    }
    return this.activateCommittedState(ref, state);
  }

  /** Create the first CSV-backed state; existing non-empty states cannot be overwritten. */
  async importInitialCsv(
    ref: EventDayRef,
    fileName: string,
    text: string,
  ): Promise<LocalEventDayState> {
    await this.ensureRegistry();
    this.requireRegistered(ref);
    const current = this.repository.load(ref);
    if (
      current &&
      (current.circles.length > 0 ||
        current.source.type !== "csv" ||
        current.source.fileName !== "empty.csv" ||
        current.purchased.length > 0 ||
        current.hold.length > 0 ||
        current.history.length > 0 ||
        current.redo.length > 0)
    ) {
      throw new Error("Initial CSV import requires an empty state");
    }

    const circles = this.parseCsv(text);
    const now = this.timestamp();
    const purchased = circles
      .filter((circle) => circle.isSale?.toLowerCase() === "x")
      .map((circle) => circle.space);
    const history: HistoryEntry[] = purchased.map((space) => ({
      type: "purchase",
      space,
      timestamp: now,
    }));
    const state: LocalEventDayState = {
      schemaVersion: 1,
      source: { type: "csv", fileName },
      sourceGeneration: this.createSourceGeneration(),
      circles,
      purchased,
      hold: [],
      history,
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: current?.timestamps.createdAt || now,
        updatedAt: now,
        sourceUpdatedAt: now,
      },
    };
    this.repository.save(ref, state);
    if (sameRef(this.activeRef, ref)) {
      this.activeState = state;
      this.applyStateToMemory(state);
    }
    return state;
  }

  /** Backward-compatible name with the new initial-import semantics. */
  importCsv(
    ref: EventDayRef,
    fileName: string,
    text: string,
  ): Promise<LocalEventDayState> {
    return this.importInitialCsv(ref, fileName, text);
  }

  /** Create a short-lived, source-generation-bound CSV replacement preview. */
  async previewCsvReplacement(
    ref: EventDayRef,
    fileName: string,
    text: string,
  ): Promise<CsvReplacementPreview> {
    await this.ensureRegistry();
    this.requireRegistered(ref);
    const state = this.repository.load(ref);
    if (!state)
      throw new Error("Open the event/day before previewing a CSV replacement");
    const circles = this.parseCsv(text);
    const createdAt = this.now().getTime();
    const preview: CsvPreviewRecord = {
      previewId: this.createPreviewId(),
      ref: { eventId: ref.eventId, dayId: ref.dayId },
      expectedSourceGeneration: state.sourceGeneration,
      incomingHash: hashText(text),
      fileName,
      diff: diffCircleSources(state.circles, circles),
      expiresAt: new Date(createdAt + this.previewTtlMs).toISOString(),
      text,
      circles,
    };
    this.csvPreviews.set(preview.previewId, preview);
    return preview;
  }

  /** Apply a preview only if its source generation, hash, and expiry still match. */
  applyCsvReplacement(previewId: string): LocalEventDayState {
    const preview = this.csvPreviews.get(previewId);
    if (!preview)
      throw new StaleCsvPreviewError(
        "CSV preview is missing or already applied",
      );
    if (this.now().getTime() >= Date.parse(preview.expiresAt)) {
      throw new StaleCsvPreviewError("CSV preview has expired");
    }
    if (hashText(preview.text) !== preview.incomingHash) {
      throw new StaleCsvPreviewError("CSV preview hash mismatch");
    }

    const current = this.repository.load(preview.ref);
    if (!current) {
      throw new StaleCsvPreviewError("CSV preview source state is missing");
    }

    const now = this.sourceApplyTimestamp(current);
    const merged = applySourceDiff(current, preview.circles, now);
    const operation =
      current.source.type === "gas" ? "source-type-change" : "csv-replacement";

    const nextStateDraft: LocalEventDayState = {
      ...merged,
      source: { type: "csv", fileName: preview.fileName },
      sourceGeneration: this.createSourceGeneration(),
    };

    let nextState: LocalEventDayState;
    try {
      nextState = this.sourceSettings.saveGuarded({
        ref: preview.ref,
        operation,
        expectedSourceGeneration: preview.expectedSourceGeneration,
        nextState: nextStateDraft,
      });
    } catch (err: unknown) {
      if (err instanceof StaleSourceStateError) {
        throw new StaleCsvPreviewError(
          "CSV preview source generation is stale",
        );
      }
      throw err;
    }

    this.csvPreviews.delete(previewId);
    if (sameRef(this.activeRef, preview.ref)) {
      this.activeState = nextState;
      this.applyStateToMemory(nextState);
    }
    return nextState;
  }

  /** Export the validated local snapshot, including source rows retained for history. */
  exportCsv(ref: EventDayRef): string {
    const state = this.repository.load(ref);
    if (!state) throw new Error("Event day state not found");
    return serializeCircleCsv(state.circles, new Set(state.purchased));
  }

  private readLegacyJson(key: string, issues: string[]): unknown {
    try {
      return this.storage.getJson<unknown>(key, null);
    } catch {
      issues.push(`${key} contains invalid JSON`);
      return null;
    }
  }

  /** Read old storage only for an explicit, diagnostic migration preview. */
  previewLegacyImport(target: EventDayRef): LegacyImportPreview {
    this.requireRegistered(target);
    const issues: string[] = [];
    const data =
      this.readLegacyJson(Config.STORAGE_KEYS.DATA, issues) ||
      this.readLegacyJson("comipath:v1:circles", issues);
    const extracted =
      data === null ? { value: [], issues: [] } : extractLegacyCircleRows(data);
    issues.push(...extracted.issues);
    const circles = decodeLegacyCircles(extracted.value);
    issues.push(...circles.issues);

    const decodeList = (key: string, fallback: string): readonly string[] => {
      const raw =
        this.readLegacyJson(key, issues) ??
        this.readLegacyJson(fallback, issues);
      if (raw === null) return [];
      const decoded = decodeLegacyStringList(raw, key);
      issues.push(...decoded.issues);
      return decoded.value;
    };
    const purchased = decodeList(
      Config.STORAGE_KEYS.PURCHASED,
      "comipath:v1:purchased",
    );
    const hold = decodeList(Config.STORAGE_KEYS.HOLD, "comipath:v1:hold");
    const now = this.timestamp();
    const historyRaw =
      this.readLegacyJson(Config.STORAGE_KEYS.HISTORY, issues) ??
      this.readLegacyJson("comipath:v1:history", issues);
    const redoRaw =
      this.readLegacyJson(Config.STORAGE_KEYS.REDO_STACK, issues) ??
      this.readLegacyJson("comipath:v1:redo_stack", issues);
    const history =
      historyRaw === null
        ? { value: [], issues: [] }
        : decodeLegacyHistory(historyRaw, "history", now);
    const redo =
      redoRaw === null
        ? { value: [], issues: [] }
        : decodeLegacyHistory(redoRaw, "redo", now);
    issues.push(...history.issues, ...redo.issues);

    const circleSpaces = new Set(circles.value.map((circle) => circle.space));
    for (const [name, list] of [
      ["purchased", purchased],
      ["hold", hold],
    ] as const) {
      list.forEach((space) => {
        if (!circleSpaces.has(space))
          issues.push(`${name} references missing circle ${space}`);
      });
    }
    for (const [name, entries] of [
      ["history", history.value],
      ["redo", redo.value],
    ] as const) {
      entries.forEach((entry) => {
        if (!circleSpaces.has(entry.space))
          issues.push(`${name} references missing circle ${entry.space}`);
      });
    }

    const previewId = `legacy-preview-${Date.now()}-${this.legacyPreviews.size}`;
    this.legacyPreviews.set(previewId, {
      target: { eventId: target.eventId, dayId: target.dayId },
      circles: circles.value,
      purchased,
      hold,
      history: history.value,
      redo: redo.value,
      issues,
    });
    return {
      previewId,
      target,
      circleCount: circles.value.length,
      purchasedCount: purchased.length,
      holdCount: hold.length,
      historyCount: history.value.length,
      issues: [...issues],
    };
  }

  /** Apply a valid legacy preview without deleting the source keys. */
  applyLegacyImport(
    target: EventDayRef,
    previewId: string,
  ): LocalEventDayState {
    this.requireRegistered(target);
    const preview = this.legacyPreviews.get(previewId);
    if (!preview)
      throw new LegacyImportError(
        "Legacy preview is missing or already applied",
      );
    if (!sameRef(preview.target, target)) {
      throw new LegacyImportError("Legacy preview target is stale");
    }
    if (preview.issues.length > 0) {
      throw new LegacyImportError("Legacy preview contains invalid rows");
    }
    if (this.repository.load(target)) {
      throw new LegacyImportError("Legacy import target already has a state");
    }

    const now = this.timestamp();
    const state: LocalEventDayState = {
      schemaVersion: 1,
      source: { type: "csv", fileName: "legacy_imported.csv" },
      sourceGeneration: this.createSourceGeneration(),
      circles: preview.circles,
      purchased: preview.purchased,
      hold: preview.hold,
      history: preview.history,
      redo: preview.redo,
      gasOutbox: [],
      timestamps: { createdAt: now, updatedAt: now, sourceUpdatedAt: now },
    };
    this.repository.save(target, state);
    this.legacyPreviews.delete(previewId);
    if (sameRef(this.activeRef, target)) {
      this.activeState = state;
      this.applyStateToMemory(state);
    }
    return state;
  }

  private updateActiveState(
    update: (state: LocalEventDayState, now: string) => LocalEventDayState,
  ): LocalEventDayState {
    if (!this.activeState || !this.activeRef) {
      throw new Error("No event/day is open");
    }
    return this.persistState(update(this.activeState, this.timestamp()));
  }

  setPurchased(space: string, purchased: boolean): PurchaseMutationResult {
    if (!this.activeRef) throw new Error("No event/day is open");
    const result = this.purchaseMutationService.setPurchased(
      this.activeRef,
      space,
      purchased,
      this.timestamp(),
    );
    this.activeState = result.state;
    this.applyStateToMemory(result.state);
    return result;
  }

  /** Store a local purchase without contacting GAS. */
  addPurchased(space: string, _sheetName = ""): void {
    if (!this.activeState || !this.activeRef) {
      if (!this.purchasedList.includes(space)) {
        this.purchasedList.push(space);
        this.actionHistory.push({ type: "purchase", space });
        this.redoStack = [];
      }
      return;
    }
    this.setPurchased(space, true);
  }

  /** Store a local hold without contacting GAS. */
  addHold(space: string, _sheetName = ""): void {
    if (!this.activeState || !this.activeRef) {
      if (!this.holdList.includes(space)) {
        this.holdList.push(space);
        this.actionHistory.push({ type: "hold", space });
        this.redoStack = [];
      }
      return;
    }
    if (this.activeState.hold.includes(space)) return;
    this.updateActiveState((state, now) => ({
      ...state,
      hold: [...state.hold, space],
      history: [...state.history, { type: "hold", space, timestamp: now }],
      redo: [],
      timestamps: { ...state.timestamps, updatedAt: now },
    }));
  }

  /** Undo one local purchase/hold while preserving the original timestamp in redo. */
  undoLastAction(): ActionHistoryEntry | null {
    if (!this.activeState || !this.activeRef) {
      const last = this.actionHistory.pop();
      if (!last) return null;
      this.redoStack.push(last);
      if (last.type === "purchase")
        this.purchasedList = this.purchasedList.filter(
          (space) => space !== last.space,
        );
      if (last.type === "hold")
        this.holdList = this.holdList.filter((space) => space !== last.space);
      return last;
    }
    const result = this.purchaseMutationService.undo(
      this.activeRef,
      this.timestamp(),
    );
    if (!result) return null;
    const popped = result.state.redo.at(-1);
    this.activeState = result.state;
    this.applyStateToMemory(result.state);
    if (!popped) return null;
    const legacyType: ActionType =
      popped.type === "purchase" || popped.type === "unpurchase"
        ? "purchase"
        : "hold";
    return { type: legacyType, space: popped.space };
  }

  /** Redo one local purchase/hold while preserving its original history timestamp. */
  redoAction(): ActionHistoryEntry | null {
    if (!this.activeState || !this.activeRef) {
      const last = this.redoStack.pop();
      if (!last) return null;
      this.actionHistory.push(last);
      if (last.type === "purchase" && !this.purchasedList.includes(last.space))
        this.purchasedList.push(last.space);
      if (last.type === "hold" && !this.holdList.includes(last.space))
        this.holdList.push(last.space);
      return last;
    }
    const result = this.purchaseMutationService.redo(
      this.activeRef,
      this.timestamp(),
    );
    if (!result) return null;
    const pushed = result.state.history.at(-1);
    this.activeState = result.state;
    this.applyStateToMemory(result.state);
    if (!pushed) return null;
    const legacyType: ActionType =
      pushed.type === "purchase" || pushed.type === "unpurchase"
        ? "purchase"
        : "hold";
    return { type: legacyType, space: pushed.space };
  }

  /** Clear local purchase and hold state while retaining the source snapshot. */
  resetAll(): string[] {
    const backup = [...this.purchasedList];
    if (!this.activeState || !this.activeRef) {
      this.purchasedList = [];
      this.holdList = [];
      this.actionHistory = [];
      this.redoStack = [];
      return backup;
    }
    const result = this.purchaseMutationService.resetActivity(
      this.activeRef,
      this.timestamp(),
    );
    this.activeState = result.state;
    this.applyStateToMemory(result.state);
    return backup;
  }

  flushActiveOutbox(): Promise<GasOutboxResult> {
    if (!this.activeRef) {
      return Promise.resolve({ sent: 0, pending: 0, error: null });
    }
    return this.outboxService.process(this.activeRef);
  }

  /** Clear only local holds and their history entries. */
  resetHold(): void {
    if (!this.activeState || !this.activeRef) {
      this.holdList = [];
      this.actionHistory = this.actionHistory.filter(
        (entry) => entry.type !== "hold",
      );
      this.redoStack = [];
      return;
    }
    this.updateActiveState((state, now) => ({
      ...state,
      hold: [],
      history: state.history.filter((entry) => entry.type !== "hold"),
      redo: [],
      timestamps: { ...state.timestamps, updatedAt: now },
    }));
  }

  addHistory(type: ActionType, space: string, _sheetName = ""): void {
    if (type === "purchase") this.addPurchased(space);
    else this.addHold(space);
  }

  getSpreadsheetTitle(): string {
    return this.spreadsheetTitle;
  }

  saveList<T>(key: string, list: readonly T[]): void {
    this.storage.setJson(key, list);
  }

  getUnvisited(): Circle[] {
    return this.wantToBuy.filter(
      (circle) =>
        !this.purchasedList.includes(circle.space) &&
        !this.holdList.includes(circle.space),
    );
  }

  /** Create an explicit preview for the first GAS import into an empty day. */
  async previewInitialGasImport(
    ref: EventDayRef,
    source: GasDataSource,
  ): Promise<GasRefreshPreview> {
    await this.ensureRegistry();
    this.requireRegistered(ref);
    return this.refreshService.previewInitialImport(ref, source);
  }

  /** Create an explicit preview for replacing the configured GAS source. */
  async previewGasSourceReplacement(
    ref: EventDayRef,
    source: GasDataSource,
  ): Promise<GasRefreshPreview> {
    await this.ensureRegistry();
    this.requireRegistered(ref);
    return this.refreshService.previewReplacement(ref, source);
  }

  /** Create an explicit preview for refreshing the configured GAS source. */
  async previewGasRefresh(ref: EventDayRef): Promise<GasRefreshPreview> {
    await this.ensureRegistry();
    this.requireRegistered(ref);
    return this.refreshService.previewRefresh(ref);
  }

  /** Apply a GAS preview and refresh in-memory state when its ref is active. */
  applyGasPreview(previewId: string): LocalEventDayState {
    const applied = this.refreshService.applyPreview(previewId);
    if (this.activeRef) {
      const currentActive = this.repository.load(this.activeRef);
      if (currentActive) {
        this.activeState = currentActive;
        this.applyStateToMemory(currentActive);
      }
    }
    return applied;
  }

  /** Cancel a GAS preview without changing persisted state. */
  cancelGasPreview(previewId: string): void {
    this.refreshService.cancelPreview(previewId);
  }

  /** Start listening for online events and trigger initial background processing. */
  startSyncCoordinator(): void {
    this.syncCoordinator.start();
  }

  /** Process every persisted outbox queue across all event/day states. */
  retryAllPending(): Promise<GasSyncSummary> {
    return this.syncCoordinator.processAll();
  }

  /** Remove the online event listener. */
  disposeSyncCoordinator(): void {
    this.syncCoordinator.dispose();
  }
}
