# Phase 7.2 Task 1: GASコードcopy UIとcatalog upsert API

## 目標

既存`integrations/gas-spreadsheet/Code.gs`を唯一のcopy用artifactとして維持しつつ、管理画面から利用者がそのコードをコピーできるようにする。同時にChrome拡張が安全にcatalog image URLを登録できる`upsertCatalog` POST contractを追加する。

## やってはいけないこと

- GASコードをwebapp側へ手作業で複製しない。
- Spreadsheet IDや利用者のGAS URLをrepositoryへhardcodeしない。
- `{space,tweet}`だけを見てsale POSTと推測で振り分けない。
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
- `apps/webapp/css/forms.css`
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

成功response:

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

```js
function doPostCatalog(e)
```

- `action !== "upsertCatalog"`なら`null`を返し、routerへ「自分のrequestではない」と通知する。
- JSON parse失敗、sheetName/space/tweet不正、sheet不存在、header不正は既存`jsonErrorResponse`系helperで明示errorを返す。
- `tweet`は`http:`/`https:` URLだけ受理する。
- header rowから`space`と`tweet`列indexを取得する。列位置をA/B固定にしない。
- 同一spaceが1行ならtweet cellだけ更新する。
- 同一spaceが0行なら最終data rowの次へ追加し、space/tweet列だけ設定する。
- 同一spaceが複数行なら安全側にerrorとし、任意の一行を更新しない。

`doPost(e)`のroute順は次で固定する。

```js
function doPost(e) {
  var catalogResponse = doPostCatalog(e);
  if (catalogResponse !== null && catalogResponse !== undefined) return catalogResponse;
  var saleResponse = doPostSale(e);
  if (saleResponse !== null && saleResponse !== undefined) return saleResponse;
  return doPostLegacy(e);
}
```

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

`npm run build:gas`後の`Code.gs`が正本であり、`npm run verify:gas`でsource fragmentsとの一致を強制する。

## webappからcopyする仕組み

Vite dev/buildでrepositoryの`integrations/gas-spreadsheet/Code.gs`を次のread-only pathへ公開する。

```text
/assets/integrations/gas-spreadsheet/Code.gs.txt
```

`vite.config.ts`では既存pluginへ以下を追加する。

- dev server middleware: 上記pathへ`text/plain; charset=utf-8`で`Code.gs`を返す。
- `closeBundle()`: `dist/webapp/assets/integrations/gas-spreadsheet/Code.gs.txt`へcopyする。

webapp source内にコード文字列を複製しない。

`<gas-setup-panel>`は次の責務だけを持つ。

```ts
export class GasSetupPanel extends LitElement {
  copyGasCode(): Promise<void>;
}
```

`copyGasCode()`:

1. `/assets/integrations/gas-spreadsheet/Code.gs.txt`をfetch。
2. non-2xxならerror feedback。
3. textを`navigator.clipboard.writeText()`へ渡す。
4. 成功時「GASコードをコピーしました」を`role=status`で表示。
5. Clipboard API不可/拒否時はcode textarea/dialogへ表示して手動copy可能にする。

## 手順

- [ ] **Step 1: GAS contract RED testを追加する**
  - existing spaceのtweetだけ更新。
  - missing spaceを新規rowへ追加。
  - `action:"sale"`がcatalog handlerへ入らない。
  - duplicate spaceはerror。
  - invalid URLはerror。

- [ ] **Step 2: `npm run test:gas`でREDを確認する**

- [ ] **Step 3: `catalog-api.js`とrouter orderを実装する**

- [ ] **Step 4: generator orderを変更し`npm run build:gas`する**

- [ ] **Step 5: `npm run verify:gas`をGREENにする**

- [ ] **Step 6: Vite dev/build artifact contractのRED testを書く**
  - build outputに`Code.gs.txt`が存在する。
  - 内容がrepository `Code.gs`とbyte-equivalentである。

- [ ] **Step 7: Vite公開処理を実装する**

- [ ] **Step 8: `<gas-setup-panel>`のRED unit testを書く**
  - fetch→clipboard success。
  - fetch failure。
  - clipboard rejection時manual fallback。

- [ ] **Step 9: management detailへpanelを追加する**
  - event/dayのsource editorより上に「GASセットアップ」を置く。
  - 個別event/day状態へ依存させない。

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
- webappで表示するcodeとrepository artifactにdriftがない。
- `upsertCatalog`はsale mutationと衝突しない。
- catalog updateはtweet列以外の既存dataを壊さない。