import { html, LitElement, type PropertyValues } from "lit";
import type { EventDayOption } from "../ui/management-view-model";
import type { SourceManagerModel } from "./source-manager";
import "./event-day-selector";
import "./source-manager";

/**
 * Shell container for management settings, hosting the event/day selector,
 * source manager, and future panels.
 */
export class ComipathSettings extends LitElement {
  static properties = {
    open: { type: Boolean },
    eventDayOptions: { attribute: false },
    selectedEventId: { type: String },
    selectedDayId: { type: String },
    sourceManagerModel: { attribute: false },
    busy: { type: Boolean },
    errorMessage: { type: String },
  };

  declare open: boolean;
  declare eventDayOptions: readonly EventDayOption[];
  declare selectedEventId: string;
  declare selectedDayId: string;
  declare sourceManagerModel: SourceManagerModel | null;
  declare busy: boolean;
  declare errorMessage: string;

  constructor() {
    super();
    this.open = false;
    this.eventDayOptions = [];
    this.selectedEventId = "";
    this.selectedDayId = "";
    this.sourceManagerModel = null;
    this.busy = false;
    this.errorMessage = "";
  }

  /** Light DOM for CSS and accessibility consistency. */
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("open")) this.classList.toggle("show", this.open);
  }

  protected render() {
    return html`
      <h2>設定</h2>
      <event-day-selector
        .options=${this.eventDayOptions}
        .selectedEventId=${this.selectedEventId}
        .selectedDayId=${this.selectedDayId}
        ?busy=${this.busy}
        .errorMessage=${this.errorMessage}
      ></event-day-selector>
      <source-manager .model=${this.sourceManagerModel}></source-manager>
    `;
  }
}

if (!customElements.get("comipath-settings")) {
  customElements.define("comipath-settings", ComipathSettings);
}

declare global {
  interface HTMLElementTagNameMap {
    "comipath-settings": ComipathSettings;
  }
}
