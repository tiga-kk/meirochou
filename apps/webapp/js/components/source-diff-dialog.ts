import { html, LitElement, type PropertyValues } from "lit";
import { dispatchManagementEvent } from "../shared/ui/management-events";
import type { SourceDiffViewModel } from "../shared/ui/management-view-model";
import { DialogFocusController } from "../ui/dialog-focus";

export interface SourceDiffDialogModel {
  readonly open: boolean;
  readonly previewId: string;
  readonly sourceLabel: string;
  readonly diff: SourceDiffViewModel;
  readonly busy: boolean;
  readonly errorMessage: string;
}

/** Full-screen modal dialog for confirming CSV/GAS source updates. */
export class SourceDiffDialog extends LitElement {
  static properties = {
    model: { attribute: false },
  };

  declare model: SourceDiffDialogModel | null;

  private focusController: DialogFocusController | null = null;
  private wasOpen: boolean | null = null;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.focusController = new DialogFocusController(this, {
      onEscape: () => this.handleEscape(),
    });
  }

  disconnectedCallback(): void {
    if (this.wasOpen) {
      this.focusController?.deactivate();
      this.wasOpen = false;
    }
    super.disconnectedCallback();
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);

    const isOpen = Boolean(this.model?.open);
    if (isOpen !== this.wasOpen) {
      const previousWasOpen = this.wasOpen;
      this.wasOpen = isOpen;
      if (isOpen) {
        // The management surface may have inerted this nested modal host.
        this.removeAttribute("inert");
        this.removeAttribute("hidden");
        this.classList.remove("hidden");
        this.focusController?.activate();
      } else {
        this.setAttribute("hidden", "");
        this.classList.add("hidden");
        if (previousWasOpen === true) {
          this.focusController?.deactivate();
        }
      }
    }

    if (isOpen && changedProperties.has("model") && this.model?.errorMessage) {
      const alert = this.querySelector<HTMLElement>('[role="alert"]');
      if (alert) {
        alert.setAttribute("tabindex", "-1");
        alert.focus();
      }
    }
  }

  private handleEscape(): void {
    if (this.model?.busy || !this.model?.open) return;
    this.handleCancel();
  }

  private handleApply(): void {
    if (!this.model || this.model.busy) return;
    dispatchManagementEvent(this, "source-preview-apply", {
      previewId: this.model.previewId,
    });
  }

  private handleCancel(): void {
    if (this.model?.busy) return;
    dispatchManagementEvent(this, "source-preview-cancel", {});
  }

  protected render() {
    if (!this.model) return html``;

    const { open, sourceLabel, diff, busy, errorMessage } = this.model;

    return html`
      <div
        class="source-diff-dialog-overlay ${open ? "" : "hidden"}"
        ?hidden="${!open}"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-diff-title"
        aria-describedby="source-diff-desc"
      >
        <div class="source-diff-dialog-content">
          <header class="dialog-header">
            <h2 id="source-diff-title">ソース変更の確認: ${sourceLabel}</h2>
            <p id="source-diff-desc" class="counts-summary">${diff.countsLabel}</p>
          </header>

          ${
            errorMessage
              ? html`<div class="dialog-error-alert" role="alert">
                ${errorMessage}
              </div>`
              : ""
          }

          <div class="diff-sections-container">
            <details class="diff-section added" open>
              <summary>追加 (${diff.added.length}件)</summary>
              <ul>
                ${diff.added.map(
                  (row) =>
                    html`<li><span class="space-badge">${row.space}</span></li>`,
                )}
              </ul>
            </details>

            <details class="diff-section updated" open>
              <summary>更新 (${diff.updated.length}件)</summary>
              <ul>
                ${diff.updated.map(
                  (row) => html`
                    <li>
                      <span class="space-badge">${row.space}</span>
                      <span class="changed-fields">
                        (変更: ${row.changedFields.join(", ") || "基本情報"})
                      </span>
                    </li>
                  `,
                )}
              </ul>
            </details>

            <details class="diff-section removed" open>
              <summary>削除 (${diff.removed.length}件)</summary>
              <ul>
                ${diff.removed.map(
                  (row) =>
                    html`<li><span class="space-badge">${row.space}</span></li>`,
                )}
              </ul>
            </details>
          </div>

          <div class="preservation-notice">
            <p><strong>注意・補足事項:</strong></p>
            <ul>
              <li>ローカルの購入状況・キープ一覧・操作履歴は維持されます。</li>
              <li>ソースデータで頒布状態(isSale=x)が追加された場合、購入リストに追加されることがあります。</li>
              <li>ソースから削除されたサークルがあっても、ローカルの購入済み状態は自発的にキャンセルされません。</li>
            </ul>
          </div>

          <footer class="dialog-actions">
            <button
              type="button"
              class="btn btn-secondary"
              data-action="cancel"
              ?disabled="${busy}"
              @click="${this.handleCancel}"
            >
              キャンセル
            </button>
            <button
              type="button"
              class="btn btn-primary"
              data-action="apply"
              ?disabled="${busy}"
              @click="${this.handleApply}"
            >
              ${busy ? "適用中..." : "変更を適用"}
            </button>
          </footer>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("source-diff-dialog")) {
  customElements.define("source-diff-dialog", SourceDiffDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "source-diff-dialog": SourceDiffDialog;
  }
}
