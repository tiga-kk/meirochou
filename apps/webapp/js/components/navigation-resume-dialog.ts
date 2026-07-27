import { css, html, LitElement } from "lit";

export class NavigationResumeDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    targetSpace: { type: String, reflect: true },
    errorMessage: { type: String },
  };

  private _open = false;
  private _targetSpace = "";
  private _errorMessage = "";
  private previouslyFocused: HTMLElement | null = null;

  get open(): boolean {
    return this._open;
  }
  set open(val: boolean) {
    const oldVal = this._open;
    this._open = val;
    this.requestUpdate("open", oldVal);
  }

  get targetSpace(): string {
    return this._targetSpace;
  }
  set targetSpace(val: string) {
    const oldVal = this._targetSpace;
    this._targetSpace = val;
    this.requestUpdate("targetSpace", oldVal);
  }

  get errorMessage(): string {
    return this._errorMessage;
  }
  set errorMessage(val: string) {
    const oldVal = this._errorMessage;
    this._errorMessage = val;
    this.requestUpdate("errorMessage", oldVal);
  }

  protected updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has("open")) {
      if (this.open) {
        const active = document.activeElement;
        this.previouslyFocused = active instanceof HTMLElement ? active : null;
        void this.updateComplete.then(() => {
          this.shadowRoot?.querySelector<HTMLButtonElement>("button")?.focus();
        });
      } else if (this.previouslyFocused?.isConnected) {
        this.previouslyFocused.focus();
        this.previouslyFocused = null;
      }
    }
  }

  static styles = css`
    :host {
      display: block;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .dialog {
      background: #ffffff;
      padding: 24px;
      border-radius: 12px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }
    h2 {
      margin: 0 0 12px 0;
      font-size: 1.25rem;
    }
    p {
      margin: 0 0 20px 0;
      color: #4b5563;
      font-size: 0.95rem;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    button {
      min-height: 44px;
      padding: 8px 16px;
      font-size: 1rem;
      border-radius: 6px;
      cursor: pointer;
    }
    .btn-primary {
      background: #2563eb;
      color: white;
      border: none;
    }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
    }
  `;

  private handleResume() {
    this.dispatchEvent(
      new CustomEvent("resume-confirm", { bubbles: true, composed: true }),
    );
  }

  private handleResetStart() {
    this.dispatchEvent(
      new CustomEvent("resume-reset-start", { bubbles: true, composed: true }),
    );
    this.open = false;
  }

  private handleBackdropClick(event: Event) {
    if (event.target !== event.currentTarget) return;
    event.stopPropagation();
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.handleResetStart();
      return;
    }

    if (event.key !== "Tab") return;
    const buttons = Array.from(
      this.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    if (buttons.length === 0) return;

    const current = this.shadowRoot?.activeElement;
    const currentIndex = buttons.indexOf(current as HTMLButtonElement);
    const nextIndex = event.shiftKey
      ? currentIndex <= 0
        ? buttons.length - 1
        : currentIndex - 1
      : currentIndex === buttons.length - 1
        ? 0
        : currentIndex + 1;

    event.preventDefault();
    buttons[nextIndex]?.focus();
  }

  render() {
    if (!this.open) return null;

    return html`
      <div
        class="backdrop"
        role="presentation"
        @click=${this.handleBackdropClick}
        @keydown=${this.handleKeydown}
      >
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="navigation-resume-title"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <h2 id="navigation-resume-title">案内を再開しますか？</h2>
        <p>前回の案内状態（目的地: ${this.targetSpace || "未設定"}）が保存されています。</p>
        ${
          this.errorMessage
            ? html`<p role="alert">${this.errorMessage}</p>`
            : ""
        }
          <div class="actions">
            <button type="button" class="btn-primary" @click=${this.handleResume}>案内を再開</button>
            <button type="button" class="btn-secondary" @click=${this.handleResetStart}>始点を設定し直す</button>
          </div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("navigation-resume-dialog")) {
  customElements.define("navigation-resume-dialog", NavigationResumeDialog);
}
