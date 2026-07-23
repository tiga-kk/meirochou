import { html, LitElement, nothing, type PropertyValues } from "lit";
import type { EventDayOption } from "../ui/management-view-model";
import "./event-day-selector";

export interface SettingsGasUrlChangeDetail {
  gasUrl: string;
}

export interface SettingsSelectionChangeDetail {
  selectedSheets: string[];
}

/**
 * GAS URLと対象シートの設定UI。状態はAppから受け取り、操作はCustomEventで通知する。
 */
export class ComipathSettings extends LitElement {
  static properties = {
    open: { type: Boolean },
    gasUrl: { type: String },
    sheets: { attribute: false },
    selectedSheets: { attribute: false },
    busy: { type: Boolean },
    errorMessage: { type: String },
    eventDayOptions: { attribute: false },
    selectedEventId: { type: String },
    selectedDayId: { type: String },
  };

  declare open: boolean;
  declare gasUrl: string;
  declare sheets: readonly string[];
  declare selectedSheets: readonly string[];
  declare busy: boolean;
  declare errorMessage: string;
  declare eventDayOptions: readonly EventDayOption[];
  declare selectedEventId: string;
  declare selectedDayId: string;

  constructor() {
    super();
    this.open = false;
    this.gasUrl = "";
    this.sheets = [];
    this.selectedSheets = [];
    this.busy = false;
    this.errorMessage = "";
    this.eventDayOptions = [];
    this.selectedEventId = "";
    this.selectedDayId = "";
  }

  /** Light DOMを使い、既存のフォームCSSとアクセシビリティIDを維持する。 */
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("open")) this.classList.toggle("show", this.open);
  }

  private dispatchSettingsEvent<T>(name: string, detail?: T): void {
    this.dispatchEvent(
      new CustomEvent<T>(name, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleGasInput(event: Event): void {
    const gasUrl = (event.currentTarget as HTMLInputElement).value;
    this.gasUrl = gasUrl;
    this.dispatchSettingsEvent<SettingsGasUrlChangeDetail>(
      "settings-gas-url-change",
      { gasUrl },
    );
  }

  private handleSelection(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const selected = new Set(this.selectedSheets);
    if (input.checked) selected.add(input.value);
    else selected.delete(input.value);
    this.selectedSheets = this.sheets.filter((sheet) => selected.has(sheet));
    this.dispatchSettingsEvent<SettingsSelectionChangeDetail>(
      "settings-selection-change",
      { selectedSheets: [...this.selectedSheets] },
    );
  }

  protected render() {
    return html`
      <h2>設定</h2>
      <event-day-selector
        .options=${this.eventDayOptions}
        .selectedEventId=${this.selectedEventId}
        .selectedDayId=${this.selectedDayId}
        ?busy=${this.busy}
        .errorMessage=${this.errorMessage}
      ></event-day-selector>

      <div class="input-group" style="margin-top: 1rem">
        <label for="gas-url">GAS Web App URL</label>
        <div class="input-row">
          <input
            type="text"
            id="gas-url"
            placeholder="https://script.google.com/..."
            style="text-align: left"
            .value=${this.gasUrl}
            ?disabled=${this.busy}
            @input=${this.handleGasInput}
          />
          <button
            id="btn-refresh"
            class="btn btn-secondary"
            style="width: auto"
            ?disabled=${this.busy}
            @click=${() => this.dispatchSettingsEvent("settings-refresh-request")}
            aria-label="データを更新"
          >
            <i class="fa-solid fa-rotate"></i>
          </button>
        </div>
      </div>
      <p style="font-size: 0.8rem; color: var(--text-sub); margin-top: 0.5rem">
        ※URLを入力して更新ボタンを押してください
      </p>
      <div class="input-group" style="margin-top: 1rem">
        <label>対象シート選択</label>
        <button
          id="btn-fetch-sheets"
          class="btn btn-secondary btn-sm"
          style="width: auto; margin-bottom: 0.5rem"
          ?disabled=${this.busy}
          @click=${() => this.dispatchSettingsEvent("settings-fetch-sheets-request")}
        >
          <i class="fa-solid fa-list"></i> シート一覧を取得
        </button>
        <div id="sheet-list-container" class="sheet-list-container">
          ${
            this.sheets.length === 0
              ? nothing
              : this.sheets.map(
                  (sheet) => html`
              <div class="sheet-item">
                <input
                  type="checkbox"
                  id=${`sheet-${sheet}`}
                  .value=${sheet}
                  ?checked=${this.selectedSheets.includes(sheet)}
                  ?disabled=${this.busy}
                  @change=${this.handleSelection}
                />
                <label for=${`sheet-${sheet}`}>${sheet}</label>
              </div>
            `,
                )
          }
        </div>
      </div>
    `;
  }
}

if (!customElements.get("comipath-settings")) {
  customElements.define("comipath-settings", ComipathSettings);
}

declare global {
  interface HTMLElementTagNameMap {
    "comipath-settings": ComipathSettings;
  }
}
