import type {
  ActiveEventDaySession,
  EventDayRepository,
  LocalEventDayState,
} from "../../event-day/public-api";
import { applyCircleStatusChange } from "../domain/apply-circle-status-change";
import type { CircleStatusUndoToken } from "../domain/circle-status-types";
import { appendPendingGasUpdate } from "../domain/pending-gas-update-state";

export interface UndoCircleStatusChangeInput {
  readonly undoToken: CircleStatusUndoToken;
}

export class UndoCircleStatusChangeUseCase {
  private readonly createPendingGasUpdateId: () => string;
  private readonly now: () => string;
  private readonly ttlMs: number;
  private readonly consumedUndoIds = new Set<string>();

  constructor(
    private readonly repository: EventDayRepository,
    private readonly activeEventDaySession: ActiveEventDaySession,
    createPendingGasUpdateId?: () => string,
    options?: { readonly now?: () => string; readonly ttlMs?: number },
  ) {
    let sequence = 0;
    this.createPendingGasUpdateId =
      createPendingGasUpdateId || (() => `pending-${Date.now()}-${sequence++}`);
    this.now = options?.now ?? (() => new Date().toISOString());
    this.ttlMs = options?.ttlMs ?? 5000;
  }

  execute(input: UndoCircleStatusChangeInput): {
    readonly state: LocalEventDayState;
  } {
    const { undoToken } = input;
    if (this.consumedUndoIds.has(undoToken.undoId)) {
      throw new Error("Undo token has already been consumed");
    }
    const ageMs = Date.parse(this.now()) - Date.parse(undoToken.createdAt);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > this.ttlMs) {
      throw new Error("Undo token has expired");
    }
    const state = this.repository.load(undoToken.eventDay);
    if (!state) {
      throw new Error("State not found");
    }

    if (state.sourceGeneration !== undoToken.expectedSourceGeneration) {
      throw new Error("Source generation changed");
    }

    const currentStatus =
      state.circleStates[undoToken.circleSpace] ?? "pending";
    if (currentStatus !== undoToken.currentStatus) {
      throw new Error("Circle status has changed since undo token creation");
    }

    const { state: statusState } = applyCircleStatusChange(
      state,
      undoToken.circleSpace,
      undoToken.previousStatus,
    );

    let nextState = statusState;
    if (
      undoToken.currentStatus === "purchased" ||
      undoToken.previousStatus === "purchased"
    ) {
      const outboxResult = appendPendingGasUpdate(
        statusState,
        undoToken.eventDay,
        undoToken.circleSpace,
        undoToken.previousStatus,
        this.now(),
        this.createPendingGasUpdateId,
      );
      nextState = outboxResult.state;
    }

    this.repository.save(undoToken.eventDay, nextState);
    this.consumedUndoIds.add(undoToken.undoId);

    const snapshot = this.activeEventDaySession.getActiveEventDay();
    if (
      snapshot &&
      snapshot.ref.eventId === undoToken.eventDay.eventId &&
      snapshot.ref.dayId === undoToken.eventDay.dayId
    ) {
      this.activeEventDaySession.replaceActiveEventDayState(nextState);
    }

    return { state: nextState };
  }
}
