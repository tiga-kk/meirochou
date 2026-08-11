# Phase 7.2 Task 2: カタログページ用Chrome拡張をrepositoryへ追加

## 目標

カタログページからサークルspaceとcatalog image URLを抽出し、Task 1の`upsertCatalog` contractで指定GAS Web Appへ送るChrome拡張を`apps/catalog-extension/`へ追加する。拡張機能の自動テストを通常の`npm run verify`とGitHub Actionsへ接続し、ローカルだけで成立する機能にしない。

## やってはいけないこと

- GAS URL、sheet名、個人tokenをsourceへhardcodeしない。
- page全体の文字列からspaceを推測しない。
- ユーザーが明示操作していない全サークルを自動crawlしない。
- `innerHTML`から雑にURLを抜かない。DOM property (`currentSrc`/`src`)を優先する。
- catalog pageの既存form/actionを改変しない。
- extension失敗をpageのnavigationへ影響させない。
- Manifest V3の`content_scripts`へES moduleの`export`構文をそのまま読み込ませない。
- `<all_urls>`や不要な権限を追加しない。

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
- `package.json`
- `.github/workflows/webapp-ci.yml`
- `.gitignore`は、実際に生成されるlocal outputが新たに生じる場合だけ変更する。sourceを除外するためには変更しない。

## Manifest契約

