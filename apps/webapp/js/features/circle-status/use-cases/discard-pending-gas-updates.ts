import type {
  ActiveEventDaySession,
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../../event-day/public-api";

export interface DiscardPendingGasUpdatesInput {
  readonly eventDay: EventDayRef;
  readonly updateId?: string;
}

export class DiscardPendingGasUpdatesUseCase {
  constructor(
    private readonly repository: EventDayRepository,
    private readonly activeEventDaySession: ActiveEventDaySession,
  ) {}

  execute(input: DiscardPendingGasUpdatesInput): {
    readonly state: LocalEventDayState;
  } {
    const state = this.repository.load(input.eventDay);
    if (!state) {
      throw new Error("State not found");
    }

    const nextOutbox = input.updateId
      ? state.gasOutbox.filter((e) => e.id !== input.updateId)
      : [];

    const nextState: LocalEventDayState = {
      ...state,
      gasOutbox: Object.freeze(nextOutbox),
    };

    this.repository.save(input.eventDay, nextState);

    const snapshot = this.activeEventDaySession.getActiveEventDay();
    if (
      snapshot &&
      snapshot.ref.eventId === input.eventDay.eventId &&
      snapshot.ref.dayId === input.eventDay.dayId
    ) {
      this.activeEventDaySession.replaceActiveEventDayState(nextState);
    }

    return { state: nextState };
  }
}
