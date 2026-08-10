import { html, LitElement, type PropertyValues } from "lit";
import {
  ALNS_SEARCH_TIME_LIMITS,
  type AlnsSearchTimeLimitMs,
  DEFAULT_SEARCH_TIME_LIMIT_MS,
} from "../features/route-guidance/domain/optimization/time-decayed-objective";
import { dispatchManagementEvent } from "../shared/ui/management-events";
import { DialogFocusController } from "../ui/dialog-focus";
import type {
  DeleteOptionViewModel,
  EventDayOption,
  OutboxPanelModel,
} from "../shared/ui/management-view-model";
import type { EventDayManagementRow } from "../shared/ui/event-day-management-view-model";
import type { CircleDataSourcePanelModel } from "./circle-data-source-panel";
import type { StorageDeleteDialogModel } from "./storage-delete-dialog";
import "./event-day-selector";
import "./event-day-management-view";
import "./circle-data-source-panel";
import "./outbox-panel";
import "./storage-delete-dialog";

/**
 * Shell container for management settings, hosting the event/day selector,
 * source manager, outbox panel, and storage delete dialog.
 */
export class ComipathSettings extends LitElement {
  static properties = {
    open: { type: Boolean },
    eventDayOptions: { attribute: false },
    eventDayManagementRows: { attribute: false },
    selectedEventId: { type: String },
    selectedDayId: { type: String },
    sourceManagerModel: { attribute: false },
    outboxPanelModel: { attribute: false },
    deleteOptions: { attribute: false },
    deleteDialogModel: { attribute: false },
    optimizationTimeLimitMs: { type: Number },
    busy: { type: Boolean },
    errorMessage: { type: String },
  };

  declare open: boolean;
  declare eventDayOptions: readonly EventDayOption[];
  declare eventDayManagementRows: readonly EventDayManagementRow[];
  declare selectedEventId: string;
  declare selectedDayId: string;
  declare sourceManagerModel: CircleDataSourcePanelModel | null;
  declare outboxPanelModel: OutboxPanelModel | null;
  declare deleteOptions: readonly DeleteOptionViewModel[];
  declare deleteDialogModel: StorageDeleteDialogModel | null;
  declare optimizationTimeLimitMs: AlnsSearchTimeLimitMs;
  declare busy: boolean;
  declare errorMessage: string;

  private isOpen = false;

  private readonly focusController = new DialogFocusController(this, {
    onEscape: () => this.requestClose(),
  });

  constructor() {
    super();
    this.open = false;
    this.eventDayOptions = [];
    this.eventDayManagementRows = [];
    this.selectedEventId = "";
    this.selectedDayId = "";
    this.sourceManagerModel = null;
    this.outboxPanelModel = null;
    this.deleteOptions = [];
    this.deleteDialogModel = null;
    this.optimizationTimeLimitMs = DEFAULT_SEARCH_TIME_LIMIT_MS;
    this.busy = false;
    this.errorMessage = "";
  }

  /** Light DOM for CSS and accessibility consistency. */
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected updated(changed: PropertyValues<this>): void {
    if (!changed.has("open")) return;
    this.classList.toggle("show", this.open);
    if (this.open && !this.isOpen) {
      this.isOpen = true;
      this.focusController.activate();
    } else if (!this.open && this.isOpen) {
      this.isOpen = false;
      this.focusController.deactivate();
    }
  }

  disconnectedCallback(): void {
    if (this.isOpen) this.focusController.deactivate();
    this.isOpen = false;
    super.disconnectedCallback();
  }

  private requestClose(): void {
    if (!this.open) return;
    dispatchManagementEvent(this, "settings-close-request", {});
  }

  protected render() {
    return html`
      <div class="management-surface-header">
        <h2 id="settings-heading">管理</h2>
        <button
          type="button"
          class="btn btn-secondary management-surface-close"
          @click=${this.requestClose}
        >閉じる</button>
      </div>
      <event-day-management-view
        .rows=${this.eventDayManagementRows}
      ></event-day-management-view>
      <event-day-selector
        .options=${this.eventDayOptions}
        .selectedEventId=${this.selectedEventId}
        .selectedDayId=${this.selectedDayId}
        ?busy=${this.busy}
        .errorMessage=${this.errorMessage}
      ></event-day-selector>
      <source-manager .model=${this.sourceManagerModel}></source-manager>
      <outbox-panel .model=${this.outboxPanelModel}></outbox-panel>
      <section class="optimization-settings" aria-labelledby="optimization-settings-title">
        <h3 id="optimization-settings-title">巡回最適化</h3>
        <label for="optimization-time-limit">探索時間</label>
        <select
          id="optimization-time-limit"
          .value=${String(this.optimizationTimeLimitMs)}
          @change=${(event: Event) => {
            const value = Number.parseInt(
              (event.currentTarget as HTMLSelectElement).value,
              10,
            );
            if (
              ALNS_SEARCH_TIME_LIMITS.includes(value as AlnsSearchTimeLimitMs)
            ) {
              this.optimizationTimeLimitMs = value as AlnsSearchTimeLimitMs;
              this.dispatchEvent(
                new CustomEvent("optimization-time-limit-change", {
                  bubbles: true,
                  composed: true,
                  detail: { searchTimeLimitMs: this.optimizationTimeLimitMs },
                }),
              );
            }
          }}
        >
          ${ALNS_SEARCH_TIME_LIMITS.map(
            (limit) =>
              html`<option
                value=${limit}
                ?selected=${limit === this.optimizationTimeLimitMs}
              >${limit / 1000}秒</option>`,
          )}
        </select>
      </section>
      <section class="storage-delete-options" aria-labelledby="storage-delete-title">
        <h3 id="storage-delete-title">ローカルデータ管理</h3>
        ${this.deleteOptions.map(
          (option) => html`
            <div class="storage-delete-option">
              <button
                type="button"
                class="btn btn-secondary"
                ?disabled=${option.blocked}
                @click=${() => {
                  if (!option.blocked) {
                    dispatchManagementEvent(this, "delete-option-select", {
                      scope: option.scope,
                    });
                  }
                }}
              >
                ${option.label}
              </button>
              <p class="storage-delete-consequence">${option.consequence}</p>
              ${
                option.blockedReason
                  ? html`<p class="storage-delete-blocked" role="status">${option.blockedReason}</p>`
                  : ""
              }
            </div>
          `,
        )}
      </section>
      <storage-delete-dialog .model=${this.deleteDialogModel}></storage-delete-dialog>
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
