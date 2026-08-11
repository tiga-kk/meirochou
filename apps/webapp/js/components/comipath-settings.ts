import { html, LitElement, nothing, type PropertyValues } from "lit";
import type { EventDayRef } from "../features/event-day/public-api";
import {
  ALNS_SEARCH_TIME_LIMITS,
  type AlnsSearchTimeLimitMs,
  DEFAULT_SEARCH_TIME_LIMIT_MS,
} from "../features/route-guidance/domain/optimization/time-decayed-objective";
import type { EventDayManagementRow } from "../shared/ui/event-day-management-view-model";
import { dispatchManagementEvent } from "../shared/ui/management-events";
import type {
  DeleteOptionViewModel,
  EventDayOption,
  OutboxPanelModel,
} from "../shared/ui/management-view-model";
import { DialogFocusController } from "../ui/dialog-focus";
import type { CircleDataSourcePanelModel } from "./circle-data-source-panel";
import type { StorageDeleteDialogModel } from "./storage-delete-dialog";
import "./event-day-selector";
import "./event-day-management-view";
import "./circle-data-source-panel";
import "./outbox-panel";
import "./storage-delete-dialog";
import "./gas-setup-panel";

/**
 * Shell container for management settings, hosting the event/day selector,
 * source manager, outbox panel, and storage delete dialog.
 */
