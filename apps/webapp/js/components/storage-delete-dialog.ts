import { html, LitElement, type PropertyValues } from "lit";
import { dispatchManagementEvent } from "../shared/ui/management-events";
import type {
  DeleteOptionViewModel,
  DeleteScope,
} from "../shared/ui/management-view-model";
import { DialogFocusController } from "../ui/dialog-focus";

export interface StorageDeleteDialogModel {
  readonly open: boolean;
  readonly scope: DeleteScope | null;
  readonly option: DeleteOptionViewModel | null;
  readonly eventDayLabel: string;
  readonly busy: boolean;
  readonly errorMessage: string;
}

/**
 * Modal dialog for confirming failure-safe scoped local data deletions,
 * requiring explicit consent and optional confirmation phrase before emitting storage-delete-request.
 */
export class StorageDeleteDialog extends LitElement {
  static properties = {
    model: { attribute: false },
    consentChecked: { state: true },
    confirmText: { state: true },
    submitting: { state: true },
  };

  declare model: StorageDeleteDialogModel | null;
  declare consentChecked: boolean;
  declare confirmText: string;
  declare submitting: boolean;

  private isOpen = false;

  private readonly focusController = new DialogFocusController(this, {
    onEscape: () => this.handleClose(),
  });

  constructor() {
    super();
    this.model = null;
    this.consentChecked = false;
    this.confirmText = "";
    this.submitting = false;
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    const nextOpen = Boolean(this.model?.open);
    if (nextOpen && !this.isOpen) {
      this.isOpen = true;
      this.focusController.activate();
    } else if (!nextOpen && this.isOpen) {
      this.isOpen = false;
      this.focusController.deactivate();
      this.consentChecked = false;
      this.confirmText = "";
      this.submitting = false;
    }

    if (
      nextOpen &&
      changedProperties.has("model") &&
      this.model?.errorMessage
    ) {
      this.submitting = false;
      const alert = this.querySelector<HTMLElement>('[role="alert"]');
      if (alert) {
        alert.setAttribute("tabindex", "-1");
        alert.focus();
      }
    }
  }

  disconnectedCallback(): void {
    if (this.isOpen) {
      this.focusController.deactivate();
      this.isOpen = false;
    }
    super.disconnectedCallback();
  }

  private handleClose(): void {
    if (this.model?.busy) return;
    this.consentChecked = false;
    this.confirmText = "";
    if (this.model) {
      this.model = { ...this.model, open: false };
    }
    dispatchManagementEvent(this, "storage-delete-cancel", {});
  }

  private handleConfirm(): void {
    if (
      !this.model?.scope ||
      this.model.busy ||
      this.submitting ||
      !this.consentChecked
    ) {
      return;
    }
    if (
      this.model.scope.type === "all-events" &&
      this.confirmText !== "全イベントを削除"
    ) {
      return;
    }

    dispatchManagementEvent(this, "storage-delete-request", {
      scope: this.model.scope,
      confirmation: this.confirmText,
    });
    this.submitting = true;
  }

  protected render() {
    if (!this.model?.open || !this.model.option) {
      return html``;
    }

    const isAllEvents = this.model.scope?.type === "all-events";
    const isConfirmValid =
      this.consentChecked &&
      (!isAllEvents || this.confirmText === "全イベントを削除");

    return html`
      <div
        class="modal-overlay modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="storage-delete-dialog-title"
        aria-describedby="storage-delete-dialog-desc"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.handleClose();
        }}
      >
        <div class="modal-content delete-modal-content">
          <h3 id="storage-delete-dialog-title">データ削除の確認</h3>
          <p id="storage-delete-dialog-desc" class="delete-target-info">
            <strong>対象:</strong> ${this.model.option.label} (${this.model.eventDayLabel})
          </p>

          <p class="delete-consequence">${this.model.option.consequence}</p>

          ${
            this.model.option.pendingDiscardCount > 0
              ? html`
                <p class="delete-pending-warning" role="alert">
                  この操作では未送信GAS同期 ${this.model.option.pendingDiscardCount}件も破棄されます。<br />
                  GAS側へは送信されません。
                </p>
              `
              : ""
          }

          ${
            this.model.errorMessage
              ? html`<div class="error-alert" role="alert">${this.model.errorMessage}</div>`
              : ""
          }

          <div class="consent-group">
            <label class="consent-label">
              <input
                type="checkbox"
                class="consent-check"
                .checked=${this.consentChecked}
                ?disabled=${this.model.busy || this.submitting}
                @change=${(e: Event) => {
                  this.consentChecked = (e.target as HTMLInputElement).checked;
                }}
              />
              <span>注意事項を確認し、データの削除に同意します。</span>
            </label>
          </div>

          ${
            isAllEvents
              ? html`
                <div class="confirm-phrase-group">
                  <p>実行するには <code>全イベントを削除</code> と正確に入力してください：</p>
                  <input
                    type="text"
                    class="delete-confirm-input"
                    .value=${this.confirmText}
                    ?disabled=${this.model.busy || this.submitting}
                    @input=${(e: Event) => {
                      this.confirmText = (e.target as HTMLInputElement).value;
                    }}
                    placeholder="全イベントを削除"
                  />
                </div>
              `
              : ""
          }

          <div class="modal-buttons">
            <button
              type="button"
              class="btn-cancel btn-secondary"
              ?disabled=${this.model.busy}
              @click=${this.handleClose}
            >
              キャンセル
            </button>
            <button
              type="button"
              class="btn-confirm-delete btn-danger"
              ?disabled=${!isConfirmValid || this.model.busy || this.submitting}
              @click=${this.handleConfirm}
            >
              ${this.model.busy ? "削除中…" : "削除を実行"}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("storage-delete-dialog")) {
  customElements.define("storage-delete-dialog", StorageDeleteDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "storage-delete-dialog": StorageDeleteDialog;
  }
}
