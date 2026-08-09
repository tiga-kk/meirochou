import type { EventDayOption } from "./event-day-selector-model";

export class DomEventDaySelectorView {
  constructor(
    private readonly element: HTMLSelectElement | HTMLElement | null = null,
  ) {}
  render(options: readonly EventDayOption[]): void {
    if (!this.element) return;
    if (!(this.element instanceof HTMLSelectElement)) {
      Object.assign(this.element, {
        options,
        selectedEventId: options.find((option) => option.selected)?.eventId ?? "",
        selectedDayId: options.find((option) => option.selected)?.dayId ?? "",
      });
      return;
    }
    this.element.replaceChildren(
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
    (this.element?.querySelector("#day-select") as HTMLElement | null)?.focus();
    if (this.element instanceof HTMLSelectElement) this.element.focus();
  }
  showBusy(busy: boolean): void {
    if (this.element && !(this.element instanceof HTMLSelectElement)) {
      (this.element as HTMLElement & { busy?: boolean }).busy = busy;
    }
  }
  showError(message: string): void {
    if (this.element && !(this.element instanceof HTMLSelectElement)) {
      (this.element as HTMLElement & { errorMessage?: string }).errorMessage = message;
    }
  }
}
