import type { GasApiClient } from "../api/gas-api-client";
import type { EventDayRepository } from "../state/event-day-repository";
import type { SourceSettingsService } from "../state/source-settings-service";
import type {
  Circle,
  CircleRecord,
  EventDayRef,
  GasDataSource,
  GasRefreshPreview,
  LocalEventDayState,
  ProtectedSourceOperation,
} from "../types/domain";
import { applySourceDiff, diffCircleSources } from "./source-diff";
import { fingerprintSourceSnapshot } from "./source-snapshot";

/** Configure clock, identifiers, and preview lifetime for GAS previews. */
export interface GasRefreshServiceOptions {
  readonly now?: () => Date;
  readonly createPreviewId?: () => string;
  readonly createSourceGeneration?: () => string;
  readonly previewTtlMs?: number;
}

/** Raised when a GAS preview can no longer be safely applied. */
export class StaleGasPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleGasPreviewError";
    Object.setPrototypeOf(this, StaleGasPreviewError.prototype);
  }
}

interface GasPreviewRecord {
  readonly preview: GasRefreshPreview;
  readonly fetchedCircles: readonly CircleRecord[];
}

function sameSource(
  left: LocalEventDayState["source"],
  right: GasDataSource,
): boolean {
  if (left.type !== right.type) return false;
  return left.gasUrl === right.gasUrl && left.sheetName === right.sheetName;
}

function cloneGasSource(source: GasDataSource): GasDataSource {
  return {
    type: "gas",
    gasUrl: source.gasUrl,
    sheetName: source.sheetName,
  };
}

function resolvePreviewOperation(
  preview: GasRefreshPreview,
): ProtectedSourceOperation {
  if (preview.mode === "refresh") {
    if (preview.replacementOperation !== null) {
      throw new StaleGasPreviewError(
        "Refresh preview cannot contain a replacement operation",
      );
    }
    return "gas-refresh-apply";
  }

  if (preview.mode === "initial") {
    if (preview.replacementOperation !== "gas-initial-import") {
      throw new StaleGasPreviewError(
        "Initial preview must use the GAS initial import operation",
      );
    }
    return preview.replacementOperation;
  }

  if (preview.mode === "replacement") {
    if (
      preview.replacementOperation === null ||
      preview.replacementOperation === "gas-initial-import"
    ) {
      throw new StaleGasPreviewError(
        "Replacement preview must use a non-initial replacement operation",
      );
    }
    return preview.replacementOperation;
  }

  throw new StaleGasPreviewError("Unknown GAS preview mode");
}

function gasCircleToRecord(c: Circle): CircleRecord {
  const priority =
    typeof c.priority === "number"
      ? c.priority
      : typeof c.priority === "string" &&
          !Number.isNaN(Number(c.priority)) &&
          c.priority.trim() !== ""
        ? Number(c.priority)
        : undefined;

  const record: CircleRecord = {
    space: String(c.space),
    ...(priority !== undefined ? { priority } : {}),
    ...(typeof c.account === "string" && c.account
      ? { account: c.account }
      : {}),
    ...(typeof c.tweet === "string" && c.tweet ? { tweet: c.tweet } : {}),
    ...(typeof c.memo === "string" && c.memo ? { memo: c.memo } : {}),
    ...(typeof c.isSale === "string" && c.isSale ? { isSale: c.isSale } : {}),
  };
  return record;
}

/** Owns explicit GAS GET previews and guarded source updates. */
export class GasRefreshService {
  private readonly previews = new Map<string, GasPreviewRecord>();
  private readonly now: () => Date;
  private readonly createPreviewId: () => string;
  private readonly createSourceGeneration: () => string;
  private readonly previewTtlMs: number;

