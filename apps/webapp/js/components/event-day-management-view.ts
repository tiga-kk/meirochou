import { html, LitElement, nothing } from "lit";
import { dispatchManagementEvent } from "../shared/ui/management-events";
import type { EventDayRef } from "../features/event-day/public-api";
import type { EventDayManagementRow } from "../shared/ui/event-day-management-view-model";

const actions = [
  ["open", "開く", "event-day-open-request"],
  ["refresh", "再読込", "event-day-refresh-request"],
  ["offline", "オフライン準備", "event-day-offline-request"],
  ["edit", "編集", "event-day-edit-request"],
  ["delete", "削除", "event-day-delete-request"],
] as const;

export class EventDayManagementView extends LitElement {
  static properties = { rows: { attribute: false } };

  declare rows: readonly EventDayManagementRow[];

  constructor() {
    super();
    this.rows = [];
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private request(type: (typeof actions)[number][2], ref: EventDayRef): void {
    dispatchManagementEvent(this, type, { ref });
  }

  private renderOffline(row: EventDayManagementRow) {
    if (row.offlineCatalog.cached === null) {
      return html`<span class="event-day-management-offline-error">お品書き 保存状況を確認できません</span>`;
    }
    return html`お品書き ${row.offlineCatalog.cached} / ${row.offlineCatalog.total} 保存済み`;
  }

  protected render() {
    return html`
      <section class="event-day-management" aria-labelledby="event-day-management-title">
        <h2 id="event-day-management-title">イベント・日程管理</h2>
        <div class="event-day-management-list">
          ${this.rows.length === 0
            ? html`<p class="event-day-management-empty">イベント・日程がありません</p>`
            : this.rows.map(
                (row) => html`
                  <article class="event-day-management-row" data-selected=${row.selected ? "true" : "false"}>
                    <div class="event-day-management-heading">
                      <h3>${row.eventLabel} / ${row.dayLabel}</h3>
                      <span class="event-day-management-source-type">${row.sourceType === "gas" ? "GAS" : row.sourceType === "csv" ? "CSV" : "未設定"}</span>
                    </div>
                    <p class="event-day-management-source">
                      ${row.sourceLabel}${row.sourceEndpointSummary ? html`（${row.sourceEndpointSummary}）` : nothing}
                    </p>
                    <div class="event-day-management-status" aria-label="イベント日程の状態">
                      <span>Data ${row.circleCount}件</span>
                      <span>GAS同期 ${row.pendingGasCount}件待ち</span>
                      <span>${this.renderOffline(row)}</span>
                    </div>
                    <div class="event-day-management-actions">
                      ${(row.configured ? actions : [actions[3]]).map(
                        ([action, label, eventName]) => html`
                          <button
                            type="button"
                            class="btn btn-secondary"
                            data-action=${action}
                            @click=${() => this.request(eventName, row.ref)}
                          >${row.configured ? label : "設定する"}</button>
                        `,
                      )}
                    </div>
                  </article>
                `,
              )}
        </div>
      </section>
    `;
  }
}

if (!customElements.get("event-day-management-view")) {
  customElements.define("event-day-management-view", EventDayManagementView);
}

declare global {
  interface HTMLElementTagNameMap {
    "event-day-management-view": EventDayManagementView;
  }
}
