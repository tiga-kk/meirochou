# Phase 7.6 Task 1: X投稿proxy契約とYahoo raw parserを確立

## 目的

Yahoo!リアルタイム検索backendの不安定なraw contractをCloudflare Pages Function内へ隔離し、browserには安定した`XPostPage`だけを返す。production UIを作る前に、Cloudflareから実際に到達できることとraw response mappingを証明する。

## 対象外

- event registryの日付追加。
- IndexedDB。
- route UI。
- background monitor。
- sale mention判定。
- Yahoo challenge/CAPTCHA回避。

## 前提

Phase 7.6着手時にPhase 7.5 closureと最新remote HEADを確認する。計画作成時SHAを実装開始点として固定しない。

repoの通常E2EはViteであり、現時点ではWrangler依存を持たない。Functionの単体contractとCloudflare preview live smokeを別gateにする。

## 対象ファイル

### 新規作成

- `functions/_lib/x-post-contract.ts`
- `functions/_lib/yahoo-realtime.ts`
- `functions/api/x-posts.ts`
- `tests/x-post-api-contract.test.ts`
- `tests/yahoo-realtime-parser.test.ts`
- `tests/x-post-pages-function.test.ts`
- `tests/fixtures/yahoo-realtime-page.json`
- `docs/reviews/phase-07-6-yahoo-live-contract.md`

### 変更

- `package.json`

### 新規作成（型検査）

- `tsconfig.functions.json`

WranglerはPhase 7.6の依存へ追加しない。Cloudflare Git integrationのpreview deployでlive smokeを行う。既存deploy経路自体が利用不能だった場合はTaskをBLOCKEDとして環境問題を記録し、計画外dependencyを勝手に追加しない。

### 削除

なし。

## Interfaces

`functions/_lib/x-post-contract.ts`:

```ts
export interface XPost {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
}

export interface XPostPage {
  readonly schemaVersion: 1;
  readonly handle: string;
  readonly posts: readonly XPost[];
  readonly nextCursor: string | null;
  readonly fetchedAt: string;
}

export type XPostApiErrorCode =
  | "invalid_request"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "upstream_schema_changed";

export interface XPostApiErrorBody {
  readonly schemaVersion: 1;
  readonly error: {
    readonly code: XPostApiErrorCode;
    readonly message: string;
  };
}
```

`functions/_lib/yahoo-realtime.ts`:

```ts
export function buildYahooRealtimeRequest(input: {
  readonly handle: string;
  readonly cursor: string | null;
  readonly day: string | null;
}): Request;

export function parseYahooRealtimeResponse(
  input: unknown,
  options: {
    readonly handle: string;
    readonly day: string | null;
    readonly fetchedAt: string;
  },
): XPostPage;
```

`functions/api/x-posts.ts`:

```ts
export interface XPostFunctionEnv {
  readonly fetchYahoo?: typeof fetch;
  readonly now?: () => Date;
}

export async function handleXPostRequest(
  request: Request,
  env?: XPostFunctionEnv,
): Promise<Response>;

export async function onRequestGet(context: {
  readonly request: Request;
}): Promise<Response>;
```

`onRequestGet`は薄いadapterにし、behavior testは`handleXPostRequest`へ行う。Cloudflare専用global typeを使うためだけに`@cloudflare/workers-types`を追加しない。

## 入力validation

APIは次だけを受理する。

- `handle`: 必須、`^[A-Za-z0-9_]{1,15}$`
- `cursor`: optional、X post idとして`^[0-9]{1,32}$`
- `day`: optional、実在する`YYYY-MM-DD`

未知query parameterがあってもYahooへ転送しない。実装は既知parameterだけを読む。

`p`そのものや`since`/`until`/`results`/Yahoo URLをclient指定にしない。

## 実装手順

