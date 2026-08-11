# Phase 7.2 Task 1: GASコードコピーUIとcatalog upsert API

## 目標

既存`integrations/gas-spreadsheet/Code.gs`を唯一のコピー用artifactとして維持しつつ、管理画面から利用者がそのコードをコピーできるようにする。同時にChrome拡張がcatalog image URLを登録できる`upsertCatalog` POST contractを、既存sale POSTを壊さず追加する。

## 現行実装で確認済みの前提

- `integrations/gas-spreadsheet/src/post-router.js`の`doPost(e)`がJSONを一度だけ解析し、`data.action === "sale"`なら`doPostSale(data)`へ渡している。
- `doPostSale()`はeventではなく、解析済みrequest objectを受け取る。
- `doPostLegacy()`は存在しない。未知のactionは`UNKNOWN_ACTION`を返す。
- `parseSheetHeaders()`は既に`space`、`tweet`を含むheader位置とduplicate headerを検証できる。
- `successResponse()`、`errorResponse()`、`jsonResponse()`が既存の応答helperである。

この構造を壊して、handlerごとにJSONを再解析するrouterへ戻してはいけない。

## やってはいけないこと

- GASコードをwebapp側へ手作業で複製しない。
- Spreadsheet IDや利用者のGAS URLをrepositoryへhardcodeしない。
- `{space,tweet}`だけを見てsale POSTと推測で振り分けない。
- `doPostCatalog(e)`のようにraw eventを再解析する二重入口を作らない。
- 存在しない`doPostLegacy()`を追加しない。
- catalog upsertでpriority/isSale/account/memoを上書きしない。
- catalog POST失敗をwebappの既存purchase stateへ結びつけない。

## 対象ファイル

**作成:**
- `integrations/gas-spreadsheet/src/catalog-api.js`
- `apps/webapp/js/components/gas-setup-panel.ts`
- `tests/gas-setup-panel.test.ts`

