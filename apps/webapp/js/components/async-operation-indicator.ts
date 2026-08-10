import { html, LitElement } from "lit";

export type AsyncOperationStatus =
  | { readonly kind: "idle" }
  | {
      readonly kind: "loading";
      readonly label: string;
      readonly progress?: {
        readonly current: number;
        readonly total: number;
      };
    }
  | { readonly kind: "success"; readonly label: string }
  | { readonly kind: "error"; readonly label: string };

export class AsyncOperationIndicator extends LitElement {
  static properties = { status: { attribute: false } };
  declare status: AsyncOperationStatus;
  private successTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.status = { kind: "idle" };
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected updated(): void {
    if (this.successTimer) clearTimeout(this.successTimer);
    this.successTimer = null;
    if (this.status.kind === "success") {
      this.successTimer = setTimeout(() => {
        this.successTimer = null;
        this.status = { kind: "idle" };
      }, 1_500);
    }
  }

  disconnectedCallback(): void {
    if (this.successTimer) clearTimeout(this.successTimer);
    this.successTimer = null;
    super.disconnectedCallback();
  }

  protected render() {
    if (this.status.kind === "idle") return html``;
    return html`
      <div class="async-operation-indicator ${this.status.kind}" role="status" aria-live="polite">
        ${this.status.kind === "loading" ? html`<span class="async-operation-spinner" aria-hidden="true"></span>` : ""}
        <span>${this.status.label}</span>
      </div>
    `;
  }
}

if (!customElements.get("async-operation-indicator")) {
  customElements.define("async-operation-indicator", AsyncOperationIndicator);
}

declare global {
  interface HTMLElementTagNameMap {
    "async-operation-indicator": AsyncOperationIndicator;
  }
}
