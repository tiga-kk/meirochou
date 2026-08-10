import { html, LitElement, type PropertyValues } from "lit";
import type { RouteItineraryEntry } from "./route-itinerary-model";

/** Read-only modal for the current Route Guidance itinerary. */
export class RouteItineraryDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    entries: { attribute: false },
  };

  declare open: boolean;
  declare entries: readonly RouteItineraryEntry[];

  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    super();
    this.open = false;
    this.entries = [];
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (!changedProperties.has("open")) return;
    if (this.open) {
      const active = document.activeElement;
      this.previouslyFocused = active instanceof HTMLElement ? active : null;
      void this.updateComplete.then(() => {
        this.querySelector<HTMLButtonElement>(
          "#btn-close-itinerary",
        )?.focus();
      });
    } else if (this.previouslyFocused?.isConnected) {
      this.previouslyFocused.focus();
      this.previouslyFocused = null;
    }
  }

  private close(): void {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("itinerary-close", { bubbles: true, composed: true }),
    );
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.close();
  }

  protected render() {
    if (!this.open) return html``;
    return html`
      <div class="route-itinerary-backdrop" @keydown=${this.handleKeydown}>
        <section
          class="route-itinerary-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="route-itinerary-title"
        >
          <header class="route-itinerary-header">
            <h2 id="route-itinerary-title">予定</h2>
            <button
              type="button"
              id="btn-close-itinerary"
              class="btn-close-modal"
              aria-label="予定を閉じる"
              @click=${this.close}
            >
              ×
            </button>
          </header>
          <ol class="route-itinerary-list">
            ${this.entries.length === 0
              ? html`<li class="route-itinerary-empty">予定はありません</li>`
              : this.entries.map(
                  (entry) => html`
                    <li
                      data-itinerary-index=${entry.index}
                      data-space=${entry.space}
                      class=${entry.isCurrent ? "current" : ""}
                    >
                      <span class="route-itinerary-number">${entry.index}.</span>
                      <strong>${entry.space}</strong>
                      ${entry.isCurrent
                        ? html`<span class="route-itinerary-current">現在</span>`
                        : ""}
                    </li>
                  `,
                )}
          </ol>
        </section>
      </div>
    `;
  }
}

if (!customElements.get("route-itinerary-dialog")) {
  customElements.define("route-itinerary-dialog", RouteItineraryDialog);
}
