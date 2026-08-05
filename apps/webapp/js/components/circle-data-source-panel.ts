import { html, LitElement, type PropertyValues } from "lit";
import type { EventDayRef } from "../features/event-day/domain/application-contract-types";
import { dispatchManagementEvent } from "../shared/ui/management-events";
import type { SourceSummaryViewModel } from "../shared/ui/management-view-model";

/** Safe, render-only source-management state supplied by ComiPathBrowserRuntime. */
export interface CircleDataSourcePanelModel {
  readonly activeRef: EventDayRef | null;
  readonly activeRefLabel: string;
  readonly source: SourceSummaryViewModel;
  readonly sourceType: "csv" | "gas";
  readonly gasUrlInput: string;
  readonly selectedSheetName: string;
  readonly sheetNames: readonly string[];
  readonly pendingCount: number;
  readonly canExportCsv?: boolean;
  readonly busy: boolean;
  readonly errorMessage: string;
}

const MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB

function isValidGasWebAppUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
    trimmed,
  );
}

function sameEventDay(
  left: EventDayRef | null,
  right: EventDayRef | null,
): boolean {
  return Boolean(
    left &&
      right &&
      left.eventId === right.eventId &&
      left.dayId === right.dayId,
  );
}

/** Light-DOM source selector that emits preview requests without persistence. */
export class CircleDataSourcePanel extends LitElement {
  static properties = {
    model: { attribute: false },
  };

  declare model: CircleDataSourcePanelModel | null;

  private activeTab: "csv" | "gas" = "csv";
  private localGasUrl = "";
  private localSheetName = "";
  private gasUrlDirty = false;
  private sheetNameDirty = false;
  private localError = "";