Manifest V3を使う。DOMを読むcontent scriptはclassic scriptとして読み込み、network clientを使うbackground service workerだけES moduleにする。

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
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "options_page": "options.html",
  "action": { "default_popup": "popup.html" }
}
```

実際のGAS endpointが`script.googleusercontent.com`へredirectし、extensionの実機通信で追加host permissionが必要だと確認された場合だけ、そのhostを追加する。無関係なhostは許可しない。

## space抽出contract

primary selectorは次を使う。

```text
#mainSection > div.m-media.m-circletable > div.m-media__image > div.space-box > div
```

`content_scripts`はES moduleとして実行されないため、`lib/catalog-extractor.js`は`export`を使わず、限定したglobal namespaceへpure functionを公開する。

```js
(() => {
  const SPACE_SELECTOR =
    "#mainSection > div.m-media.m-circletable > div.m-media__image > div.space-box > div";

  function extractSpace(document) {
    // primary selector -> scoped fallback -> null
  }

  function extractCatalogImageUrl(document) {
    // scoped image -> currentSrc/src -> URL validation
  }

  globalThis.ComiPathCatalogExtractor = Object.freeze({
    SPACE_SELECTOR,
    extractSpace,
    extractCatalogImageUrl,
  });
})();
```

テストはこの実ファイルをNode `vm`等で評価し、ブラウザへ配るartifactと別のpure implementationを二重管理しない。

`normalizeSpace()`は全角/半角空白と改行を除去する程度に留め、別のspaceへ推測変換しない。

## catalog image URL抽出contract

サークルmedia containerを基準に画像を探す。

```js
const root = document.querySelector(
  "#mainSection .m-media.m-circletable .m-media__image",
);
const image = root?.querySelector("img");
const raw = image?.currentSrc || image?.src || "";
```

実ページで画像が別要素にある場合は、そのDOM事実に基づくselectorだけを追加する。CSS background等を憶測で広域探索しない。`javascript:`等の非HTTP(S) URLは拒否する。

## extension storage contract

`chrome.storage.sync`へ次だけ保存する。

```ts
interface CatalogExtensionSettings {
  gasUrl: string;
  sheetName: string;
}
```

保存前に:

- `gasUrl`はHTTPSで、Task 1のGAS Web Appとして利用可能なURLであることを確認する。
- `sheetName`はtrim後non-empty。

secret/tokenを保存する設計へ広げない。

## popup / content / backgroundの責務

責務を次で固定する。

1. popupがactive tabへ`COMIPATH_EXTRACT_CATALOG`を送る。
2. content scriptは現在DOMから`space`と`tweet`を抽出して返すだけで、network requestを行わない。
3. popupは抽出結果を利用者へ表示する。
4. 利用者が「このお品書きをGASへ送る」を押した時だけ、popupがbackgroundへ`COMIPATH_SEND_CATALOG`を送る。
5. backgroundはstorageから`gasUrl`/`sheetName`を読み、Task 1のPOSTへ変換して送信する。

content response例:

```js
{ ok: true, payload: { space, tweet } }
```

background request例:

```js
{
  type: "COMIPATH_SEND_CATALOG",
  payload: { space, tweet }
}
```

GAS body:

```js
{
  action: "upsertCatalog",
  sheetName,
  space,
  tweet,
}
```

background responseは成功/失敗と利用者向けmessageを返す。GASのresponse全体をそのままUIへ信用してinnerHTMLへ流さない。

## popup UX

popupは現在pageの抽出結果を表示する。

```text
スペース: 東ア01a
画像: https://...
[このお品書きをGASへ送る]
```

- content scriptが存在しないpageでは「対応するカタログページを開いてください」と表示する。
- 設定不足なら送信buttonをdisabledにし、「設定を開く」を表示する。
- 送信中は二重clickを防ぐ。
- 成功時は保存したspaceを表示する。
- 失敗時は設定不足、抽出失敗、通信失敗、GAS側errorを区別できる範囲で表示する。

## CI接続

`package.json`へ`test:catalog-extension`を追加するだけで終えない。Phase 7.2の通常検証へ必ず含める。

例:

```json
{
  "scripts": {
    "test:catalog-extension": "node --test tests/catalog-extension-extractor.test.mjs tests/catalog-extension-client.test.mjs",
    "verify": "npm run verify:webapp && npm run verify:gas && npm run test:catalog-extension"
  }
}
```

実際のtest runnerは既存依存だけで実装できる方を選ぶ。新しいtest frameworkを追加しない。

`.github/workflows/webapp-ci.yml`は現行の`npm run verify:webapp`を`npm run verify`へ変更し、既存の`npm run test:e2e`は維持する。これによりGASとextensionの回帰がPRで検出される。

## 手順

- [ ] **Step 1: real DOMを再確認しfixtureへ最小構造を保存する**
  - user指定space selectorが一致する構造をfixtureへ入れる。
  - catalog image elementは実ページで確認したselector/propertyだけをfixtureへ入れる。

- [ ] **Step 2: extractor RED testsを書く**
  - primary selector success。
  - scoped fallback success。
  - missing spaceは`null`。
  - `currentSrc`/`src`からHTTPS image URL。
  - `javascript:`等は拒否。
  - browser配布artifactに`export`構文がなく、classic scriptとして評価できる。

- [ ] **Step 3: extractorを実装する**

- [ ] **Step 4: client RED testsを書く**
  - exact `upsertCatalog` JSON。
  - non-2xx/error payload。
  - URL/sheet validation。

- [ ] **Step 5: module background/clientを実装する**

- [ ] **Step 6: popup/content/optionsを実装する**
  - settings save/read。
  - popup→content extraction。
  - popup→background explicit send。
  - unsupported page / missing settings / send failure。

- [ ] **Step 7: manifest permission auditを行う**
  - `<all_urls>`なし。
  - content script matchはcatalog siteに限定。
  - GAS hostは実通信に必要な範囲だけ。

- [ ] **Step 8: READMEを書く**
  - Chromeの「パッケージ化されていない拡張機能を読み込む」手順。
  - GAS URL/sheet設定。
  - catalog pageでpopup→send。
  - selector変更時の診断方法。

- [ ] **Step 9: package/CIへ検証を接続する**
  - `npm run verify`がextension testを含む。
  - GitHub Actionsが`npm run verify`を呼ぶ。

- [ ] **Step 10: verification**

```bash
npm run test:catalog-extension
npm run verify
git diff --check
```

## 受入条件

- user指定space selectorから正しいspaceを取得できる。
- catalog image URLとspaceを利用者の明示操作でGASへ送れる。
- classic content scriptとmodule backgroundの実行形式がManifest V3と矛盾しない。
- extension sourceがrepositoryに完全に含まれる。
- endpoint/sheetは利用者設定でありrepositoryに秘密情報を含まない。
- extension testが`npm run verify`とGitHub Actionsの双方から到達する。