  constructor(
    private readonly repository: EventDayRepository,
    private readonly client: GasApiClient,
    private readonly sourceSettings: SourceSettingsService,
    options?: GasRefreshServiceOptions,
  ) {
    let previewSeq = 0;
    let genSeq = 0;
    this.now = options?.now ?? (() => new Date());
    this.createPreviewId =
      options?.createPreviewId ??
      (() => `gas-preview-${Date.now()}-${++previewSeq}`);
    this.createSourceGeneration =
      options?.createSourceGeneration ??
      (() => `gas-gen-${Date.now()}-${++genSeq}`);
    this.previewTtlMs = options?.previewTtlMs ?? 5 * 60 * 1000;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private requireState(ref: EventDayRef): LocalEventDayState {
    const state = this.repository.load(ref);
    if (!state) {
      throw new Error(
        `Event/Day state not found for ${ref.eventId}/${ref.dayId}`,
      );
    }
    return state;
  }

  /** Fetch and stage a preview for the empty CSV sentinel. */
  async previewInitialImport(
    ref: EventDayRef,
    source: GasDataSource,
    signal?: AbortSignal,
  ): Promise<GasRefreshPreview> {
    const state = this.requireState(ref);
    const previewSource = cloneGasSource(source);

    if (
      state.source.type !== "csv" ||
      state.source.fileName !== "empty.csv" ||
      state.circles.length > 0 ||
      state.purchased.length > 0 ||
      state.hold.length > 0 ||
      state.history.length > 0 ||
      state.redo.length > 0 ||
      state.gasOutbox.length > 0
    ) {
      throw new Error("Initial GAS import requires an empty sentinel state");
    }

    const fetched = await this.client.fetchCircles(
      previewSource.gasUrl,
      previewSource.sheetName,
      signal,
    );
    const fetchedCircles = fetched.circles.map(gasCircleToRecord);
    const diff = diffCircleSources(state.circles, fetchedCircles);

    const nowMs = this.now().getTime();
    const previewId = this.createPreviewId();
    const preview: GasRefreshPreview = {
      previewId,
      ref: { eventId: ref.eventId, dayId: ref.dayId },
      mode: "initial",
      replacementOperation: "gas-initial-import",
      expectedSourceGeneration: state.sourceGeneration,
      expectedSnapshotHash: fingerprintSourceSnapshot(state),
      source: previewSource,
      spreadsheetTitle: fetched.spreadsheetTitle,
      diff,
      fetchedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + this.previewTtlMs).toISOString(),
    };

    this.previews.set(previewId, { preview, fetchedCircles });
    return preview;
  }

  /** Fetch and stage a preview for a new GAS source configuration. */
  async previewReplacement(
    ref: EventDayRef,
    source: GasDataSource,
    signal?: AbortSignal,
  ): Promise<GasRefreshPreview> {
    const state = this.requireState(ref);
    const previewSource = cloneGasSource(source);

    if (sameSource(state.source, previewSource)) {
      throw new Error(
        "Replacement source is identical to current source, use refresh instead",
      );
    }

    let operation: ProtectedSourceOperation;
    if (state.source.type !== previewSource.type) {
      operation = "source-type-change";
    } else if (state.source.gasUrl !== previewSource.gasUrl) {
      operation = "gas-url-change";
    } else if (state.source.sheetName !== previewSource.sheetName) {
      operation = "sheet-name-change";
    } else {
      operation = "gas-url-change";
    }

    const fetched = await this.client.fetchCircles(
      previewSource.gasUrl,
      previewSource.sheetName,
      signal,
    );
    const fetchedCircles = fetched.circles.map(gasCircleToRecord);
    const diff = diffCircleSources(state.circles, fetchedCircles);

    const nowMs = this.now().getTime();
    const previewId = this.createPreviewId();
    const preview: GasRefreshPreview = {
      previewId,
      ref: { eventId: ref.eventId, dayId: ref.dayId },
      mode: "replacement",
      replacementOperation: operation as Extract<
        ProtectedSourceOperation,
        | "gas-initial-import"
        | "gas-url-change"
        | "sheet-name-change"
        | "source-type-change"
      >,
      expectedSourceGeneration: state.sourceGeneration,
      expectedSnapshotHash: fingerprintSourceSnapshot(state),
      source: previewSource,
      spreadsheetTitle: fetched.spreadsheetTitle,
      diff,
      fetchedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + this.previewTtlMs).toISOString(),
    };

