# Phase 7.2 Task 2: catalog page用Chrome拡張をrepositoryへ追加

## 目標

catalog pageからサークルspaceとcatalog image URLを抽出し、Task 1の`upsertCatalog` contractで指定GAS Web Appへ送るChrome拡張を`apps/catalog-extension/`へ追加する。

## やってはいけないこと

- GAS URL、sheet名、個人tokenをsourceへhardcodeしない。
- page全体の文字列からspaceを推測しない。
- ユーザーが明示操作していない全サークルを自動crawlしない。
- `innerHTML`から雑にURLを抜かない。DOM property (`currentSrc`/`src`)を優先する。
- catalog pageの既存form/actionを改変しない。
- extension失敗をpageのnavigationへ影響させない。

## 対象ファイル

**作成:**
- `apps/catalog-extension/manifest.json`
- `apps/catalog-extension/content.js`
- `apps/catalog-extension/background.js`
- `apps/catalog-extension/options.html`
- `apps/catalog-extension/options.js`
- `apps/catalog-extension/popup.html`
- `apps/catalog-extension/popup.js`
- `apps/catalog-extension/README.md`
- `apps/catalog-extension/lib/catalog-extractor.js`
- `apps/catalog-extension/lib/catalog-client.js`
- `tests/catalog-extension-extractor.test.mjs`
- `tests/catalog-extension-client.test.mjs`
- `tests/fixtures/catalog-extension/circle-page.html`

**変更:**
- `package.json`（`test:catalog-extension`を追加）
- `.gitignore`（必要なlocal package/outputだけ。sourceは除外しない）

## Manifest契約

Manifest V3を使う。

```json
{
  "manifest_version": 3,
  "name": "ComiPath Catalog Sender",
  "version": "0.1.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://catalog.youyou.co.jp/*",
    "https://script.google.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://catalog.youyou.co.jp/*"],
      "js": ["lib/catalog-extractor.js", "content.js"],
      "run_at": "document_idle"
    }
  ],
  "background": { "service_worker": "background.js" },
  "options_page": "options.html",
  "action": { "default_popup": "popup.html" }
}
```

実際のGAS endpointが`script.googleusercontent.com`へredirectする場合は、実機通信で必要と確認されたhostだけ追加する。無関係な`<all_urls>`は使わない。

## space抽出contract

primary selectorは固定する。

```js
export const SPACE_SELECTOR =
  "#mainSection > div.m-media.m-circletable > div.m-media__image > div.space-box > div";
```

```js
export function extractSpace(document) {
  const primary = document.querySelector(SPACE_SELECTOR);
  if (primary?.textContent?.trim()) return normalizeSpace(primary.textContent);

  const fallback = document.querySelector(
    "#mainSection .m-media.m-circletable .m-media__image .space-box > div",
  );
  return fallback?.textContent?.trim()
    ? normalizeSpace(fallback.textContent)
    : null;
}
```

`normalizeSpace()`は全角/半角空白と改行を除去するだけに留め、別のspaceへ推測変換しない。

## catalog image URL抽出contract

サークルmedia containerを基準に画像を探す。

```js
export function extractCatalogImageUrl(document) {
  const root = document.querySelector(
    "#mainSection .m-media.m-circletable .m-media__image",
  );
  const image = root?.querySelector("img");
  const raw = image?.currentSrc || image?.src || "";
  return normalizeHttpUrl(raw);
}
```

実際のfixtureで画像が別要素にある場合は、そのDOM事実に基づくselectorを追加する。CSS background等を憶測で広域探索しない。

## extension storage contract

`chrome.storage.sync`へ次だけ保存する。

```ts
interface CatalogExtensionSettings {
  gasUrl: string;
  sheetName: string;
}
```

保存前に:

- `gasUrl`はHTTPSかつ許可hostであること。
- `sheetName`はtrim後non-empty。

## message contract

content scriptはDOM抽出だけを行い、network POSTはbackground service workerへ委譲する。

```js
{
  type: "COMIPATH_SEND_CATALOG",
  payload: { space, tweet }
}
```

backgroundはstorageから`gasUrl`/`sheetName`を読み、Task 1 contractへ変換する。

```js
{
  action: "upsertCatalog",
  sheetName,
  space,
  tweet
}
```

response:

```js
{ ok: true, stored: { space, tweet } }
// or
{ ok: false, message: "..." }
```

## popup UX

popupは現在pageの抽出結果を表示する。

```text
スペース: 東ア01a
画像: https://...
[このお品書きをGASへ送る]
```

設定不足なら送信buttonをdisabledにし、「設定を開く」を表示する。送信中の二重clickを防ぐ。

## 手順

- [ ] **Step 1: real DOMを再確認しfixtureへ最小構造を保存する**
  - user指定space selectorが一致する構造をfixtureへ入れる。
  - catalog image elementは実ページで確認したselector/propertyだけをfixtureへ入れる。

- [ ] **Step 2: extractor RED testsを書く**
  - primary selector success。
  - scoped fallback success。
  - missing spaceは`null`。
  - currentSrc/srcからHTTPS image URL。
  - `javascript:`等は拒否。

- [ ] **Step 3: extractorを実装する**

- [ ] **Step 4: client RED testsを書く**
  - exact `upsertCatalog` JSON。
  - non-2xx/error payload。
  - URL/sheet validation。

- [ ] **Step 5: background/clientを実装する**

- [ ] **Step 6: popup/optionsを実装する**
  - settings save/read。
  - extraction result表示。
  - explicit send。

- [ ] **Step 7: manifest permission auditを行う**
  - `<all_urls>`なし。
  - content script matchはcatalog siteに限定。
  - GAS hostは実通信に必要な範囲だけ。

- [ ] **Step 8: READMEを書く**
  - Chromeの「パッケージ化されていない拡張機能を読み込む」手順。
  - GAS URL/sheet設定。
  - catalog pageでpopup→send。
  - selector変更時の診断方法。

- [ ] **Step 9: verification**

```bash
npm run test:catalog-extension
npm run verify:gas
npm run verify:webapp
git diff --check
```

## 受入条件

- user指定space selectorから正しいspaceを取得できる。
- catalog image URLとspaceをexplicit actionでGASへ送れる。
- extension sourceがrepositoryに完全に含まれる。
- endpoint/sheetは利用者設定でありrepositoryに秘密情報を含まない。