export class ComipathSettings extends LitElement {
  static properties = {
    open: { type: Boolean },
    eventDayOptions: { attribute: false },
    eventDayManagementRows: { attribute: false },
    detailRef: { attribute: false },
    detailOpen: { type: Boolean },
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
  declare detailRef: EventDayRef | null;
  declare detailOpen: boolean;
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
  private pageScrollLock: {
    x: number;
    y: number;
    styles: Record<string, { value: string; priority: string }>;
  } | null = null;

  private readonly focusController = new DialogFocusController(this, {
    onEscape: () => this.requestClose(),
  });

  constructor() {
    super();
    this.open = false;
    this.eventDayOptions = [];
    this.eventDayManagementRows = [];
    this.detailRef = null;
    this.detailOpen = false;
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
      this.lockPageScroll();
      this.focusController.activate();
    } else if (!this.open && this.isOpen) {
      this.isOpen = false;
      this.focusController.deactivate();
      this.unlockPageScroll();
    }
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("eventDayManagementRows")) {
      this.reconcileDetail(
        changed.get("eventDayManagementRows") as
          | readonly EventDayManagementRow[]
          | undefined,
      );
    }
    if (changed.has("open") && this.open && !this.isOpen) {
      this.detailOpen = false;
    }
  }

  disconnectedCallback(): void {
    if (this.isOpen) this.focusController.deactivate();
    this.unlockPageScroll();
    this.isOpen = false;
    super.disconnectedCallback();
  }

  private lockPageScroll(): void {
    if (this.pageScrollLock) return;
    const body = document.body;
    const properties = ["position", "top", "left", "right", "width", "overflow"];
    const styles = Object.fromEntries(
      properties.map((property) => [
        property,
        {
          value: body.style.getPropertyValue(property),
          priority: body.style.getPropertyPriority(property),
        },
      ]),
    );
    this.pageScrollLock = {
      x: window.scrollX,
      y: window.scrollY,
      styles,
    };
    body.style.position = "fixed";
    body.style.top = `-${this.pageScrollLock.y}px`;
    body.style.left = `-${this.pageScrollLock.x}px`;
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
  }

  private unlockPageScroll(): void {
    const lock = this.pageScrollLock;
    if (!lock) return;
    this.pageScrollLock = null;
    const body = document.body;
    for (const [property, style] of Object.entries(lock.styles)) {
      if (style.value || style.priority) {
        body.style.setProperty(property, style.value, style.priority);
      } else {
        body.style.removeProperty(property);
      }
    }
    window.scrollTo(lock.x, lock.y);
  }

  private requestClose(): void {
    if (!this.open) return;
    dispatchManagementEvent(this, "settings-close-request", {});
  }

  private sameRef(left: EventDayRef | null, right: EventDayRef | null): boolean {
    return Boolean(
      left &&
        right &&
        left.eventId === right.eventId &&
        left.dayId === right.dayId,
    );
  }

  private reconcileDetail(
    previousRows: readonly EventDayManagementRow[] | undefined,
  ): void {
    const rows = this.eventDayManagementRows;
    if (rows.length === 0) {
      this.detailRef = null;
      this.detailOpen = false;
      return;
    }
    const current = rows.find((row) => this.sameRef(row.ref, this.detailRef));
    const previous = previousRows?.find((row) =>
      this.sameRef(row.ref, this.detailRef),
    );
    const selected = rows.find((row) => row.selected);
    if (current) {
      if (previous?.selected && !current.selected && selected) {
        this.detailRef = { ...selected.ref };
      }
      return;
    }
    const fallback = selected ?? rows[0];
    this.detailRef = fallback?.ref ?? null;
  }

  private get detailRow(): EventDayManagementRow | null {
    return (
      this.eventDayManagementRows.find((row) =>
        this.sameRef(row.ref, this.detailRef),
      ) ??
      this.eventDayManagementRows.find((row) => row.selected) ??
      this.eventDayManagementRows[0] ??
      null
    );
  }

  private handleDetailRequest(event: Event): void {
    const ref = (event as CustomEvent<{ ref: EventDayRef }>).detail?.ref;
    if (!ref) return;
    this.detailRef = { ...ref };
    this.detailOpen = true;
  }

  private closeDetail(): void {
    this.detailOpen = false;
  }

  private requestAction(
    type:
      | "event-day-open-request"
      | "event-day-refresh-request"
      | "event-day-offline-request"
      | "event-day-edit-request"
      | "event-day-delete-request",
    ref: EventDayRef,
  ): void {
    dispatchManagementEvent(this, type, { ref });
  }

  private renderDetailActions(row: EventDayManagementRow) {
    if (!row.configured) {
      return html`
        <button
          type="button"
          class="btn btn-primary"
          data-action="edit"
          @click=${() => this.requestAction("event-day-edit-request", row.ref)}
        >設定する</button>
      `;
    }
    return html`
      <div class="management-detail-actions" aria-label="日程の操作">
        ${[
          ["open", "この日程を開く", "event-day-open-request"],
          ["refresh", "再読込", "event-day-refresh-request"],
          ["offline", "オフライン準備", "event-day-offline-request"],
          ["edit", "編集", "event-day-edit-request"],
          ["delete", "削除", "event-day-delete-request"],
        ].map(
          ([action, label, eventName]) => html`
            <button
              type="button"
              class="btn btn-secondary"
              data-action=${action}
              @click=${() =>
                this.requestAction(
                  eventName as
                    | "event-day-open-request"
                    | "event-day-refresh-request"
                    | "event-day-offline-request"
                    | "event-day-edit-request"
                    | "event-day-delete-request",
                  row.ref,
                )}
            >${label}</button>
          `,
        )}
      </div>
    `;
  }

  private renderActiveControls(row: EventDayManagementRow) {
    if (!row.selected) return nothing;
    return html`
      <div class="management-active-controls">
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
              if (ALNS_SEARCH_TIME_LIMITS.includes(value as AlnsSearchTimeLimitMs)) {
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
                >${option.label}</button>
                <p class="storage-delete-consequence">${option.consequence}</p>
                ${option.blockedReason
                  ? html`<p class="storage-delete-blocked" role="status">${option.blockedReason}</p>`
                  : nothing}
              </div>
            `,
          )}
        </section>
        <storage-delete-dialog .model=${this.deleteDialogModel}></storage-delete-dialog>
      </div>
    `;
  }

  private renderManagementDetail() {
    const row = this.detailRow;
    if (!row) return html`<p class="event-day-management-empty">日程を選択してください</p>`;
    return html`
      <div class="management-detail-summary">
        <h3>${row.eventLabel} / ${row.dayLabel}</h3>
        <p>${row.selected ? "[使用中]" : "未選択"}</p>
        <p>source: ${row.sourceLabel}</p>
        <p>Data ${row.circleCount}件 / GAS同期 ${row.pendingGasCount}件待ち</p>
        <p>${row.offlineCatalog.cached === null
          ? "お品書き 保存状況を確認できません"
          : `お品書き ${row.offlineCatalog.cached} / ${row.offlineCatalog.total} 保存済み`}</p>
      </div>
      ${this.renderDetailActions(row)}
      ${this.renderActiveControls(row)}
    `;
  }

  /** Opens the detail pane for the requested row without changing the active day. */
  openDetail(ref?: EventDayRef): void {
    if (ref && this.eventDayManagementRows.some((row) => this.sameRef(row.ref, ref))) {
      this.detailRef = { ...ref };
    }
    this.detailOpen = true;
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
      <gas-setup-panel></gas-setup-panel>
      <div class="management-list-detail">
        <div class=${this.detailOpen ? "management-overview-pane mobile-hidden" : "management-overview-pane"}>
          <event-day-management-view
            .rows=${this.eventDayManagementRows}
            @event-day-detail-request=${this.handleDetailRequest}
          ></event-day-management-view>
        </div>
        <section
          class=${this.detailOpen ? "management-detail-pane is-open" : "management-detail-pane"}
          aria-labelledby="management-detail-title"
        >
          <button
            type="button"
            class="btn btn-secondary management-detail-back"
            @click=${this.closeDetail}
          >一覧に戻る</button>
          <h2 id="management-detail-title">日程の詳細</h2>
          ${this.renderManagementDetail()}
        </section>
      </div>
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
