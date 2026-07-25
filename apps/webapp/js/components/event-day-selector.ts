import { html, LitElement, nothing, type PropertyValues } from "lit";
import { dispatchManagementEvent } from "../ui/management-events";
import type { EventDayOption } from "../ui/management-view-model";

export class EventDaySelector extends LitElement {
  static properties = {
    options: { attribute: false },
    selectedEventId: { type: String },
    selectedDayId: { type: String },
    busy: { type: Boolean },
    errorMessage: { type: String },
  };

  declare options: readonly EventDayOption[];
  declare selectedEventId: string;
  declare selectedDayId: string;
  declare busy: boolean;
  declare errorMessage: string;

  private currentEventId = "";

  constructor() {
    super();
    this.options = [];
    this.selectedEventId = "";
    this.selectedDayId = "";
    this.busy = false;
    this.errorMessage = "";
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (
      changedProperties.has("selectedEventId") ||
      !this.currentEventId ||
      (changedProperties.has("errorMessage") && this.errorMessage)
    ) {
      this.currentEventId = this.selectedEventId;
    }
  }

  private getUniqueEvents(): readonly {
    eventId: string;
    eventLabel: string;
  }[] {
    const seen = new Set<string>();
    const result: { eventId: string; eventLabel: string }[] = [];
    for (const opt of this.options) {
      if (!seen.has(opt.eventId)) {
        seen.add(opt.eventId);
        result.push({ eventId: opt.eventId, eventLabel: opt.eventLabel });
      }
    }
    return Object.freeze(result);
  }

  private getFilteredDays(eventId: string): readonly EventDayOption[] {
    return Object.freeze(this.options.filter((opt) => opt.eventId === eventId));
  }

  private handleEventChange(e: Event): void {
    const target = e.currentTarget as HTMLSelectElement;
    const newEventId = target.value;
    const event = this.getUniqueEvents().find(
      (candidate) => candidate.eventId === newEventId,
    );
    if (!event) {
      this.currentEventId = this.selectedEventId;
      this.requestUpdate();
      return;
    }

    this.currentEventId = newEventId;
    this.requestUpdate();

    const days = this.getFilteredDays(newEventId);
    if (days.length > 0) {
      const firstDay = days[0];
      dispatchManagementEvent(this, "event-day-select", {
        eventId: firstDay.eventId,
        dayId: firstDay.dayId,
      });
    }
  }

  private handleDayChange(e: Event): void {
    const target = e.currentTarget as HTMLSelectElement;
    const newDayId = target.value;
    const eventId = this.currentEventId || this.selectedEventId;
    const selectedOption = this.options.find(
      (option) => option.eventId === eventId && option.dayId === newDayId,
    );

    if (selectedOption) {
      dispatchManagementEvent(this, "event-day-select", {
        eventId: selectedOption.eventId,
        dayId: selectedOption.dayId,
      });
      return;
    }

    this.requestUpdate();
  }

  private formatDayLabel(opt: EventDayOption): string {
    let label = opt.dayLabel;
    if (!opt.configured) {
      label += " (未設定)";
    }
    if (opt.pendingCount > 0) {
      label += ` [送信待ち:${opt.pendingCount}]`;
    }
    return label;
  }

  protected render() {
    const events = this.getUniqueEvents();
    const activeEventId =
      this.currentEventId || this.selectedEventId || (events[0]?.eventId ?? "");
    const days = this.getFilteredDays(activeEventId);

    return html`
      <div
        class="event-day-selector-container input-group"
        aria-busy=${this.busy ? "true" : "false"}
      >
        <div class="event-day-selector-label">イベント・日程選択</div>
        <div class="input-row event-day-select-row">
          <div class="event-day-field">
            <label for="event-select">イベント</label>
            <select
              id="event-select"
              class="form-control"
              ?disabled=${this.busy}
              .value=${activeEventId}
              @change=${this.handleEventChange}
            >
              ${events.map(
                (evt) =>
                  html`<option value=${evt.eventId} ?selected=${evt.eventId === activeEventId}>${evt.eventLabel}</option>`,
              )}
            </select>
          </div>
          <div class="event-day-field">
            <label for="day-select">日程</label>
            <select
              id="day-select"
              class="form-control"
              ?disabled=${this.busy}
              .value=${this.selectedDayId}
              @change=${this.handleDayChange}
            >
              ${days.map(
                (day) =>
                  html`<option value=${day.dayId} ?selected=${day.dayId === this.selectedDayId}>${this.formatDayLabel(day)}</option>`,
              )}
            </select>
          </div>
        </div>
        ${
          this.busy
            ? html`<p class="event-day-status" role="status">切替中…</p>`
            : nothing
        }
        ${
          this.errorMessage
            ? html`<p class="settings-error" role="alert">${this.errorMessage}</p>`
            : nothing
        }
      </div>
    `;
  }
}

if (!customElements.get("event-day-selector")) {
  customElements.define("event-day-selector", EventDaySelector);
}

declare global {
  interface HTMLElementTagNameMap {
    "event-day-selector": EventDaySelector;
  }
}
