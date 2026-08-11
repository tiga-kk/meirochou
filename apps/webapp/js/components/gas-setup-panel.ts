import { html, LitElement } from "lit";

const GAS_CODE_URL = "/assets/integrations/gas-spreadsheet/Code.gs.txt";

/** Provides the repository-generated GAS artifact and a clipboard fallback. */
export class GasSetupPanel extends LitElement {
  static properties = {
    busy: { state: true },
    errorMessage: { state: true },
    manualCode: { state: true },
    statusMessage: { state: true },
  };

  private declare busy: boolean;
  private declare errorMessage: string;
  private declare manualCode: string;
  private declare statusMessage: string;

  constructor() {
    super();
    this.busy = false;
    this.errorMessage = "";
    this.manualCode = "";
    this.statusMessage = "";
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  async copyGasCode(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.errorMessage = "";
    this.statusMessage = "";
    this.manualCode = "";
    try {
      const response = await fetch(GAS_CODE_URL);
      if (!response.ok) throw new Error("GAS artifact request failed");
      const code = await response.text();
      try {
        if (!navigator.clipboard?.writeText)
          throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(code);
        this.statusMessage = "GASコードをコピーしました";
      } catch {
        this.manualCode = code;
        this.statusMessage =
          "GASコードを取得しました。Clipboard APIが使えないため、下の内容を手動でコピーしてください。";
      }
    } catch {
      this.errorMessage = "GASコードを取得できませんでした";
    } finally {
      this.busy = false;
    }
  }

  protected render() {
    return html`
      <section class="gas-setup-panel" aria-labelledby="gas-setup-title">
        <h3 id="gas-setup-title">GASセットアップ</h3>
        <p>生成済みのGASコードをSpreadsheetのApps Scriptへ貼り付けてください。</p>
        <button
          type="button"
          class="btn btn-secondary"
          data-action="copy-gas-code"
          ?disabled=${this.busy}
          @click=${this.copyGasCode}
        >${this.busy ? "取得中…" : "GASコードをコピー"}</button>
        ${
          this.statusMessage
            ? html`<p class="gas-setup-status" role="status">${this.statusMessage}</p>`
            : ""
        }
        ${
          this.errorMessage
            ? html`<p class="gas-setup-error" role="alert">${this.errorMessage}</p>`
            : ""
        }
        ${
          this.manualCode
            ? html`<textarea
              class="gas-setup-manual-code"
              readonly
              rows="8"
              aria-label="GASコード手動コピー用"
              .value=${this.manualCode}
            ></textarea>`
            : ""
        }
      </section>
    `;
  }
}

if (!customElements.get("gas-setup-panel")) {
  customElements.define("gas-setup-panel", GasSetupPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "gas-setup-panel": GasSetupPanel;
  }
}
