import type {
  ActiveEventDaySession,
  EventDayRef,
  LocalEventDayState,
} from "../../event-day/public-api";
import type { CircleDataPreview } from "../domain/circle-data-source-types";
import { applySourceDiff } from "../domain/circle-source-diff";
import type { RouteGuidanceInvalidation } from "./route-guidance-invalidation";

export interface ApplyCircleDataPreviewRepository {
  load(ref: EventDayRef): LocalEventDayState | null;
  save(ref: EventDayRef, state: LocalEventDayState): void;
}

export interface ApplyCircleDataPreviewInput {
  readonly previewId: string;
  readonly preview: CircleDataPreview;
}

export class StalePreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StalePreviewError";
    Object.setPrototypeOf(this, StalePreviewError.prototype);
  }
}

export class PendingOutboxError extends Error {
  constructor(count: number) {
    super(`blocked by ${count} pending outbox entries`);
    this.name = "PendingOutboxError";
    Object.setPrototypeOf(this, PendingOutboxError.prototype);
  }
}

/**
 * Applies a CSV preview to the repository.
 * Order of operations:
 * 1. Reload current persisted state;
 * 2. Reject stale generation or expired preview;
 * 3. Preserve circle status under source-diff rules;
 * 4. Save the complete next state once;
 * 5. Update ActiveEventDaySession only after save succeeds;
 * 6. Invalidate route guidance only after durable save;
 * 7. Remove preview only after successful completion.
 */
export class ApplyCircleDataPreviewUseCase {
  private generationSequence = 0;

  constructor(
    private readonly repository: ApplyCircleDataPreviewRepository,
    private readonly activeEventDaySession: ActiveEventDaySession,
    private readonly routeGuidanceInvalidation: RouteGuidanceInvalidation,
    private readonly options: {
      readonly now?: () => string;
      readonly createSourceGeneration?: () => string;
    } = {},
  ) {}

  async execute(
    input: ApplyCircleDataPreviewInput,
  ): Promise<LocalEventDayState> {
    const now = this.options.now ?? (() => new Date().toISOString());
    const createSourceGeneration =
      this.options.createSourceGeneration ??
      (() => `source-${Date.now()}-${++this.generationSequence}`);

    const { preview } = input;

    // Step 1: Reload current persisted state
    const current = this.repository.load(preview.ref);
    if (!current) {
      throw new StalePreviewError("CSV preview source state is missing");
    }
    if (current.gasOutbox.length > 0) {
      throw new PendingOutboxError(current.gasOutbox.length);
    }

    // Step 2: Reject stale generation or expired preview
    if (current.sourceGeneration !== preview.expectedSourceGeneration) {
      throw new StalePreviewError("CSV preview source generation is stale");
    }
    const nowMs = Date.parse(now());
    if (nowMs >= Date.parse(preview.expiresAt)) {
      throw new StalePreviewError("CSV preview has expired");
    }

    // Step 3: Apply source diff (preserves circle status under source-diff rules)
    const applyTimestamp = this.resolveApplyTimestamp(current, now);
    const merged = applySourceDiff(current, preview.newCircles, applyTimestamp);

    // Build the next state with new source generation
    const nextState: LocalEventDayState = {
      ...merged,
      source: { ...(preview.source ?? current.source) },
      sourceGeneration: createSourceGeneration(),
      timestamps: {
        createdAt: current.timestamps.createdAt,
        updatedAt: applyTimestamp,
        sourceUpdatedAt: applyTimestamp,
      },
    };

    // Step 4: Save the complete next state once
    this.repository.save(preview.ref, nextState);

    // Step 5: Update ActiveEventDaySession only after save succeeds
    const activeSnap = this.activeEventDaySession.getActiveEventDay();
    if (
      activeSnap &&
      activeSnap.ref.eventId === preview.ref.eventId &&
      activeSnap.ref.dayId === preview.ref.dayId
    ) {
      this.activeEventDaySession.replaceActiveEventDayState(nextState);
    }

    // Step 6: Invalidate route guidance only after durable save
    await this.routeGuidanceInvalidation.invalidateAfterCircleSourceChange(
      preview.ref,
    );

    return nextState;
  }

  private resolveApplyTimestamp(
    current: LocalEventDayState,
    now: () => string,
  ): string {
    const candidate = now();
    const currentMax = Math.max(
      Date.parse(current.timestamps.updatedAt),
      Date.parse(current.timestamps.sourceUpdatedAt),
    );
    const candidateMs = Date.parse(candidate);
    if (candidateMs > currentMax) return candidate;
    return new Date(currentMax + 1).toISOString();
  }
}