  constructor() {
    super();
    this.model = null;
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("model") && this.model) {
      const oldModel = changedProperties.get(
        "model",
      ) as CircleDataSourcePanelModel | null;
      if (!oldModel || oldModel.sourceType !== this.model.sourceType) {
        this.activeTab = this.model.sourceType;
      }
      const eventDayChanged =
        !oldModel || !sameEventDay(oldModel.activeRef, this.model.activeRef);
      const sourceChanged =
        !oldModel || oldModel.sourceType !== this.model.sourceType;
      if (eventDayChanged || sourceChanged) {
        this.localGasUrl = this.model.gasUrlInput;
        this.gasUrlDirty = false;
      }
      if (!this.gasUrlDirty && oldModel?.gasUrlInput !== this.model.gasUrlInput) {
        this.localGasUrl = this.model.gasUrlInput;
      }
      if (eventDayChanged || sourceChanged) {
        this.localSheetName = this.model.selectedSheetName;
        this.sheetNameDirty = false;
      }
      if (
        !this.sheetNameDirty &&
        oldModel?.selectedSheetName !== this.model.selectedSheetName
      ) {
        this.localSheetName = this.model.selectedSheetName;
      }
    }
  }

  private handleTabSwitch(tab: "csv" | "gas"): void {
    if (this.model?.pendingCount || this.model?.busy) return;
    this.activeTab = tab;
    this.localError = "";
    this.requestUpdate();
  }

  private handleFileChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (this.model?.pendingCount || this.model?.busy) {
      input.value = "";
      return;
    }

    if (!/\.csv$/i.test(file.name)) {
      this.localError = "拡張子が .csv のファイルを選択してください。";
      input.value = "";
      this.requestUpdate();
      return;
    }

    if (file.size > MAX_CSV_SIZE_BYTES) {
      this.localError = "ファイルサイズは5MB以下にしてください。";
      input.value = "";
      this.requestUpdate();
      return;
    }

    this.localError = "";
    dispatchManagementEvent(this, "csv-preview-request", { file });
    input.value = "";
    this.requestUpdate();
  }

  private handleGasUrlInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.localGasUrl = input.value;
    this.localSheetName = "";
    this.gasUrlDirty = true;
    this.sheetNameDirty = false;
    this.localError = "";
    this.requestUpdate();
  }

  private handleFetchSheets(): void {
    if (this.model?.pendingCount || this.model?.busy) return;
    const url = this.localGasUrl.trim();
    if (!isValidGasWebAppUrl(url)) {
      this.localError =
        "有効なGoogle Apps ScriptのWebApp URL (https://script.google.com/macros/s/.../exec) を入力してください。";
      this.requestUpdate();
      return;
    }

    this.localError = "";
    dispatchManagementEvent(this, "gas-sheets-request", { gasUrl: url });
    this.requestUpdate();
  }

  private handleSheetSelect(e: Event): void {
    const select = e.target as HTMLSelectElement;
    this.localSheetName = select.value;
    this.sheetNameDirty = true;
    this.localError = "";
    this.requestUpdate();
  }

  private handleGasPreviewRequest(): void {
    if (this.model?.pendingCount || this.model?.busy) return;
    const url = this.localGasUrl.trim();
    const availableSheetNames =
      this.localGasUrl === this.model?.gasUrlInput
        ? this.model?.sheetNames || []
        : [];
    const sheetName = this.localSheetName || availableSheetNames[0] || "";

    if (!isValidGasWebAppUrl(url)) {
      this.localError = "有効なWebApp URLを入力してください。";
      this.requestUpdate();
      return;
    }
    if (!sheetName) {
      this.localError = "シート名を選択してください。";
      this.requestUpdate();
      return;
    }

    // Determine initial/replacement/refresh mode
    let mode: "initial" | "replacement" | "refresh" = "replacement";
    if (this.model?.source.typeLabel === "CSV") {
      mode = "initial";
    } else if (
      this.model?.source.typeLabel === "Googleスプレッドシート" &&
      this.model?.source.detail === sheetName
    ) {
      mode = "refresh";
    }

    this.localError = "";
    dispatchManagementEvent(this, "gas-preview-request", {
      source: {
        type: "gas",
        gasUrl: url,
        sheetName,
      },
      mode,
    });
    this.requestUpdate();
  }

  private handleCsvExportRequest(): void {
    if (!this.model?.canExportCsv || this.model.busy || !this.model.activeRef) {
      return;
    }
    dispatchManagementEvent(this, "csv-export-request", {
      ref: { ...this.model.activeRef },
    });
  }

  protected render() {
    if (!this.model) return html``;

    const disabled = this.model.pendingCount > 0 || this.model.busy;
    const exportDisabled =
      !this.model.canExportCsv ||
      this.model.pendingCount > 0 ||
      this.model.busy;
    const displayError = this.localError || this.model.errorMessage;
    const availableSheetNames =
      this.localGasUrl === this.model.gasUrlInput ? this.model.sheetNames : [];

    return html`
      <div class="source-manager-panel">
        <div class="source-summary-card">
          <h3>現在の日程: ${this.model.activeRefLabel}</h3>
          <p class="source-detail">
            ソース: <strong>${this.model.source.typeLabel}</strong>
            ${this.model.source.detail ? ` (${this.model.source.detail})` : ""}
          </p>
          ${
            this.model.source.endpointSummary
              ? html`<p class="endpoint-summary">
                ホスト: ${this.model.source.endpointSummary}
              </p>`
              : ""
          }
          <div class="source-actions">
            <button
              type="button"
              class="btn-csv-export"
              data-action="csv-export"
              ?disabled="${exportDisabled}"
              @click="${this.handleCsvExportRequest}"
            >
              CSVエクスポート
            </button>
          </div>
        </div>

        ${
          this.model.pendingCount > 0
            ? html`
              <div class="pending-warning-box" role="alert">
                送信待ちのGAS同期が ${this.model.pendingCount}
                件あります。データ同期を完了するか、送信待ちを破棄してからソースを変更してください。
              </div>
            `
            : ""
        }

        <div class="source-type-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected="${this.activeTab === "csv"}"
            ?disabled="${disabled}"
            @click="${() => this.handleTabSwitch("csv")}"
          >
            CSVファイル
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="${this.activeTab === "gas"}"
            ?disabled="${disabled}"
            @click="${() => this.handleTabSwitch("gas")}"
          >
            Googleスプレッドシート
          </button>
        </div>

        ${
          displayError
            ? html`<div class="form-error-message" role="alert">
              ${displayError}
            </div>`
            : ""
        }
        ${
          this.activeTab === "csv"
            ? html`
              <div class="csv-source-form">
                <label for="csv-file-input">CSVファイルを選択 (5MB以下):</label>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  ?disabled="${disabled}"
                  @change="${this.handleFileChange}"
                />
              </div>
            `
            : html`
              <div class="gas-source-form">
                <div class="form-field">
                  <label for="gas-url-input">WebApp URL:</label>
                  <input
                    id="gas-url-input"
                    type="text"
                    .value="${this.localGasUrl}"
                    ?disabled="${disabled}"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    @input="${this.handleGasUrlInput}"
                  />
                  <button
                    type="button"
                    data-action="fetch-sheets"
                    ?disabled="${disabled || !this.localGasUrl.trim()}"
                    @click="${this.handleFetchSheets}"
                  >
                    シート一覧を取得
                  </button>
                </div>

                ${
                  availableSheetNames.length > 0
                    ? html`
                      <div class="form-field">
                        <label for="gas-sheet-select">シート選択:</label>
                        <select
                          id="gas-sheet-select"
                          .value="${
                            this.localSheetName || availableSheetNames[0]
                          }"
                          ?disabled="${disabled}"
                          @change="${this.handleSheetSelect}"
                        >
                          ${availableSheetNames.map(
                            (name) => html`
                              <option
                                value="${name}"
                                ?selected="${
                                  name ===
                                  (this.localSheetName ||
                                    this.model?.selectedSheetName)
                                }"
                              >
                                ${name}
                              </option>
                            `,
                          )}
                        </select>
                        <button
                          type="button"
                          data-action="gas-preview"
                          ?disabled="${disabled}"
                          @click="${this.handleGasPreviewRequest}"
                        >
                          プレビューを表示
                        </button>
                      </div>
                    `
                    : ""
                }
              </div>
            `
        }
      </div>
    `;
  }
}

if (!customElements.get("source-manager")) {
  customElements.define("source-manager", CircleDataSourcePanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "source-manager": CircleDataSourcePanel;
  }
}
