import { html, LitElement, nothing } from "lit";
import { dispatchManagementEvent } from "../shared/ui/management-events";
import type { EventDayRef } from "../features/event-day/public-api";
import type { EventDayManagementRow } from "../shared/ui/event-day-management-view-model";

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

  private requestDetail(ref: EventDayRef): void {
    dispatchManagementEvent(this, "event-day-detail-request", { ref });
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
                  <article
                    class="event-day-management-row"
                    data-selected=${row.selected ? "true" : "false"}
                    aria-current=${row.selected ? "true" : nothing}
                  >
                    <div class="event-day-management-heading">
                      <h3>${row.eventLabel} / ${row.dayLabel}${row.selected ? " [使用中]" : ""}</h3>
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
                      <button
                        type="button"
                        class="btn btn-secondary"
                        data-action="detail"
                        @click=${() => this.requestDetail(row.ref)}
                      >${row.configured ? "詳細を見る" : "設定する"}</button>
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
