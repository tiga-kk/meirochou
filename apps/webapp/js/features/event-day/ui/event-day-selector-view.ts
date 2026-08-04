import type { EventDayOption } from "./event-day-selector-model";

export interface EventDaySelectorView {
  render(options: readonly EventDayOption[]): void;
  focusSelected(): void;
  showError(message: string): void;
}
