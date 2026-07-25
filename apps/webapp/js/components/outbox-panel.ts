import { html, LitElement, type PropertyValues } from "lit";
import type { EventDayRef } from "../types/domain";
import { DialogFocusController } from "../ui/dialog-focus";
import { dispatchManagementEvent } from "../ui/management-events";
import type {
  OutboxEntryViewModel,
  OutboxPanelGroupViewModel,
  OutboxPanelModel,
} from "../ui/management-view-model";

/**
 * Component for displaying pending GAS outbox queues, initiating manual retries,
 * and selecting entries for safe deletion/discard with strong user confirmation.
 */
export class OutboxPanel extends LitElement {
  static properties = {
    model: { attribute: false },
    selectedRefKey: { state: true },
    selectedEntryIds: { attribute: false },
    showDiscardModal: { state: true },
    confirmText: { state: true },
    discarding: { state: true },
  };

  declare model: OutboxPanelModel | null;
  declare selectedRefKey: string | null;
  declare selectedEntryIds: Set<string>;
  declare showDiscardModal: boolean;
  declare confirmText: string;
  declare discarding: boolean;

  private focusController: DialogFocusController | null = null;
  private modalWasOpen = false;

  constructor() {
    super();
    this.model = null;
    this.selectedRefKey = null;
    this.selectedEntryIds = new Set();
    this.showDiscardModal = false;
    this.confirmText = "";
    this.discarding = false;
  }