1. RED: valid handle、invalid handle、day、cursor、429、5xx、schema changeを含むFunction contract testを書く。
2. RED: fixtureを使い、raw responseから`id` / `text` / `createdAt` / next cursorだけを得てmedia/profile/engagementを捨てるparser testを書く。
3. RED: `day`指定時にJST範囲外postをresponseへ含めないtestを書く。
4. RED: responseに必須entry shapeがない場合に`upstream_schema_changed`となり、`posts: []`成功に化けないtestを書く。
5. `buildYahooRealtimeRequest()`を実装し、通常feedは`results=20`、day scanは`results=40`、`p=ID:<handle>`、paginationだけ`oldestTweetId`を付ける。headersは検証元記事の最小形として`Accept: application/json, text/plain, */*`、`Referer: https://search.yahoo.co.jp/realtime/search`、固定User-AgentをFunction内だけで設定し、browserからheader値を受け取らない。
6. `day`をAsia/Tokyoの`00:00`から翌日`00:00`へ変換し、Yahoo `since` / `until`へ渡す。端末timezone/API runtime timezoneに依存しないpure helperとしてtestする。
7. `parseYahooRealtimeResponse()`を実装し、本文をstringとして正規化する。HTMLとして解釈しない。
8. Function handlerを実装する。HTTP statusは`invalid_request`=400、`upstream_rate_limited`=429、`upstream_unavailable`=502、`upstream_schema_changed`=502へ固定し、bodyは常に`XPostApiErrorBody`とする。upstream 429に`Retry-After`があればresponse headerへ保持する。
9. 実Yahoo responseを1回取得し、fixture/parser前提と一致するか確認する。個人情報的に不要な長文/media/profile値はfixtureへ保存しない。
10. Cloudflare Pages previewでFunctionがdeployされ、`/api/x-posts?handle=<公開検証用handle>`がsame-originから到達することを確認する。
11. live responseが契約と異なる場合はfixture/parserを**観測事実に合わせて**修正して再testする。記事のschemaを優先しない。
12. Cloudflareからchallenge/CAPTCHA等で拒否され、通常HTTP requestとして成立しない場合はTaskをBLOCKEDにして`phase-07-6-yahoo-live-contract.md`へ証拠を残す。回避実装へ進まない。
13. `tsconfig.functions.json`を次の方針で追加する: `target ES2022`、`module ESNext`、`moduleResolution Bundler`、`strict`、`noEmit`、`isolatedModules`、`lib ES2022/DOM/DOM.Iterable`、`include functions/**/*.ts`。`vite/client`やCloudflare型packageは要求しない。
14. `package.json`へ`typecheck:functions = tsc -p tsconfig.functions.json --noEmit`を追加し、`verify:webapp`から必ず呼ぶ。新dependencyは追加しない。
15. focused test、functions typecheck、既存webapp check、diff checkを通してcommitする。

## テスト方針

重要なのは「Function fileがある」ことではなく、外部raw contract変更をbrowser contractから隔離できること。

偽陽性防止:
- fixtureだけ通ってlive smoke失敗ならTask完了にしない。
- live smokeだけ通ってparser edge testがなければ完了にしない。
- 0件とschema changeを同じ扱いにしない。
- Yahooへの実通信を通常Vitest/CIの必須fixture testにしない。

## 検証コマンド

最低限:

```bash
npx vitest run --root . \
  tests/x-post-api-contract.test.ts \
  tests/yahoo-realtime-parser.test.ts \
  tests/x-post-pages-function.test.ts
npm run typecheck:functions
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- Cloudflare previewからYahooへ通常HTTP requestで到達できる、または回避不能な外部blockを証拠付きBLOCKEDとして記録している。
- browserへ返す成功shapeは`XPostPage`だけ。
- raw media/profile/engagementを返さない。
- handle/cursor/day以外を汎用検索入力として転送しない。
- `day`はJSTでfilterされる。
- malformed upstreamを空投稿扱いしない。
- rate limit/outageを正常0件にしない。
- error body/status mappingが`XPostApiErrorBody`契約どおりで、429の`Retry-After`を失わない。
- challenge/CAPTCHA回避を実装しない。

## 予定コミットメッセージ

```text
feat(phase-07-6): establish x post proxy contract
```
