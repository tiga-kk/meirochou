import type {
  ActiveEventDaySession,
  EventDayRepository,
} from "../../event-day/public-api";
import { applyCircleStatusChange } from "../domain/apply-circle-status-change";
import type {
  ChangeCircleStatusInput,
  ChangeCircleStatusResult,
} from "../domain/circle-status-types";
import { appendPendingGasUpdate } from "../domain/pending-gas-update-state";

export interface PendingGasUpdateBackgroundProcess {
  requestSend(): void;
}

export interface ChangeCircleStatusOptions {
  readonly createPendingGasUpdateId?: () => string;
  readonly createUndoId?: () => string;
}

export class ChangeCircleStatusUseCase {
  constructor(
    private readonly repository: EventDayRepository,
    private readonly activeEventDaySession: ActiveEventDaySession,
    private readonly backgroundProcess?: PendingGasUpdateBackgroundProcess,
    options?: ChangeCircleStatusOptions,
  ) {
    this.createPendingGasUpdateId =
      options?.createPendingGasUpdateId ??
      (() => `pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
    this.createUndoId =
      options?.createUndoId ??
      (() => `undo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  }

  private readonly createPendingGasUpdateId: () => string;
  private readonly createUndoId: () => string;

  execute(input: ChangeCircleStatusInput): ChangeCircleStatusResult {
    const state = this.repository.load(input.eventDay);
    if (!state) {
      throw new Error(
        `State not found for event/day: ${input.eventDay.eventId}:${input.eventDay.dayId}`,
      );
    }

    if (state.sourceGeneration !== input.expectedSourceGeneration) {
      throw new Error("Source generation changed");
    }
    if (!state.circles.some((circle) => circle.space === input.circleSpace)) {
      throw new Error("Circle not found");
    }

    const { state: statusState, previousStatus } = applyCircleStatusChange(
      state,
      input.circleSpace,
      input.nextStatus,
    );

    let nextState = statusState;
    let pendingGasUpdateId: string | null = null;

    if (input.nextStatus === "purchased" || previousStatus === "purchased") {
      const outboxResult = appendPendingGasUpdate(
        statusState,
        input.eventDay,
        input.circleSpace,
        input.nextStatus,
        input.changedAt,
        this.createPendingGasUpdateId,
      );
      nextState = outboxResult.state;
      pendingGasUpdateId = outboxResult.pendingGasUpdateId;
    }

    // Atomic single save
    this.repository.save(input.eventDay, nextState);

    // Update active session if currently open
    const currentSnapshot = this.activeEventDaySession.getActiveEventDay();
    if (
      currentSnapshot &&
      currentSnapshot.ref.eventId === input.eventDay.eventId &&
      currentSnapshot.ref.dayId === input.eventDay.dayId
    ) {
      this.activeEventDaySession.replaceActiveEventDayState(nextState);
    }

    // Trigger background process if pending update queued
    if (pendingGasUpdateId && this.backgroundProcess) {
      this.backgroundProcess.requestSend();
    }

    return {
      state: nextState,
      previousStatus,
      currentStatus: input.nextStatus,
      undoToken: {
        undoId: this.createUndoId(),
        eventDay: { ...input.eventDay },
        circleSpace: input.circleSpace,
        previousStatus,
        currentStatus: input.nextStatus,
        expectedSourceGeneration: input.expectedSourceGeneration,
        createdAt: input.changedAt,
      },
      pendingGasUpdateId,
    };
  }
}
