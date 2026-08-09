import { html, LitElement, type PropertyValues } from "lit";
import { DialogFocusController } from "../ui/dialog-focus";

/** Permanent, read-only in-app guide for first-time users. */
export class UserGuideDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
  };

  declare open: boolean;

  private focusController: DialogFocusController | null = null;
  private wasOpen = false;

  constructor() {
    super();
    this.open = false;
  }

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.focusController = new DialogFocusController(this, {
      onEscape: () => this.close(),
    });
  }

  disconnectedCallback(): void {
    if (this.wasOpen) this.focusController?.deactivate();
    super.disconnectedCallback();
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (!changedProperties.has("open")) return;
    if (this.open && !this.wasOpen) {
      this.wasOpen = true;
      this.focusController?.activate();
    } else if (!this.open && this.wasOpen) {
      this.wasOpen = false;
      this.focusController?.deactivate();
    }
  }

  private close(): void {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("user-guide-close", { bubbles: true, composed: true }),
    );
  }

  private handleBackdropClick(event: Event): void {
    if (event.target === event.currentTarget) this.close();
  }

  protected render() {
    if (!this.open) return html``;
    return html`
      <div class="user-guide-backdrop" @click=${this.handleBackdropClick}>
        <section
          class="user-guide-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-guide-title"
          aria-describedby="user-guide-intro"
        >
          <header class="user-guide-header">
            <h2 id="user-guide-title">使い方</h2>
            <button
              type="button"
              class="btn-close-modal"
              id="btn-close-user-guide"
              aria-label="使い方を閉じる"
              @click=${this.close}
            >
              ×
            </button>
          </header>
          <div class="user-guide-body">
            <p id="user-guide-intro">
              現在地を設定して「次の目的地を検索」を押すと案内が始まります。使い方はいつでも確認できます。
            </p>

            <section aria-labelledby="user-guide-csv-title">
              <h3 id="user-guide-csv-title">CSVを使う</h3>
              <p>お品書きのCSVを読み込むと、端末に巡回リストを保存できます。</p>
              <p>列名は大文字・小文字を区別します。</p>
              <dl class="user-guide-fields">
                <div><dt>space</dt><dd>必須。スペースコード。</dd></div>
                <div><dt>priority</dt><dd>任意。空欄は許可され、入力時は有限の数値。</dd></div>
                <div><dt>isSale</dt><dd>任意。販売状態。</dd></div>
                <div><dt>account</dt><dd>任意。アカウント情報。</dd></div>
                <div><dt>tweet</dt><dd>任意。投稿・画像リンク。</dd></div>
                <div><dt>memo</dt><dd>任意。サークルメモ。</dd></div>
              </dl>
              <p>
                未知の列は無視されます。<code>space</code>列の欠落、行の<code>space</code>欠落、同じ<code>space</code>の重複、不正な<code>priority</code>はエラーです。
              </p>
            </section>

            <section aria-labelledby="user-guide-gas-title">
              <h3 id="user-guide-gas-title">Google Spreadsheet / GASを使う</h3>
              <p>
                自分のSpreadsheetにGASを配置・デプロイし、発行したWebアプリURLを設定画面へ保存します。URLや認証情報はこのアプリには含まれません。
              </p>
              <p>ヘッダーはcase-sensitiveです。</p>
              <ul>
                <li><code>space</code>は必須です。</li>
                <li><code>priority</code>、<code>isSale</code>、<code>account</code>、<code>tweet</code>、<code>memo</code>は読み込み時は任意です。</li>
                <li>購入結果を書き戻す場合は<code>isSale</code>列が必要です。</li>
                <li>未知の列は無視されます。認識済みヘッダーの重複と、<code>space</code>がない行は拒否されます。</li>
              </ul>
            </section>

            <section aria-labelledby="user-guide-route-title">
              <h3 id="user-guide-route-title">地図と経路変更</h3>
              <p>
                地図のピンから候補を選ぶと候補パネルが開きます。「候補」→「経路を比較」→「この地点に変更」の順で確定します。
              </p>
              <p>比較前の「閉じる」は候補選択を終了します。比較中の「戻る」は候補パネルへ戻ります。</p>
            </section>

            <section aria-labelledby="user-guide-gallery-title">
              <h3 id="user-guide-gallery-title">一覧とスワイプ</h3>
              <p>一覧のお品書きは、カードの外側へスワイプすると購入済みにできます。</p>
              <ul>
                <li>左列の縦長カードは左方向へスワイプします。</li>
                <li>右列の縦長カードは右方向へスワイプします。</li>
                <li>横長カードは左右どちらにも対応します。</li>
              </ul>
              <p>縦に動かすときは、ページのスクロールが優先されます。</p>
            </section>

            <section aria-labelledby="user-guide-outbox-title">
              <h3 id="user-guide-outbox-title">未送信GASデータ</h3>
              <p>
                GASへの送信に失敗しても、購入状態は先に端末へ保存されます。未送信データは設定画面から再送できます。
              </p>
            </section>
          </div>
        </section>
      </div>
    `;
  }
}

if (!customElements.get("user-guide-dialog")) {
  customElements.define("user-guide-dialog", UserGuideDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "user-guide-dialog": UserGuideDialog;
  }
}
