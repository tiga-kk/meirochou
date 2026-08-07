import { css, html, LitElement, type PropertyValues } from "lit";
import type {
  CircleRecord,
  CircleVisitState,
} from "../features/event-day/domain/application-contract-types";
import {
  type AvailableCircleActions,
  type CircleActionType,
  getAvailableActionsForCircle,
} from "../ui/circle-list-view-model";

const STATE_LABEL_MAP: Record<CircleVisitState, string> = {
  pending: "巡回対象",
  held: "保留中",
  purchased: "購入済み",
  excluded: "対象外",
};

const ACTION_LABEL_MAP: Record<CircleActionType, string> = {
  "set-target": "ここを目的地にする",
  hold: "保留にする",
  unhold: "保留を解除",
  "mark-purchased": "購入済みにする",
  "unmark-purchased": "購入を取り消す",
  exclude: "今回は対象外にする",
  restore: "巡回対象に戻す",
};

export class CircleDetailDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    circle: { attribute: false },
    visitState: { type: String },
    distanceMeters: { type: Number },
    routeIndex: { type: Number },
  };

  static styles = css`
    :host {
      display: block;
    }
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .dialog-content {
      background: var(--bg-surface, #ffffff);
      color: var(--text-main, #111111);
      border-radius: 12px;
      padding: 24px;
      width: 90%;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .circle-space {
      font-size: 1.5rem;
      font-weight: bold;
    }
    .state-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: 600;
      background: var(--bg-badge, #e0e0e0);
    }
    .state-badge.pending {
      background: #e3f2fd;
      color: #1976d2;
    }
    .state-badge.held {
      background: #fff3e0;
      color: #f57c00;
    }
    .state-badge.purchased {
      background: #e8f5e9;
      color: #388e3c;
    }
    .state-badge.excluded {
      background: #ffebee;
      color: #d32f2f;
    }
    .meta-info {
      margin-bottom: 16px;
      font-size: 0.95rem;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 20px;
    }
    button {
      min-height: 44px;
      padding: 10px 16px;
      border-radius: 8px;
      border: 1px solid var(--border-color, #ccc);
      background: var(--btn-bg, #f5f5f5);
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
    }
    button.primary {
      background: var(--primary-color, #1976d2);
      color: white;
      border: none;
    }
    button.close-btn {
      align-self: flex-end;
      background: transparent;
      border: none;
      font-size: 1.2rem;
      min-height: 44px;
      min-width: 44px;
    }
  `;

  declare open: boolean;
  declare circle: CircleRecord | null;
  declare visitState: CircleVisitState;
  declare distanceMeters: number | null;
  declare routeIndex: number | null;

  private previouslyFocusedElement: HTMLElement | null = null;
  private menuOpen = false;

  constructor() {
    super();
    this.open = false;
    this.circle = null;
    this.visitState = "pending";
    this.distanceMeters = null;
    this.routeIndex = null;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  updated(changedProperties: PropertyValues) {
    if (changedProperties.has("open")) {
      if (this.open) {
        this.previouslyFocusedElement = document.activeElement as HTMLElement;
      } else if (this.previouslyFocusedElement) {
        this.previouslyFocusedElement.focus();
      }
    }
  }

  willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has("open") || changedProperties.has("visitState")) {
      this.menuOpen = false;
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.open && e.key === "Escape") {
      this.closeDialog();
    }
  };

  private closeDialog() {
    this.open = false;
    this.menuOpen = false;
    this.dispatchEvent(
      new CustomEvent("dialog-closed", { bubbles: true, composed: true }),
    );
  }

  private toggleMenu() {
    this.menuOpen = !this.menuOpen;
    this.requestUpdate();
  }

  private handleAction(action: CircleActionType) {
    if (!this.circle) return;
    this.dispatchEvent(
      new CustomEvent("action-selected", {
        detail: { action, circle: this.circle },
        bubbles: true,
        composed: true,
      }),
    );
    this.closeDialog();
  }

  render() {
    if (!this.open || !this.circle) {
      return html``;
    }

    const actions: AvailableCircleActions = getAvailableActionsForCircle(
      this.circle.space,
      this.visitState,
    );

    return html`
      <div class="dialog-backdrop" role="dialog" aria-modal="true" aria-label="サークル詳細">
        <div class="dialog-content">
          <div class="header">
            <span class="circle-space">${this.circle.space}</span>
            <span class="state-badge ${this.visitState}">
              ${STATE_LABEL_MAP[this.visitState]}
            </span>
          </div>

          <div class="meta-info">
            ${this.circle.account ? html`<div>配置名 / アカウント: ${this.circle.account}</div>` : ""}
            ${this.circle.memo ? html`<div>メモ: ${this.circle.memo}</div>` : ""}
            ${this.distanceMeters !== null ? html`<div>距離: ${Math.round(this.distanceMeters)}m</div>` : ""}
            ${this.routeIndex !== null ? html`<div>順路順序: ${this.routeIndex}番目</div>` : ""}
          </div>

          <div class="actions">
            ${
              actions.primary
                ? (
                    () => {
                      const act = actions.primary;
                      return html`
                    <button
                      type="button"
                      class="primary"
                      data-action="${act}"
                      @click="${() => this.handleAction(act)}"
                    >
                      ${ACTION_LABEL_MAP[act]}
                    </button>
                  `;
                    }
                  )()
                : ""
            }

            ${
              actions.secondary
                ? (
                    () => {
                      const act = actions.secondary;
                      return html`
                    <button
                      type="button"
                      data-action="${act}"
                      @click="${() => this.handleAction(act)}"
                    >
                      ${ACTION_LABEL_MAP[act]}
                    </button>
                  `;
                    }
                  )()
                : ""
            }

            ${
              actions.menu?.length
                ? html`
                  <button
                    type="button"
                    data-action="open-menu"
                    aria-expanded="${this.menuOpen}"
                    @click="${this.toggleMenu}"
                  >
                    その他
                  </button>
                `
                : ""
            }

            ${
              actions.menu && this.menuOpen
                ? actions.menu.map(
                    (menuAction) => html`
                    <button
                      type="button"
                      data-action="${menuAction}"
                      @click="${() => this.handleAction(menuAction)}"
                    >
                      ${ACTION_LABEL_MAP[menuAction]}
                    </button>
                  `,
                  )
                : ""
            }

            <button
              type="button"
              class="close-btn"
              @click="${this.closeDialog}"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("circle-detail-dialog")) {
  customElements.define("circle-detail-dialog", CircleDetailDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "circle-detail-dialog": CircleDetailDialog;
  }
}