    this.previews.set(previewId, { preview, fetchedCircles });
    return preview;
  }

  /** Fetch and stage a preview for the configured GAS source. */
  async previewRefresh(
    ref: EventDayRef,
    signal?: AbortSignal,
  ): Promise<GasRefreshPreview> {
    const state = this.requireState(ref);
    if (state.source.type !== "gas") {
      throw new Error("Refresh requires a GAS source");
    }

    const source = cloneGasSource(state.source);
    const fetched = await this.client.fetchCircles(
      source.gasUrl,
      source.sheetName,
      signal,
    );
    const fetchedCircles = fetched.circles.map(gasCircleToRecord);
    const diff = diffCircleSources(state.circles, fetchedCircles);

    const nowMs = this.now().getTime();
    const previewId = this.createPreviewId();
    const preview: GasRefreshPreview = {
      previewId,
      ref: { eventId: ref.eventId, dayId: ref.dayId },
      mode: "refresh",
      replacementOperation: null,
      expectedSourceGeneration: state.sourceGeneration,
      expectedSnapshotHash: fingerprintSourceSnapshot(state),
      source,
      spreadsheetTitle: fetched.spreadsheetTitle,
      diff,
      fetchedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + this.previewTtlMs).toISOString(),
    };

    this.previews.set(previewId, { preview, fetchedCircles });
    return preview;
  }

  /** Apply one memory-only preview after all source safety checks pass. */
  applyPreview(previewId: string): LocalEventDayState {
    const record = this.previews.get(previewId);
    if (!record) {
      throw new StaleGasPreviewError(
        "GAS refresh preview is missing or already applied",
      );
    }

    const { preview, fetchedCircles } = record;

    if (this.now().getTime() >= Date.parse(preview.expiresAt)) {
      this.previews.delete(previewId);
      throw new StaleGasPreviewError("GAS refresh preview has expired");
    }

    const latest = this.repository.load(preview.ref);
    if (!latest) {
      this.previews.delete(previewId);
      throw new StaleGasPreviewError("Target state is missing");
    }

    if (latest.sourceGeneration !== preview.expectedSourceGeneration) {
      this.previews.delete(previewId);
      throw new StaleGasPreviewError(
        `Source generation mismatch: expected ${preview.expectedSourceGeneration}, got ${latest.sourceGeneration}`,
      );
    }

    if (fingerprintSourceSnapshot(latest) !== preview.expectedSnapshotHash) {
      this.previews.delete(previewId);
      throw new StaleGasPreviewError("Source snapshot fingerprint mismatch");
    }

    const nowStr = this.timestamp();
    const currentMaxTimestamp = Math.max(
      Date.parse(latest.timestamps.updatedAt),
      Date.parse(latest.timestamps.sourceUpdatedAt),
    );
    const applyTimestamp =
      Date.parse(nowStr) > currentMaxTimestamp
        ? nowStr
        : new Date(currentMaxTimestamp + 1).toISOString();

    // In refresh mode, isSale flags in remote do not add new purchases
    // In initial mode, isSale flags in remote do add initial purchases
    const merged =
      preview.mode === "refresh"
        ? {
            ...applySourceDiff(latest, fetchedCircles, applyTimestamp),
            purchased: latest.purchased,
            history: latest.history,
          }
        : applySourceDiff(latest, fetchedCircles, applyTimestamp);

    const isReplacement = preview.mode !== "refresh";
    const nextStateDraft: LocalEventDayState = {
      ...merged,
      source: preview.source,
      sourceGeneration: isReplacement
        ? this.createSourceGeneration()
        : latest.sourceGeneration,
    };

    const operation = resolvePreviewOperation(preview);

    const finalState = this.sourceSettings.saveGuarded({
      ref: preview.ref,
      operation,
      expectedSourceGeneration: preview.expectedSourceGeneration,
      nextState: nextStateDraft,
    });

    this.previews.delete(previewId);
    return finalState;
  }

  /** Discard a staged preview without changing persisted state. */
  cancelPreview(previewId: string): void {
    this.previews.delete(previewId);
  }
}
