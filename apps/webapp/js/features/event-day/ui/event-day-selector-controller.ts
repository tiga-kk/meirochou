import type { EventRegistry } from "../domain/event-day-contracts";
import type { EventDayRef } from "../domain/event-day-types";
import type { OpenInitialEventDayUseCase } from "../use-cases/open-initial-event-day";
import type { SwitchEventDayOperation } from "../use-cases/switch-event-day";
import type { EventDaySelectorView } from "./event-day-selector-view";
import type { EventDayOption } from "./event-day-selector-model";
import type { EventDayRepository } from "../use-cases/event-day-repository";

export interface EventDaySelectorControllerDependencies {
  readonly switchEventDay: SwitchEventDayOperation;
  readonly openInitialEventDay?: OpenInitialEventDayUseCase;
  readonly registry?: EventRegistry;
  readonly view?: EventDaySelectorView;
  readonly repository?: EventDayRepository;
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

function buildEventDayOptions(
  registry: EventRegistry,
  lastOpenedRef: EventDayRef | null,
  repository: EventDayRepository | null,
): readonly EventDayOption[] {
  const options: EventDayOption[] = [];
  for (const event of registry.events) {
    for (const day of event.days) {
      const ref: EventDayRef = { eventId: event.eventId, dayId: day.dayId };
      const state = repository?.load(ref) ?? null;
      const isSelected =
        lastOpenedRef !== null &&
        lastOpenedRef.eventId === ref.eventId &&
        lastOpenedRef.dayId === ref.dayId;
      options.push({
        eventId: event.eventId,
        eventLabel: event.displayName,
        dayId: day.dayId,
        dayLabel: day.displayName,
        configured: state !== null,
        selected: isSelected,
        pendingCount: state?.gasOutbox.length ?? 0,
      });
    }
  }
  return options;
}

export class EventDaySelectorController {
  private stopped = false;

  constructor(
    private readonly dependencies: EventDaySelectorControllerDependencies,
  ) {}

  /**
   * Starts the controller: loads the last opened event/day from the repository
   * and renders the selector view. Must be called once during application startup.
   */
  async start(): Promise<void> {
    const { openInitialEventDay, registry, view, repository } =
      this.dependencies;
    if (!registry || !view) return;

    const lastOpenedRef = repository?.getLastOpenedEventDay() ?? null;
    const options = buildEventDayOptions(registry, lastOpenedRef, repository ?? null);
    view.render(options);

    if (openInitialEventDay && lastOpenedRef === null) {
      // Nothing to restore - render with empty selection is sufficient
      return;
    }

    if (openInitialEventDay && lastOpenedRef) {
      try {
        await this.dependencies.switchEventDay.execute(lastOpenedRef);
      } catch {
        // If the initial open fails, we still show the selector but swallow the error
      }
    }
  }

  async selectEventDay(detail: unknown): Promise<void> {
    const ref = parseEventDayDetail(detail);
    if (!ref || this.stopped) return;
    await this.dependencies.switchEventDay.execute(ref);
  }

  stop(): void {
    this.stopped = true;
  }
}
