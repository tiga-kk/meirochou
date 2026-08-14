# Phase 7.6 Task 2: event dateとX account contractを追加

## 目的

event/dayへ後方互換なcalendar dateを持たせ、既存`Circle.account`からX profileだけを安全に識別する。Pixiv等の非X accountを正常系として明示する。

## 対象外

- Yahoo request。
- IndexedDB。
- 投稿UI。
- sale mention monitor。
- CSV/GASへ新しいX列を追加すること。

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/x-post-monitoring/domain/x-account.ts`
- `apps/webapp/js/features/x-post-monitoring/domain/x-post-types.ts`
- `apps/webapp/js/features/x-post-monitoring/public-api.ts`
- `tests/x-account.test.ts`

### 変更

- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- `apps/webapp/events/manifest.json`
- `tests/boundary-parsers.test.ts`

### 削除

なし。

## Interfaces

`application-contract-types.ts`:

```ts
export interface EventDay {
  readonly dayId: string;
  readonly displayName: string;
  readonly date?: string;
}
```

`x-account.ts`:

```ts
export function extractXHandle(account: unknown): string | null;
```

`x-post-types.ts`:

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

export type SaleMentionState =
  | { readonly status: "unknown" }
  | { readonly status: "no-mention"; readonly checkedAt: string }
  | {
      readonly status: "mention";
      readonly matchedPostIds: readonly string[];
      readonly matchedKeywords: readonly string[];
      readonly checkedAt: string;
    };
```

Function側のTask 1 contractとbrowser側の`XPost` / `XPostPage` / `XPostApiErrorCode` / `XPostApiErrorBody`の名前・fieldを一致させる。共通package化はしない。browserは後続Taskでruntime parseする。

## X profile判定

許可host:

```text
x.com
www.x.com
twitter.com
www.twitter.com
mobile.twitter.com
```

profile pathはexactly 1 segment。query/hash/trailing slashは許容。

handleは`^[A-Za-z0-9_]{1,15}$`。

次は`null`:

- `https://www.pixiv.net/users/12345`
- `https://pixiv.com/...`
- `https://example.com/user`
- empty/null
- malformed URL
- `javascript:...`
- `https://x.com/home`
- `https://x.com/search`
- `https://x.com/explore`
- `https://x.com/notifications`
- `https://x.com/messages`
- `https://x.com/compose`
- `https://x.com/settings`
- `https://x.com/i/...`
- `https://x.com/intent/...`
- `https://x.com/share`
- `https://x.com/user/status/123`
- 16文字以上handle

`account`自体を書き換えない。

## event date validation

`date`はoptional。存在する場合:
- exact `YYYY-MM-DD`
- Gregorian calendar上で実在
- surrounding whitespace不可

`2026-02-30`、`2026-8-15`、` 2026-08-15 `はreject。

dateなしlegacy registryは従来通りparse可能。

C108:
- day1: `2026-08-15`
- day2: `2026-08-16`

## 実装手順

1. RED: X host/profile成功とPixiv/その他host/予約route/invalid handle拒否を`x-account.test.ts`へ書く。
2. RED: event dateのvalid/invalid/optionalを`boundary-parsers.test.ts`へ追加する。
3. `extractXHandle()`をURL APIで実装し、host/path/handleを限定する。
4. `EventDay.date?`を追加し、parserにstrict calendar date helperを追加する。
5. parserはdateなしで既存output shapeを壊さず、dateありだけfieldを含める。
6. C108 registryへ正しい2日の日付を追加する。
7. public APIから必要type/helperだけexportする。X featureがevent-day内部実装へ逆依存しない。
8. existing GAS/CSV circle parsing/export snapshotが変わっていないことをfocused regressionで確認する。
9. check/build/diff checkを通してcommitする。

## テスト方針

X account認識は「Xでないこと」も重要な正常系。Pixivをerrorにしない。

event date追加はregistry schemaVersionを上げない後方互換変更なので、dateなしfixtureが引き続き通ることを必ず証明する。

## 検証コマンド

```bash
npx vitest run --root . \
  tests/x-account.test.ts \
  tests/boundary-parsers.test.ts
npm run check:webapp
npm run build:webapp
git diff --check
```

CSV/GAS public contractに関連する既存focused testがboundary testから独立している場合はそれも実行する。

## 受入条件

- Pixiv/その他非X accountは`null`で、例外を投げない。
- X profileだけhandleを返す。
- X専用CSV/GAS fieldを追加しない。
- C108 day1/day2にcalendar dateがある。
- legacy dateなしregistryを壊さない。
- invalid calendar dateを受理しない。

## 予定コミットメッセージ

```text
feat(phase-07-6): add x account and event date contracts
```