  /** Light DOM for CSS styling and accessibility consistency. */
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.focusController = new DialogFocusController(this, {
      onEscape: () => {
        if (!this.discarding) this.handleCloseDiscard();
      },
      backgroundSelector:
        ".container > *:not(#settings-area), #settings-area > *:not(outbox-panel)",
    });
  }

  disconnectedCallback(): void {
    if (this.modalWasOpen) {
      this.focusController?.deactivate();
      this.modalWasOpen = false;
    }
    super.disconnectedCallback();
  }

  private handleToggleEntry(
    group: OutboxPanelGroupViewModel,
    entryId: string,
  ): void {
    const groupKey = `${group.ref.eventId}:${group.ref.dayId}`;
    if (this.selectedRefKey && this.selectedRefKey !== groupKey) {
      // Prevent cross-group selection
      return;
    }

    const nextSet = new Set(this.selectedEntryIds);
    if (nextSet.has(entryId)) {
      nextSet.delete(entryId);
    } else {
      nextSet.add(entryId);
    }

    if (nextSet.size === 0) {
      this.selectedRefKey = null;
    } else {
      this.selectedRefKey = groupKey;
    }
    this.selectedEntryIds = nextSet;
    this.requestUpdate();
  }

  private handleRetryAll(): void {
    if (this.model?.processing) return;
    dispatchManagementEvent(this, "gas-retry-request", { ref: null });
  }

  private handleRetryGroup(ref: EventDayRef): void {
    if (this.model?.processing) return;
    dispatchManagementEvent(this, "gas-retry-request", { ref });
  }

  private handleOpenDiscard(): void {
    if (!this.selectedRefKey || this.selectedEntryIds.size === 0) return;
    this.confirmText = "";
    this.showDiscardModal = true;
  }

  private handleCloseDiscard(): void {
    this.showDiscardModal = false;
    this.confirmText = "";
    this.discarding = false;
  }

  private handleConfirmDiscard(): void {
    if (
      this.discarding ||
      this.confirmText !== "未送信を破棄" ||
      !this.selectedRefKey
    ) {
      return;
    }
    const group = this.model?.groups.find(
      (g) => `${g.ref.eventId}:${g.ref.dayId}` === this.selectedRefKey,
    );
    if (!group) return;

    const ids = Array.from(this.selectedEntryIds);
    dispatchManagementEvent(this, "gas-discard-request", {
      ref: group.ref,
      ids,
      confirmation: this.confirmText,
    });
    this.discarding = true;
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    const modalIsOpen = this.showDiscardModal;
    if (modalIsOpen !== this.modalWasOpen) {
      const wasOpen = this.modalWasOpen;
      this.modalWasOpen = modalIsOpen;
      if (modalIsOpen) {
        this.focusController?.activate();
      } else if (wasOpen) {
        this.focusController?.deactivate();
      }
    }

    if (!changedProperties.has("model") || !this.selectedRefKey) return;

    const group = this.model?.groups.find(
      (candidate) =>
        `${candidate.ref.eventId}:${candidate.ref.dayId}` ===
        this.selectedRefKey,
    );
    const availableIds = new Set(group?.entries.map((entry) => entry.id));
    const remainingIds = new Set(
      Array.from(this.selectedEntryIds).filter((id) => availableIds.has(id)),
    );

    if (this.model?.errorMessage) {
      this.discarding = false;
    }

    if (remainingIds.size !== this.selectedEntryIds.size) {
      if (remainingIds.size === 0) {
        this.selectedRefKey = null;
        this.selectedEntryIds = new Set();
        this.showDiscardModal = false;
        this.confirmText = "";
        this.discarding = false;
      } else {
        this.selectedEntryIds = remainingIds;
      }
    }
  }

  protected render() {
    if (!this.model || this.model.groups.length === 0) {
      return html`
        <div class="outbox-panel empty">
          <h3>GAS同期 キュー管理</h3>
          <p>送信待ちのGAS同期はありません</p>
        </div>
      `;
    }

    const isProcessing = this.model.processing;

    return html`
      <div class="outbox-panel">
        <div class="outbox-header">
          <h3>GAS同期 キュー管理 (${this.model.totalPending}件)</h3>
          <button
            class="btn-retry-all btn-primary"
            ?disabled=${isProcessing}
            @click=${this.handleRetryAll}
          >
            ${isProcessing ? "送信中…" : "すべて再送"}
          </button>
        </div>

        ${
          this.model.errorMessage
            ? html`<div class="outbox-error" role="alert">${this.model.errorMessage}</div>`
            : ""
        }
        ${
          this.model.resultMessage
            ? html`<div class="outbox-result" role="status">${this.model.resultMessage}</div>`
            : ""
        }

        <div class="outbox-groups">
          ${this.model.groups.map((group) =>
            this.renderGroup(group, isProcessing),
          )}
        </div>

        ${
          this.selectedEntryIds.size > 0
            ? html`
              <div class="outbox-actions">
                <button
                  class="btn-open-discard btn-danger"
                  ?disabled=${isProcessing}
                  @click=${this.handleOpenDiscard}
                >
                  選択した${this.selectedEntryIds.size}件を破棄
                </button>
              </div>
            `
            : ""
        }

        ${this.showDiscardModal ? this.renderDiscardModal() : ""}
      </div>
    `;
  }

  private renderGroup(group: OutboxPanelGroupViewModel, isProcessing: boolean) {
    const groupKey = `${group.ref.eventId}:${group.ref.dayId}`;
    const isGroupDisabled =
      this.selectedRefKey !== null && this.selectedRefKey !== groupKey;

    return html`
      <div class="outbox-group">
        <div class="outbox-group-header">
          <h4>${group.label} (${group.entries.length}件)</h4>
          <button
            class="btn-retry-group btn-secondary"
            ?disabled=${isProcessing}
            @click=${() => this.handleRetryGroup(group.ref)}
          >
            再送
          </button>
        </div>
        <ul class="outbox-entry-list">
          ${group.entries.map((entry) =>
            this.renderEntry(group, entry, isGroupDisabled),
          )}
        </ul>
      </div>
    `;
  }

  private renderEntry(
    group: OutboxPanelGroupViewModel,
    entry: OutboxEntryViewModel,
    isGroupDisabled: boolean,
  ) {
    const isChecked = this.selectedEntryIds.has(entry.id);

    return html`
      <li class="outbox-entry-item">
        <label class="outbox-entry-label">
          <input
            type="checkbox"
            class="entry-select"
            .checked=${isChecked}
            ?disabled=${isGroupDisabled}
            @change=${() => this.handleToggleEntry(group, entry.id)}
          />
          <span class="space-badge">${entry.space}</span>
          <span class="desired-badge">${entry.desiredLabel}</span>
          <span class="attempts-info">${entry.attemptsLabel}</span>
          ${
            entry.errorLabel
              ? html`<span class="error-badge">${entry.errorLabel}</span>`
              : ""
          }
        </label>
      </li>
    `;
  }

  private renderDiscardModal() {
    const isValid = this.confirmText === "未送信を破棄";

    return html`
      <div
        class="discard-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="outbox-discard-title"
        aria-describedby="outbox-discard-desc"
      >
        <div class="discard-modal-content">
          <h4 id="outbox-discard-title">未送信データの破棄</h4>
          <p id="outbox-discard-desc" class="discard-warning">
            選択した${this.selectedEntryIds.size}件の未送信GAS同期エントリを破棄します。<br />
            <strong>※破棄しても端末の購入・チェック状態は変更されません。GAS側のスプレッドシートと表示が異なる状態になります。</strong>
          </p>
          <p>実行するには <code>未送信を破棄</code> と正確に入力してください：</p>
          <input
            type="text"
            class="discard-confirm-input"
            .value=${this.confirmText}
            ?disabled=${this.discarding}
            @input=${(e: Event) => {
              this.confirmText = (e.target as HTMLInputElement).value;
            }}
            placeholder="未送信を破棄"
          />
          <div class="discard-modal-buttons">
            <button
              type="button"
              class="btn-cancel"
              @click=${this.handleCloseDiscard}
            >
              キャンセル
            </button>
            <button
              type="button"
              class="btn-confirm-discard btn-danger"
              ?disabled=${!isValid || this.discarding}
              @click=${this.handleConfirmDiscard}
            >
              破棄を実行
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("outbox-panel")) {
  customElements.define("outbox-panel", OutboxPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "outbox-panel": OutboxPanel;
  }
}
