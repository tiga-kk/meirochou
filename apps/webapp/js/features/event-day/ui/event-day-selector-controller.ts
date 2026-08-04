import type { EventDayRef } from "../domain/event-day-types";
import type { SwitchEventDayOperation } from "../use-cases/switch-event-day";

export interface EventDaySelectorControllerDependencies {
  readonly switchEventDay: SwitchEventDayOperation;
}

function parseEventDayDetail(detail: unknown): EventDayRef | null {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) {
    return null;
  }
  const value = detail as Record<string, unknown>;
  if (
    typeof value.eventId !== "string" ||
    value.eventId.trim() === "" ||
    typeof value.dayId !== "string" ||
    value.dayId.trim() === ""
  ) {
    return null;
  }
  return { eventId: value.eventId, dayId: value.dayId };
}

export class EventDaySelectorController {
  private stopped = false;

  constructor(
    private readonly dependencies: EventDaySelectorControllerDependencies,
  ) {}

  async selectEventDay(detail: unknown): Promise<void> {
    const ref = parseEventDayDetail(detail);
    if (!ref || this.stopped) return;
    await this.dependencies.switchEventDay.execute(ref);
  }

  stop(): void {
    this.stopped = true;
  }
}
