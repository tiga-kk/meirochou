import { GasApiClient } from "./api/gas-api-client";
import { Config } from "./config.js";
import { parseCircleCsv, serializeCircleCsv } from "./data/csv-circle-codec";
import {
  type LoadedEventRegistry,
  loadEventRegistryWithUrl,
} from "./data/event-registry";
import { GasRefreshService } from "./data/gas-refresh-service";
import {
  decodeLegacyCircles,
  decodeLegacyHistory,
  decodeLegacyStringList,
  extractLegacyCircleRows,
} from "./data/local-state-adapters";
import { applySourceDiff, diffCircleSources } from "./data/source-diff";
import { GasPendingUpdateDelivery } from "./features/circle-status/infrastructure/gas-pending-update-delivery";
import type {
  CircleStatusControllerPort,
  PendingGasUpdateBackgroundProcess,
  PendingGasUpdatesControllerPort,
} from "./features/circle-status/public-api";
import { CircleStatusController } from "./features/circle-status/ui/circle-status-controller";
import { PendingGasUpdatesController } from "./features/circle-status/ui/pending-gas-updates-controller";
import { ChangeCircleStatusUseCase } from "./features/circle-status/use-cases/change-circle-status";
import { DiscardPendingGasUpdatesUseCase } from "./features/circle-status/use-cases/discard-pending-gas-updates";
import { DefaultPendingGasUpdateBackgroundProcess } from "./features/circle-status/use-cases/pending-gas-update-background-process";
import { SendPendingGasUpdatesUseCase } from "./features/circle-status/use-cases/send-pending-gas-updates";
import { UndoCircleStatusChangeUseCase } from "./features/circle-status/use-cases/undo-circle-status-change";
import { LocalStorageEventDayRepository } from "./features/event-day/infrastructure/local-storage-event-day-repository";
import type { EventDayRepository } from "./features/event-day/public-api";
import {
  type ActiveEventDayReader,
  type ActiveEventDaySession,
  createActiveEventDayReader,
  createActiveEventDaySession,
} from "./features/event-day/public-api";
import { EventDayTransitionService } from "./state/event-day-transition-service";
import {
  SourceSettingsService,
  StaleSourceStateError,
} from "./state/source-settings-service";
import {
  createEmptyEventDayState,
  getCircleVisitState,
} from "./state/storage-schema";
import { StorageService } from "./state/storage-service.js";
import type {
  ActionHistoryEntry,
  ActionType,
  Circle,
  CircleRecord,
  CsvIssue,
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
  readonly storage?: StorageService;
  readonly now?: () => Date;
  readonly createSourceGeneration?: () => string;
  readonly createPreviewId?: () => string;
  readonly previewTtlMs?: number;
  readonly client?: GasApiClient;
  readonly repository?: EventDayRepository;
  readonly sourceSettings?: SourceSettingsService;
  readonly refreshService?: GasRefreshService;
  readonly activeEventDaySession?: ActiveEventDaySession;
  readonly activeEventDayReader?: ActiveEventDayReader;
  readonly circleStatusController?: CircleStatusControllerPort;
  readonly pendingGasUpdatesController?: PendingGasUpdatesControllerPort;
  readonly backgroundProcess?: PendingGasUpdateBackgroundProcess;
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

/** Preserves structured CSV diagnostics without collapsing them at the service boundary. */
export class CsvValidationError extends Error {
  readonly issues: readonly CsvIssue[];

  constructor(issues: readonly CsvIssue[]) {
    const summary = issues.map((i) => i.message).join("; ");
    super(`CSV validation error: ${summary}`);
    this.name = "CsvValidationError";
    this.issues = Object.freeze([...issues]);
    Object.setPrototypeOf(this, CsvValidationError.prototype);
  }
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
  readonly circleStatusController?: CircleStatusControllerPort;
  readonly pendingGasUpdatesController?: PendingGasUpdatesControllerPort;
  readonly backgroundProcess?: PendingGasUpdateBackgroundProcess;
  readonly activeEventDaySession: ActiveEventDaySession;
  readonly activeEventDayReader: ActiveEventDayReader;
  readonly csvPreviews = new Map<string, CsvPreviewRecord>();

  get wantToBuy(): Circle[] {
    return [...this.activeEventDayReader.getAllCircles()];
  }
  get purchasedList(): string[] {
    return [...this.activeEventDayReader.getPurchasedCircleSpaces()];
  }
  get holdList(): string[] {
    return [...this.activeEventDayReader.getHeldCircleSpaces()];
  }
  get activeRef(): EventDayRef | null {
    return this.activeEventDaySession.getActiveEventDay()?.ref ?? null;
  }
  get activeState(): LocalEventDayState | null {
    return this.activeEventDaySession.getActiveEventDay()?.state ?? null;
  }
  spreadsheetTitle = "";
  actionHistory: ActionHistoryEntry[] = [];
  redoStack: ActionHistoryEntry[] = [];
  eventRegistry: EventRegistryV1 | null = null;

  private readonly now: () => Date;
  private readonly createSourceGeneration: () => string;
  private readonly createPreviewId: () => string;
  private readonly previewTtlMs: number;
  private readonly legacyPreviews = new Map<string, LegacyPreviewRecord>();

  constructor(storage?: StorageService, options: DataManagerOptions = {}) {
    this.storage = storage || options.storage || new StorageService();
    this.activeEventDaySession =
      options.activeEventDaySession ?? createActiveEventDaySession();
    this.activeEventDayReader =
      options.activeEventDayReader ??
      createActiveEventDayReader(this.activeEventDaySession);
    this.repository =
      options.repository || new LocalStorageEventDayRepository(this.storage);
    this.sourceSettings =
      options.sourceSettings || new SourceSettingsService(this.repository);
    this.client = options.client || new GasApiClient();
    const delivery = new GasPendingUpdateDelivery(this.client);
    const sendPendingGasUpdates = new SendPendingGasUpdatesUseCase(
      this.repository,
      this.activeEventDaySession,
      delivery,
    );
    const discardPendingGasUpdates = new DiscardPendingGasUpdatesUseCase(
      this.repository,
      this.activeEventDaySession,
    );
    this.backgroundProcess =
      options.backgroundProcess ||
      new DefaultPendingGasUpdateBackgroundProcess(sendPendingGasUpdates);
    const changeCircleStatus = new ChangeCircleStatusUseCase(
      this.repository,
      this.activeEventDaySession,
      this.backgroundProcess,
    );
    const undoCircleStatus = new UndoCircleStatusChangeUseCase(
      this.repository,
      this.activeEventDaySession,
    );
    this.circleStatusController =
      options.circleStatusController ||
      new CircleStatusController(changeCircleStatus, undoCircleStatus);
    this.pendingGasUpdatesController =
      options.pendingGasUpdatesController ||
      new PendingGasUpdatesController(
        sendPendingGasUpdates,
        discardPendingGasUpdates,
      );

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
    this.activeEventDaySession.setActiveEventDay(ref, state);
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

  private applyStateToMemory(_state: LocalEventDayState): void {
    this.spreadsheetTitle = "";
    this.actionHistory = [];
    this.redoStack = [];
  }

  private persistState(state: LocalEventDayState): LocalEventDayState {
    if (!this.activeRef) throw new Error("No event/day is open");
    this.repository.save(this.activeRef, state);
    this.activeEventDaySession.replaceActiveEventDayState(state);
    this.applyStateToMemory(state);
    return state;
  }

  private parseCsv(text: string): readonly CircleRecord[] {
    const result = parseCircleCsv(text);
    if (!result.ok) {
      throw new CsvValidationError(result.issues);
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
      this.repository.saveAndRememberLastOpened(ref, state);
    } else {
      this.repository.rememberLastOpenedEventDay(ref);
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
        Object.keys(current.circleStates).length > 0)
    ) {
      throw new Error("Initial CSV import requires an empty state");
    }

    const circles = this.parseCsv(text);
    const now = this.timestamp();
    const circleStates: Record<string, "purchased"> = {};
    circles
      .filter((circle) => circle.isSale?.toLowerCase() === "x")
      .forEach((circle) => {
        circleStates[circle.space] = "purchased";
      });

    const state: LocalEventDayState = {
      schemaVersion: 2,
      source: { type: "csv", fileName },
      sourceGeneration: this.createSourceGeneration(),
      circles,
      circleStates,
      gasOutbox: [],
      timestamps: {
        createdAt: current?.timestamps.createdAt || now,
        updatedAt: now,
        sourceUpdatedAt: now,
      },
    };
    this.repository.save(ref, state);
    if (sameRef(this.activeRef, ref)) {
      this.activeEventDaySession.replaceActiveEventDayState(state);
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
      this.activeEventDaySession.replaceActiveEventDayState(nextState);
      this.applyStateToMemory(nextState);
    }
    return nextState;
  }

  /** Cancel a CSV preview without changing persisted state. */
  cancelCsvPreview(previewId: string): void {
    this.csvPreviews.delete(previewId);
  }

  /** Export the validated local snapshot, excluding source rows removed from source. */
  exportCsv(ref: EventDayRef): string {
    const state = this.repository.load(ref);
    if (!state) throw new Error("Event day state not found");
    const activeCircles = state.circles.filter(
      (circle) => !circle.removedFromSource,
    );
    const purchasedSet = new Set(
      Object.entries(state.circleStates)
        .filter(([_, s]) => s === "purchased")
        .map(([space]) => space),
    );
    return serializeCircleCsv(activeCircles, purchasedSet);
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
    const circleStates: Record<string, "purchased" | "held"> = {};
    for (const space of preview.purchased) {
      circleStates[space] = "purchased";
    }
    for (const space of preview.hold) {
      if (!circleStates[space]) {
        circleStates[space] = "held";
      }
    }

    const state: LocalEventDayState = {
      schemaVersion: 2,
      source: { type: "csv", fileName: "legacy_imported.csv" },
      sourceGeneration: this.createSourceGeneration(),
      circles: preview.circles,
      circleStates,
      gasOutbox: [],
      timestamps: { createdAt: now, updatedAt: now, sourceUpdatedAt: now },
    };
    this.repository.save(target, state);
    this.legacyPreviews.delete(previewId);
    if (sameRef(this.activeRef, target)) {
      this.activeEventDaySession.replaceActiveEventDayState(state);
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

  /**
   * Keep legacy local actions usable before an event/day is opened by placing
   * them in a non-persisted session bucket. The browser flow opens a real ref
   * before any normal action, so this only serves compatibility callers.
   */
  private activateLegacySession(space: string, status: "purchased" | "held") {
    const ref: EventDayRef = { eventId: "legacy-session", dayId: "default" };
    const current = this.activeEventDaySession.getActiveEventDay();
    const circles = current?.state.circles ?? [];
    const circleStates = { ...(current?.state.circleStates ?? {}) };
    const hasCircle = circles.some((circle) => circle.space === space);
    circleStates[space] = status;
    this.activeEventDaySession.setActiveEventDay(ref, {
      schemaVersion: 2,
      source: { type: "csv", fileName: "legacy-session.csv" },
      sourceGeneration: "legacy-session",
      circles: hasCircle ? circles : [...circles, { space }],
      circleStates,
      gasOutbox: [],
      timestamps: {
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
        sourceUpdatedAt: "1970-01-01T00:00:00.000Z",
      },
    });
  }

  setPurchased(space: string, purchased: boolean): PurchaseMutationResult {
    if (!this.activeRef || !this.activeState)
      throw new Error("No event/day is open");
    if (this.circleStatusController) {
      const res = this.circleStatusController.changeStatus({
        eventDay: this.activeRef,
        circleSpace: space,
        nextStatus: purchased ? "purchased" : "pending",
        expectedSourceGeneration: this.activeState.sourceGeneration,
      });
      const nextState = res.state as LocalEventDayState;
      this.applyStateToMemory(nextState);
      return {
        state: nextState,
        queuedEntryId: res.pendingGasUpdateId,
        pendingCount: nextState.gasOutbox.length,
      };
    }
    return { state: this.activeState, queuedEntryId: null, pendingCount: 0 };
  }

  /** Store a local purchase without contacting GAS. */
  addPurchased(space: string, _sheetName = ""): void {
    if (
      !this.activeState ||
      !this.activeRef ||
      this.activeRef.eventId === "legacy-session"
    ) {
      this.activateLegacySession(space, "purchased");
      return;
    }
    this.setPurchased(space, true);
  }

  /** Store a local hold without contacting GAS. */
  addHold(space: string, _sheetName = ""): void {
    if (
      !this.activeState ||
      !this.activeRef ||
      this.activeRef.eventId === "legacy-session"
    ) {
      this.activateLegacySession(space, "held");
      return;
    }
    if (this.circleStatusController) {
      this.circleStatusController.changeStatus({
        eventDay: this.activeRef,
        circleSpace: space,
        nextStatus: "held",
        expectedSourceGeneration: this.activeState.sourceGeneration,
      });
      const updated = this.activeState;
      if (updated) {
        this.applyStateToMemory(updated);
      }
    }
  }

  /** Undo functionality is deprecated in favor of short-lived memory tokens. */
  undoLastAction(): ActionHistoryEntry | null {
    return null;
  }

  /** Redo functionality is deprecated. */
  redoAction(): ActionHistoryEntry | null {
    return null;
  }

  /** Clear local purchase and hold state while retaining the source snapshot. */
  resetAll(): string[] {
    const backup = [...this.purchasedList];
    if (!this.activeState || !this.activeRef) {
      this.actionHistory = [];
      this.redoStack = [];
      return backup;
    }
    const currentSpaces = Object.keys(this.activeState.circleStates);
    if (this.circleStatusController) {
      for (const space of currentSpaces) {
        this.circleStatusController.changeStatus({
          eventDay: this.activeRef,
          circleSpace: space,
          nextStatus: "pending",
          expectedSourceGeneration: this.activeState.sourceGeneration,
        });
      }
      this.applyStateToMemory(this.activeState);
    }
    return backup;
  }

  async flushActiveOutbox(): Promise<GasOutboxResult> {
    if (!this.activeRef) {
      return { sent: 0, pending: 0, error: null };
    }
    if (this.pendingGasUpdatesController) {
      const processed = await this.pendingGasUpdatesController.retryAll(
        this.activeRef,
      );
      return {
        sent: processed,
        pending: this.activeState?.gasOutbox.length ?? 0,
        error: null,
      };
    }
    return { sent: 0, pending: 0, error: null };
  }

  /** Discard selected outbox entries and keep the active in-memory state in sync. */
  discardOutboxEntries(
    ref: EventDayRef,
    ids: readonly string[],
    _now: string,
  ): LocalEventDayState {
    if (this.pendingGasUpdatesController) {
      for (const id of ids) {
        this.pendingGasUpdatesController.discardOne(ref, id);
      }
    }
    const state = this.repository.load(ref);
    if (state) return state;
    if (this.activeState) return this.activeState;
    throw new Error("Event/day state is unavailable after outbox discard");
  }

  /** Clear only local holds and their history entries. */
  resetHold(): void {
    if (!this.activeState || !this.activeRef) {
      this.actionHistory = this.actionHistory.filter(
        (entry) => entry.type !== "hold",
      );
      this.redoStack = [];
      return;
    }
    this.updateActiveState((state, now) => {
      const nextCircleStates = { ...state.circleStates };
      for (const [space, visitState] of Object.entries(nextCircleStates)) {
        if (visitState === "held") {
          delete nextCircleStates[space];
        }
      }
      return {
        ...state,
        circleStates: Object.freeze(nextCircleStates),
        timestamps: { ...state.timestamps, updatedAt: now },
      };
    });
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
    if (this.activeState) {
      return this.wantToBuy.filter(
        (circle) =>
          getCircleVisitState(
            this.activeState?.circleStates ?? {},
            circle.space,
          ) === "pending",
      );
    }
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
        this.activeEventDaySession.replaceActiveEventDayState(currentActive);
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
    if (this.backgroundProcess) {
      this.backgroundProcess.start();
    }
  }

  /** Process every persisted outbox queue across all event/day states. */
  async retryAllPending(): Promise<GasSyncSummary> {
    if (this.pendingGasUpdatesController) {
      const sent = await this.pendingGasUpdatesController.retryAll();
      return { processedRefs: 1, sent, pending: 0, failures: [] };
    }
    return { processedRefs: 0, sent: 0, pending: 0, failures: [] };
  }

  /** Remove the online event listener. */
  disposeSyncCoordinator(): void {
    if (this.backgroundProcess) {
      this.backgroundProcess.stop();
    }
  }
}
