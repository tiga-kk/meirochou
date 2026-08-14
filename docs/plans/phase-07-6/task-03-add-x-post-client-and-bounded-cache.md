# Phase 7.6 Task 3: XPost clientとbounded IndexedDB cacheを追加

## 目的

browser側にsame-origin XPost clientとruntime parserを追加し、event/day/handle単位のbounded IndexedDB cacheへrecent postsとsale mention根拠を保存する。正式LocalStorage stateへ外部投稿を混ぜない。

## 対象外

- DOM表示。
- background polling。
- sale keyword detector。
- route/map warning。

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/x-post-monitoring/infrastructure/http-x-post-client.ts`
- `apps/webapp/js/features/x-post-monitoring/infrastructure/browser-indexed-db-x-post-cache.ts`
- `apps/webapp/js/features/x-post-monitoring/domain/x-post-cache-model.ts`
- `apps/webapp/js/features/x-post-monitoring/use-cases/load-x-post-page.ts`
- `tests/http-x-post-client.test.ts`
- `tests/x-post-cache-model.test.ts`
- `tests/x-post-cache-indexeddb-contract.test.ts`

### 変更

- `apps/webapp/js/features/x-post-monitoring/public-api.ts`

### 削除

なし。

## Interfaces

```ts
export class XPostRequestError extends Error {
  readonly code: XPostApiErrorCode;
  readonly retryAfterMs: number | null;
}

export interface XPostClient {
  fetchPage(input: {
    readonly handle: string;
    readonly cursor?: string | null;
    readonly day?: string | null;
    readonly signal?: AbortSignal;
  }): Promise<XPostPage>;
}
```

```ts
export interface XPostCacheEntry {
  readonly key: string;
  readonly eventId: string;
  readonly dayId: string;
  readonly handle: string;
  readonly eventDate: string | null;
  readonly recentPosts: readonly XPost[];
  readonly matchedPosts: readonly XPost[];
  readonly recentNextCursor: string | null;
  readonly lastRecentFetchAt: string | null;
  readonly dayScan: {
    readonly state:
      | "not-started"
      | "scanning"
      | "complete"
      | "partial"
      | "error";
    readonly scannedAt: string | null;
    readonly lastRefreshAt: string | null;
    readonly newestPostId: string | null;
    readonly resumeCursor: string | null;
    readonly errorCode: XPostApiErrorCode | null;
  };
}
```

```ts
export interface XPostCache {
  get(ref: EventDayRef, handle: string): Promise<XPostCacheEntry | null>;
  put(entry: XPostCacheEntry): Promise<void>;
  deleteEventDay(ref: EventDayRef): Promise<void>;
  clear(): Promise<void>;
  dispose(): void;
}
```

pure helpers:

```ts
export function parseXPostPage(input: unknown): XPostPage;

export function mergeRecentPosts(
  current: readonly XPost[],
  incoming: readonly XPost[],
  limit?: number,
): readonly XPost[];

export function mergeMatchedPosts(
  current: readonly XPost[],
  incoming: readonly XPost[],
  limit?: number,
): readonly XPost[];
```

`mergeRecentPosts` default limitは200、`mergeMatchedPosts` default limitは50。

## runtime parser

`HttpXPostClient`は`response.json()`結果をtype castだけで信用しない。

検証:
- `schemaVersion === 1`
- handle一致
- post id非空
- text string
- createdAt parse可能なISO timestamp
- duplicate idはparserまたはmergeで決定的にdedupe
- nextCursorは`null`または`^[0-9]{1,32}$`
- fetchedAt valid ISO

malformed成功responseは専用errorとしてrejectし、`posts=[]`へ変換しない。非2xx responseはTask 2の`XPostApiErrorBody`をruntime validateし、`XPostRequestError`へ`code`と`Retry-After`由来`retryAfterMs`を保持する。header/bodyが不正なら`upstream_unavailable`へ縮退し、HTTP response本文をそのままUIへ出さない。

## IndexedDB

DB: `comipath-x-posts-v1`

store: `accountDays`

keyPath: `key`

key生成:

```ts
export function buildXPostCacheKey(ref: EventDayRef, handle: string): string {
  return `${ref.eventId}:${ref.dayId}:${handle.toLowerCase()}`;
}
```

handle lookupはcase-insensitiveに同一account扱いとするが、表示/API contractのcanonical handleは最初のvalidated handleを保持してよい。

IndexedDB unavailable/open failureはX featureのcache missとして縮退可能なerrorにし、route app起動を失敗させない。

## 実装手順

1. RED: malformed normalized responseをrejectするclient testを書く。
2. RED: queryのhandle/cursor/dayだけを正しくURLへ載せ、AbortSignalをfetchへ渡すtestを書く。error bodyのruntime validation、429の`Retry-After`秒指定とHTTP-date指定を`retryAfterMs`へ正規化するtestも含める。
3. RED: recent mergeがid dedupe・新しい順・最大200件を維持するpure testを書く。
4. RED: matched mergeはrecentの200件上限と独立し、id dedupe・新しい順・最大50件を維持するtestを書く。
5. RED: event/day/handle key分離、deleteEventDay、clear contractを書く。IndexedDB wrapper自体はfake IDB libraryを新規導入せず、薄いadapter contract + 最終Playwrightで補完する。
6. `parseXPostPage()`と`HttpXPostClient`を実装する。
7. cache pure model helpersを実装する。
8. `BrowserIndexedDbXPostCache`を1 object storeだけで実装する。upgradeはversion 1だけ。`dispose()`で保持中のDB connectionをcloseし、未openならno-op。
9. `LoadXPostPageUseCase`を実装し、cache-first readとnetwork page mergeを分ける。network失敗時に既存entryを消さない。
10. IndexedDB open/write失敗を外部投稿featureのerrorとして上位へ返し、LocalStorage event-day stateへfallback保存しない。
11. focused tests、check/build、diff checkを通す。

## 過剰実装禁止

- generic IndexedDB ORMを作らない。
- repository全体共通cache frameworkを作らない。
- Service Worker Cache StorageへJSON投稿を押し込まない。
- server-side KV/D1/R2を追加しない。
- recentPosts上限を理由なく設定画面化しない。
- `public-api.ts`から`HttpXPostClient` / `BrowserIndexedDbXPostCache`等のconcrete infrastructureをexportしない。contracts/pure helpersだけを公開し、concreteはcomposition rootだけがdeep importする。

## 検証コマンド

```bash
npx vitest run --root . \
  tests/http-x-post-client.test.ts \
  tests/x-post-cache-model.test.ts \
  tests/x-post-cache-indexeddb-contract.test.ts
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- browserはFunction responseをruntime validateする。
- cache keyがevent/day/handleで分離される。
- recentPostsは最大200件で、次ページ再開用`recentNextCursor`を保持する。
- matchedPostsはrecent truncationと独立し、最大50件でbounded。
- failureで既存cacheを削除しない。
- 429等のclient errorが`code`と`retryAfterMs`を保持する。
- cache `dispose()`がconnectionをcloseし、複数回呼んでも安全。
- IndexedDB故障がnavigation起動を壊さない。
- X投稿をLocalStorage正式stateへ保存しない。

## 予定コミットメッセージ

```text
feat(phase-07-6): add bounded x post cache
```
