import type {
  EventDayRef,
  LocalEventDayState,
} from "../domain/event-day-types";

export interface EventDayRepository {
  load(ref: EventDayRef): LocalEventDayState | null;
  save(ref: EventDayRef, state: LocalEventDayState): void;
  saveAndRememberLastOpened(ref: EventDayRef, state: LocalEventDayState): void;
  listEventDays(): readonly EventDayRef[];
  getLastOpenedEventDay(): EventDayRef | null;
  rememberLastOpenedEventDay(ref: EventDayRef): void;
  deleteEventDay(ref: EventDayRef): void;
  listEventDaysForDeletion(): readonly {
    readonly ref: EventDayRef;
    readonly state: LocalEventDayState;
  }[];
  deleteAllEventDays(
    expected: readonly {
      readonly ref: EventDayRef;
      readonly sourceGeneration: string;
    }[],
  ): void;
}
