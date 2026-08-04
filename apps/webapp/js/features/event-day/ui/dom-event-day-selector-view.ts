import type { EventDayOption } from "./event-day-selector-model";

export class DomEventDaySelectorView {
  constructor(private readonly select: HTMLSelectElement | null = null) {}
  render(options: readonly EventDayOption[]): void {
    if (!this.select) return;
    this.select.replaceChildren(
      ...options.map((option) => {
        const element = new Option(
          `${option.eventLabel} ${option.dayLabel}`,
          `${option.eventId}:${option.dayId}`,
          option.selected,
          option.selected,
        );
        element.disabled = false;
        return element;
      }),
    );
  }
  focusSelected(): void {
    this.select?.focus();
  }
}
