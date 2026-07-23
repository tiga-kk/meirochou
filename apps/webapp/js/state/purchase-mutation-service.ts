import type {
  EventDayRef,
  HistoryEntry,
  LocalEventDayState,
  PurchaseMutationResult,
} from "../types/domain";
import type { EventDayRepository } from "./event-day-repository";
import type { GasOutboxService } from "./gas-outbox-service";

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

  /** Persist a purchase or explicit cancellation before any remote processing. */
  setPurchased(
    ref: EventDayRef,
    space: string,
    purchased: boolean,
    now: string,
  ): PurchaseMutationResult {
    const trimmedSpace = space.trim();
    if (!trimmedSpace) {
      throw new Error("Space must be a non-empty string");
    }

    const state = this.requireState(ref);

    if (purchased) {
      if (state.purchased.includes(trimmedSpace)) {
        return {
          state,
          pendingCount: state.gasOutbox.length,
          queuedEntryId: null,
        };
      }
    } else {
      if (!state.purchased.includes(trimmedSpace)) {
        return {
          state,
          pendingCount: state.gasOutbox.length,
          queuedEntryId: null,
        };
      }
    }

    let nextPurchased: string[];
    let nextHold: string[];
    let historyEntry: HistoryEntry;

    if (purchased) {
      nextPurchased = [...state.purchased, trimmedSpace];
      nextHold = [...state.hold];
      historyEntry = {
        type: "purchase",
        space: trimmedSpace,
        timestamp: now,
      };
    } else {
      nextPurchased = state.purchased.filter((s) => s !== trimmedSpace);
      nextHold = [...state.hold];
      historyEntry = {
        type: "unpurchase",
        space: trimmedSpace,
        timestamp: now,
      };
    }

    const nextStateDraft: LocalEventDayState = {
      ...state,
      purchased: nextPurchased,
      hold: nextHold,
      history: [...state.history, historyEntry],
      redo: [],
      timestamps: {
        ...state.timestamps,
        updatedAt: now,
      },
    };

    if (state.source.type === "gas") {
      const appended = this.outbox.append(
        nextStateDraft,
        ref,
        trimmedSpace,
        purchased,
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
      pendingCount: 0,
      queuedEntryId: null,
    };
  }

  /** Undo the latest activity entry and queue a compensating purchase state. */
  undo(ref: EventDayRef, now: string): PurchaseMutationResult | null {
    const state = this.requireState(ref);
    if (state.history.length === 0) return null;

    const last = state.history.at(-1);
    if (!last) return null;

    const historyWithoutLast = state.history.slice(0, -1);
    const nextRedo = [...state.redo, last];

    let nextPurchased = [...state.purchased];
    let nextHold = [...state.hold];
    let queuedPurchaseState: boolean | null = null;

    if (last.type === "purchase") {
      nextPurchased = nextPurchased.filter((s) => s !== last.space);
      queuedPurchaseState = false;
    } else if (last.type === "unpurchase") {
      if (!nextPurchased.includes(last.space)) {
        nextPurchased.push(last.space);
      }
      queuedPurchaseState = true;
    } else if (last.type === "hold") {
      nextHold = nextHold.filter((s) => s !== last.space);
    } else if (last.type === "unhold") {
      if (!nextHold.includes(last.space)) {
        nextHold.push(last.space);
      }
    }

    const nextStateDraft: LocalEventDayState = {
      ...state,
      purchased: nextPurchased,
      hold: nextHold,
      history: historyWithoutLast,
      redo: nextRedo,
      timestamps: {
        ...state.timestamps,
        updatedAt: now,
      },
    };

    if (state.source.type === "gas" && queuedPurchaseState !== null) {
      const appended = this.outbox.append(
        nextStateDraft,
        ref,
        last.space,
        queuedPurchaseState,
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

  /** Reapply the latest undone activity and queue its desired purchase state. */
  redo(ref: EventDayRef, now: string): PurchaseMutationResult | null {
    const state = this.requireState(ref);
    if (state.redo.length === 0) return null;

    const last = state.redo.at(-1);
    if (!last) return null;

    const redoWithoutLast = state.redo.slice(0, -1);
    const nextHistory = [...state.history, last];

    let nextPurchased = [...state.purchased];
    let nextHold = [...state.hold];
    let queuedPurchaseState: boolean | null = null;

    if (last.type === "purchase") {
      if (!nextPurchased.includes(last.space)) {
        nextPurchased.push(last.space);
      }
      queuedPurchaseState = true;
    } else if (last.type === "unpurchase") {
      nextPurchased = nextPurchased.filter((s) => s !== last.space);
      queuedPurchaseState = false;
    } else if (last.type === "hold") {
      if (!nextHold.includes(last.space)) {
        nextHold.push(last.space);
      }
    } else if (last.type === "unhold") {
      nextHold = nextHold.filter((s) => s !== last.space);
    }

    const nextStateDraft: LocalEventDayState = {
      ...state,
      purchased: nextPurchased,
      hold: nextHold,
      history: nextHistory,
      redo: redoWithoutLast,
      timestamps: {
        ...state.timestamps,
        updatedAt: now,
      },
    };

    if (state.source.type === "gas" && queuedPurchaseState !== null) {
      const appended = this.outbox.append(
        nextStateDraft,
        ref,
        last.space,
        queuedPurchaseState,
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

  /** Clear local activity and queue false for every purchased GAS space. */
  resetActivity(ref: EventDayRef, now: string): PurchaseMutationResult {
    const state = this.requireState(ref);
    const previouslyPurchased = [...state.purchased];

    const nextStateDraft: LocalEventDayState = {
      ...state,
      purchased: [],
      hold: [],
      history: [],
      redo: [],
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
