import type { EventRegistry } from "../domain/event-day-contracts";
import type { EventDayRef } from "../domain/event-day-types";
import type { ActiveEventDaySession } from "../use-cases/active-event-day-session";
import type { EventDayRepository } from "../use-cases/event-day-repository";
import type { OpenInitialEventDayUseCase } from "../use-cases/open-initial-event-day";
import type { SwitchEventDayOperation } from "../use-cases/switch-event-day";
import type { EventDayOption } from "./event-day-selector-model";
import type { EventDaySelectorView } from "./event-day-selector-view";

export interface EventDaySelectorControllerDependencies {
  readonly switchEventDay: SwitchEventDayOperation;
  readonly openInitialEventDay?: OpenInitialEventDayUseCase;
  readonly registry?: EventRegistry;
  readonly view?: EventDaySelectorView;
  readonly repository?: EventDayRepository;
  readonly targetElement?: HTMLElement | Window | Document;
  readonly activeEventDaySession?: ActiveEventDaySession;
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
  private started = false;
  private listener: ((e: Event) => void) | null = null;
  private activeTarget: HTMLElement | Window | Document | null = null;
  private selectionSequence = 0;

  constructor(
    private readonly dependencies: EventDaySelectorControllerDependencies,
  ) {}

  /**
   * Starts the controller: loads registry/repository, renders view,
   * binds DOM event listeners, and opens initial event/day.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopped = false;

    const { openInitialEventDay, registry, view, repository, targetElement } =
      this.dependencies;
    if (!registry || !view || !openInitialEventDay) return;

    const lastOpenedRef = repository?.getLastOpenedEventDay() ?? null;
    const initial = openInitialEventDay.execute(
      registry,
      lastOpenedRef ?? undefined,
    );
    const options = buildEventDayOptions(
      registry,
      initial.ref,
      repository ?? null,
    );
    view.render(options);

    // Bind event listener
    const target =
      targetElement ?? (typeof document !== "undefined" ? document : null);
    if (target && typeof target.addEventListener === "function") {
      this.activeTarget = target;
      this.listener = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail) {
          void this.selectEventDay(customEvent.detail);
        }
      };
      target.addEventListener("event-day-select", this.listener);
    }

    view.showBusy?.(true);
    try {
      const state = repository?.load(initial.ref) ?? null;
      if (state) {
        this.dependencies.activeEventDaySession?.setActiveEventDay(
          initial.ref,
          state,
        );
      } else {
        await this.dependencies.switchEventDay.execute(initial.ref);
      }
      if (!this.stopped) view.showSuccess?.();
    } catch (error: unknown) {
      if (!this.stopped) {
        view.showError(
          error instanceof Error ? error.message : "Failed to open event day",
        );
      }
    } finally {
      if (!this.stopped) view.showBusy?.(false);
    }
  }

  async selectEventDay(detail: unknown): Promise<void> {
    const ref = parseEventDayDetail(detail);
    if (!ref || this.stopped) {
      if (!ref && detail && this.dependencies.view) {
        this.dependencies.view.showError("Invalid event day detail");
      }
      return;
    }
    const sequence = ++this.selectionSequence;
    this.dependencies.view?.showBusy?.(true);
    try {
      await this.dependencies.switchEventDay.execute(ref);
      if (this.stopped || sequence !== this.selectionSequence) return;
      if (this.dependencies.registry && this.dependencies.view) {
        const options = buildEventDayOptions(
          this.dependencies.registry,
          ref,
          this.dependencies.repository ?? null,
        );
        this.dependencies.view.render(options);
      }
      this.dependencies.view?.showSuccess?.();
    } catch (err: unknown) {
      if (this.stopped || sequence !== this.selectionSequence) return;
      const msg =
        err instanceof Error ? err.message : "Failed to switch event day";
      this.dependencies.view?.showError(msg);
    } finally {
      if (!this.stopped && sequence === this.selectionSequence) {
        this.dependencies.view?.showBusy?.(false);
      }
    }
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    this.selectionSequence += 1;
    if (this.activeTarget && this.listener) {
      this.activeTarget.removeEventListener("event-day-select", this.listener);
      this.listener = null;
      this.activeTarget = null;
    }
  }
}
