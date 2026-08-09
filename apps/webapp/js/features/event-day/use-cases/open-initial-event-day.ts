import type { EventRegistry } from "../domain/event-day-contracts";
import type { EventDayRef } from "../domain/event-day-types";
import type { EventDayRepository } from "./event-day-repository";

export interface OpenInitialEventDayResult {
  readonly ref: EventDayRef;
}

/** Resolves the durable last-opened event/day, or the first registry option. */
export class OpenInitialEventDayUseCase {
  constructor(private readonly repository: EventDayRepository) {}

  execute(
    registry: EventRegistry,
    requested?: EventDayRef,
  ): OpenInitialEventDayResult {
    const candidates = registry.events.flatMap((event) =>
      event.days.map((day) => ({ eventId: event.eventId, dayId: day.dayId })),
    );
    if (candidates.length === 0)
      throw new Error("Event registry contains no event/day");
    const last = this.repository.getLastOpenedEventDay();
    const ref = requested ?? last ?? candidates[0];
    if (
      !candidates.some(
        (candidate) =>
          candidate.eventId === ref.eventId && candidate.dayId === ref.dayId,
      )
    ) {
      return { ref: candidates[0] };
    }
    return { ref };
  }
}