**変更:**
- `integrations/gas-spreadsheet/src/post-router.js`
- `scripts/build-public-gas.mjs`
- `integrations/gas-spreadsheet/Code.gs`（generatorから再生成）
- `integrations/gas-spreadsheet/README.md`
- `tests/gas-contract.test.mjs`
- `tests/gas-build.test.mjs`
- `vite.config.ts`
- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/css/forms.css`または既存management用CSSのうち実際に当該surfaceを所有するファイル
- `tests/webapp-build.test.ts`または既存build contract test

## 固定POST contract

```json
{
  "action": "upsertCatalog",
  "sheetName": "day1",
  "space": "東ア01a",
  "tweet": "https://example.invalid/catalog.jpg"
}
```

成功時は既存`successResponse()`を使い、少なくとも保存対象と作成/更新の区別を返す。既存共通応答の`ok: true`、`status: "success"`を別実装で重複生成しない。

例:

```json
{
  "ok": true,
  "status": "success",
  "stored": {
    "sheetName": "day1",
    "space": "東ア01a",
    "tweet": "https://example.invalid/catalog.jpg"
  },
  "row": 2,
  "created": false
}
```

## GAS関数契約

新規handlerは解析済みrequest objectを受け取る。

```js
function doPostCatalog(requestData)
```

責務:

- `sheetName`、`space`、`tweet`を検証する。
- `tweet`は`http:`または`https:` URLだけを受理する。
- `SpreadsheetApp.getActiveSpreadsheet()`から対象sheetを取得する。
- 既存`parseSheetHeaders()`を再利用し、`space`列と`tweet`列をheader名で取得する。`tweet` headerが無い場合は`INVALID_SHEET_DATA`相当で失敗させる。
- 非空行の`space`を調べ、duplicate spaceがあれば任意の一行を更新せず失敗させる。
- 同一spaceが1行なら、その行のtweet cellだけを更新する。
- 同一spaceが0行なら`sheet.getLastRow() + 1`相当の新規行へspace cellとtweet cellだけを設定する。列順や途中の任意列を前提に`appendRow([space,tweet])`しない。
- 成功時は`successResponse()`を`jsonResponse()`で返す。

### `doPost(e)`の唯一のrouting contract

JSON解析とrequest object検証は現行`doPost(e)`に一度だけ残す。その後の分岐だけを拡張する。

```js
function doPost(e) {
  // 現行どおり e.postData.contents を一度だけJSON.parseし、dataを検証する。

  if (data.action === "upsertCatalog") {
    return doPostCatalog(data);
  }

  if (data.action === "sale") {
    return doPostSale(data);
  }

  return jsonResponse(errorResponse("Unknown action.", "UNKNOWN_ACTION"));
}
```

`upsertCatalog`追加前後で`sale`、invalid JSON、invalid request body、unknown actionの応答contractが変わらないことをテストする。

## GAS artifact build

`scripts/build-public-gas.mjs`のorderへ`catalog-api.js`を`web-api.js`の後、`post-router.js`の前に追加する。

```js
const order = [
  "config.js",
  "response.js",
  "web-api.js",
  "catalog-api.js",
  "post-router.js",
];
```

`npm run build:gas`後の`Code.gs`がコピー用artifactであり、`npm run verify:gas`でsource fragmentsとの一致を強制する。

## webappからコピーする仕組み

Viteは`publicDir: false`なので、既存pluginからrepositoryの`integrations/gas-spreadsheet/Code.gs`をread-onlyで公開する。

公開path:

```text
/assets/integrations/gas-spreadsheet/Code.gs.txt
```

`vite.config.ts`の既存pluginへ次だけを追加する。

- dev server middleware: 上記pathへ`text/plain; charset=utf-8`で`Code.gs`を返す。
- `closeBundle()`: `dist/webapp/assets/integrations/gas-spreadsheet/Code.gs.txt`へ同一bytesをcopyする。

webapp source内にGASコード文字列を複製しない。

`<gas-setup-panel>`はコード取得、clipboard、手動fallbackのUI責務だけを持つ。個別event/dayのmodelやGAS URLを持たせない。

```ts
export class GasSetupPanel extends LitElement {
  copyGasCode(): Promise<void>;
}
```

`copyGasCode()`:

1. `/assets/integrations/gas-spreadsheet/Code.gs.txt`をfetchする。
2. non-2xxならコピー成功扱いにせず、利用者へ取得失敗を表示する。
3. textを`navigator.clipboard.writeText()`へ渡す。
4. 成功時「GASコードをコピーしました」を`role="status"`で表示する。
5. Clipboard API unavailable/拒否時は同じ取得済みtextを選択可能なtextarea等へ表示し、手動コピーできる状態にする。

### 管理画面への接続

`ComipathSettings`は現在、日程詳細のactive controlsを個別event/dayに紐づけている。GASセットアップはevent/day非依存なので、`source-manager`の直上へ条件付きで埋め込むのではなく、管理surfaceを開いた時に常に到達できる場所へ一度だけ配置する。具体的には`ComipathSettings.render()`の管理ヘッダー直後、または同等のglobal sectionとする。

これにより、未設定dayを選んでいてもコードコピーが利用できることをcomponent testで確認する。

## 手順

- [ ] **Step 1: GAS router/upsertのRED testを追加する**
  - existing spaceのtweetだけ更新。
  - missing spaceを新規rowへ追加。
  - arbitrary header orderで正しい列だけ更新。
  - duplicate spaceはerror。
  - `tweet` header missingはerror。
  - invalid URLはerror。
  - `action:"sale"`は従来どおり`doPostSale(data)`へ到達。
  - invalid JSON / unknown actionの既存応答を維持。

- [ ] **Step 2: `npm run test:gas`で要求に対応するREDを確認する**

- [ ] **Step 3: `catalog-api.js`を実装し、現行`doPost(e)`の分岐だけを追加する**

- [ ] **Step 4: generator orderを変更し`npm run build:gas`する**

- [ ] **Step 5: `npm run verify:gas`をGREENにする**

- [ ] **Step 6: Vite dev/build artifact contractのRED testを書く**
  - build outputに`Code.gs.txt`が存在する。
  - 内容がrepository `Code.gs`とbyte-equivalentである。

- [ ] **Step 7: 既存Vite pluginへ公開処理を追加する**

- [ ] **Step 8: `<gas-setup-panel>`のRED unit testを書く**
  - fetch→clipboard success。
  - fetch failure。
  - clipboard rejection時manual fallback。
  - event/day設定の有無に依存せず表示される。

- [ ] **Step 9: `ComipathSettings`のglobal sectionへpanelを接続する**

- [ ] **Step 10: focused verification**

```bash
npm run verify:gas
npx vitest run --root . tests/gas-setup-panel.test.ts
npm run build:webapp
npm run verify:webapp:build
npm run check:webapp
git diff --check
```

## 受入条件

- 管理画面からcurrent generated `Code.gs`をcopyできる。
- webappで取得するcodeとrepository artifactにdriftがない。
- `doPost(e)`は一度だけJSONを解析し、`upsertCatalog`と既存`sale`を明示actionで振り分ける。
- catalog updateはtweet列以外の既存dataを壊さない。
- `sale`、invalid JSON、unknown actionの既存contractを壊さない。