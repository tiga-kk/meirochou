import type { EventDayRepository } from "../features/event-day/use-cases/event-day-repository";
import type {
  CircleVisitState,
  EventDayRef,
  LocalEventDayState,
  PurchaseMutationResult,
} from "../types/domain";
import type { GasOutboxService } from "./gas-outbox-service";
import {
  getCircleVisitState,
  transitionCircleVisitState,
} from "./storage-schema";

/** Applies local activity transitions and atomically appends GAS desired states. */
export class PurchaseMutationService {
  constructor(
    private readonly repository: EventDayRepository,
    private readonly outbox: GasOutboxService,
  ) {}

  private requireState(ref: EventDayRef): LocalEventDayState {
    const state = this.repository.load(ref);
    if (!state) {
      throw new Error(
        `Event/Day state not found for ${ref.eventId}/${ref.dayId}`,
      );
    }
    return state;
  }

  /** Change circle visit state directly based on allowed state transitions. */
  setCircleState(
    ref: EventDayRef,
    space: string,
    requestedState: CircleVisitState,
    now: string,
  ): PurchaseMutationResult {
    const trimmedSpace = space.trim();
    if (!trimmedSpace) {
      throw new Error("Space must be a non-empty string");
    }

    const state = this.requireState(ref);
    const currentState = getCircleVisitState(state.circleStates, trimmedSpace);

    if (currentState === requestedState) {
      return {
        state,
        pendingCount: state.gasOutbox.length,
        queuedEntryId: null,
      };
    }

    const nextVisitState = transitionCircleVisitState(
      currentState,
      requestedState,
    );

    const nextCircleStates = { ...state.circleStates };
    if (nextVisitState === "pending") {
      delete nextCircleStates[trimmedSpace];
    } else {
      nextCircleStates[trimmedSpace] = nextVisitState;
    }

    const nextStateDraft: LocalEventDayState = {
      ...state,
      circleStates: Object.freeze(nextCircleStates),
      timestamps: {
        ...state.timestamps,
        updatedAt: now,
      },
    };

    // Only append to GAS outbox when purchased state is involved
    const isPurchasedTransition =
      currentState === "purchased" || requestedState === "purchased";

    if (state.source.type === "gas" && isPurchasedTransition) {
      const isPurchased = requestedState === "purchased";
      const appended = this.outbox.append(
        nextStateDraft,
        ref,
        trimmedSpace,
        isPurchased,
        now,
      );
      this.repository.save(ref, appended.state);
      return {
        state: appended.state,
        pendingCount: appended.state.gasOutbox.length,
        queuedEntryId: appended.entry.id,
      };
    }

    this.repository.save(ref, nextStateDraft);
    return {
      state: nextStateDraft,
      pendingCount: nextStateDraft.gasOutbox.length,
      queuedEntryId: null,
    };
  }

  /** Persist a purchase or explicit cancellation before any remote processing. */
  setPurchased(
    ref: EventDayRef,
    space: string,
    purchased: boolean,
    now: string,
  ): PurchaseMutationResult {
    const requestedState: CircleVisitState = purchased
      ? "purchased"
      : "pending";
    return this.setCircleState(ref, space, requestedState, now);
  }

  /** Clear local activity and queue false for every purchased GAS space. */
  resetActivity(ref: EventDayRef, now: string): PurchaseMutationResult {
    const state = this.requireState(ref);
    const previouslyPurchased = Object.entries(state.circleStates)
      .filter(([_, s]) => s === "purchased")
      .map(([space]) => space);

    const nextStateDraft: LocalEventDayState = {
      ...state,
      circleStates: {},
      timestamps: {
        ...state.timestamps,
        updatedAt: now,
      },
    };

    if (state.source.type === "gas" && previouslyPurchased.length > 0) {
      let currentState = nextStateDraft;
      let lastQueuedId: string | null = null;

      for (const space of previouslyPurchased) {
        const appended = this.outbox.append(
          currentState,
          ref,
          space,
          false,
          now,
        );
        currentState = appended.state;
        lastQueuedId = appended.entry.id;
      }

      this.repository.save(ref, currentState);
      return {
        state: currentState,
        pendingCount: currentState.gasOutbox.length,
        queuedEntryId: lastQueuedId,
      };
    }

    this.repository.save(ref, nextStateDraft);
    return {
      state: nextStateDraft,
      pendingCount: nextStateDraft.gasOutbox.length,
      queuedEntryId: null,
    };
  }
}
