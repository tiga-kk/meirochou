# Phase 7.6 Task 5: event-day全投稿scanとsale mention monitorを追加

## 目的

利用者が投稿panelをscrollしなくても、active event-dayの対象X accountについて当日の全投稿を走査し、完売関連keyword mentionを検出する。scan completenessと警告意味を厳密に分ける。

## 対象外

- current target banner。
- map warning。
- route/ALNS候補変更。
- 自動hold/purchase。
- 高度な日本語否定解析。
- 全投稿の恒久archive。

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/x-post-monitoring/domain/sale-mention-detector.ts`
- `apps/webapp/js/features/x-post-monitoring/use-cases/event-day-x-post-monitor.ts`
- `tests/sale-mention-detector.test.ts`
- `tests/event-day-x-post-monitor.test.ts`

### 変更

- `apps/webapp/js/features/x-post-monitoring/public-api.ts`

### 削除

なし。

## Interfaces

```ts
export const SALE_MENTION_KEYWORDS = [
  "完売",
  "売り切れ",
  "売切れ",
  "頒布終了",
] as const;

export function detectSaleMentions(
  posts: readonly XPost[],
): {
  readonly matchedPosts: readonly XPost[];
  readonly matchedKeywords: readonly string[];
};
```

```ts
export interface EventDayXPostMonitor {
  start(input: {
    readonly ref: EventDayRef;
    readonly eventDate: string | null;
  }): void;

  stop(): void;

  prioritizeCircle(circle: Circle | null): void;

  refreshCircleAccounts(): void;

  getSaleMention(space: string): SaleMentionState;

  getMentionSpaces(): ReadonlySet<string>;

  subscribe(listener: () => void): () => void;
}
```

constructor dependenciesは具体的portだけ。

```ts
new DefaultEventDayXPostMonitor({
  client,
  cache,
  activeEventDayReader,
  document,
  onlineTarget: window,
  now: () => new Date(),
  setTimer,
  clearTimer,
});
```

generic scheduler/polling frameworkは作らない。

## mention判定

`post.text.normalize("NFKC")`後のsubstring matchingのみ。

- `完売しました` -> mention
- `売り切れ` -> mention
- `まだ完売していません` -> mention
- `完売次第撤収` -> mention
- keywordなし -> no match

`SaleMentionState`:
- complete scan + no match -> `no-mention`
- matchを1件でも取得 -> `mention`。scan途中でもwarning可能。
- partial/error/dateなし/future -> matchがない限り`unknown`

matchが既に見つかっている後にrefresh errorが起きても、既存matched evidenceは捨てず`mention`を維持する。

## 対象account

active circlesをspace -> handleへ変換。

対象status:
- `pending`
- `held`

通常の新規scan対象外:
- `purchased`
- `excluded`
- non-X account

同一handleが複数spaceに紐づく場合、1つのhandle jobにまとめ、同じstateを各spaceへ反映。

source refresh後は`refreshCircleAccounts()`でmapping/queueを再構築する。削除されたcircleやhandle変更前のstale resultを新mappingへ誤適用しない。

## queue / concurrency

最大2 handleを同時処理。request開始はglobalで最低1秒空ける。これは通常時のburst抑制であり、429/5xx backoffとは別。

優先:
1. current target handle
2. その他pending
3. held

`prioritizeCircle()`は既存in-flightを強制abortしてrequest stormを起こさず、未開始queueの順序を上げる。current targetのlast refreshが60秒以上古い場合は優先refresh対象。

## day scan algorithm

dateなし:
- network day scanなし
- state `unknown`

future date:
- 開催日になるまでscanなし
- state `unknown`

past/current dateの未完了scan:
1. cacheの`dayScan.resumeCursor`があればそこから、なければ`cursor:null`から`client.fetchPage({handle, day:eventDate, cursor})`
2. 各pageでkeyword detect
3. matchedPostsを即cacheへmerge
4. recent表示対象に入る新しいpostだけrecent cacheへmerge
5. `nextCursor`を追い、各request後に次cursorを`dayScan.resumeCursor`へ保存する
6. `nextCursor === null`なら`complete`として`resumeCursor=null`
7. errorなら`error`とし、最後に進めた`resumeCursor`を保持
8. safety slice境界なら`partial`とし、次cursorを保持して1分以上後にcontinuationをqueueする

`posts.length === 0`だけではcompleteにしない。Function filter後の空pageでもcursorが続く可能性がある。

同じcursorが再出現した時点では進捗不能なので`error` + `upstream_schema_changed`相当として自動continuationを止める。同cursorを1分ごとに永久retryする実装にしない。

1 scan sliceの安全境界:
- 50 pages、または
- 2000 normalized posts

これは取得総数上限ではない。正常cursorが進む限りsliceを分けて継続し、最終的に`nextCursor === null`まで到達する。

background scanの非match古いpost全件をIndexedDBへ保存しない。

## refresh

past dayで`complete`後は定期poll不要。

current dayで`complete`後も原則10分ごとに新着を確認。

増分:
1. first pageから取得
2. cached `dayScan.newestPostId`に到達したら停止
3. 到達前の新postを検査/merge
4. new cursor loop/errorなら既存complete結果を破壊せずrefresh errorを記録可能にする

current targetは`dayScan.lastRefreshAt`がnull、またはそこから60秒以上経過していれば優先refreshする。

## lifecycle / backoff

`document.visibilityState !== "visible"`中は新規background requestを開始しない。

offline中も新規requestなし。`online` / `visibilitychange`でqueueを再開する。

rate limit/5xxはglobal backoff:
- 1分
- 5分
- 15分

Task 3の`XPostRequestError.retryAfterMs`がある場合は、それより短く再試行しない。HTTPライブラリ抽象化は作らない。

cacheから`dayScan.state === "scanning"`を復元した場合、前processが生存しているとはみなさず、保存済み`resumeCursor`から未完了scanを再開する。`partial` + 正常に進む`resumeCursor`もcontinuation対象とする。

stop:
- timer全解除
- listener解除
- in-flight abort
- generation increment
- stop後completion callbackをnotifyしない

## 実装手順

1. RED: NFKC + 4keyword + 否定文もmentionとなるpure detector testを書く。
2. RED: complete/no matchだけ`no-mention`、partial/error/dateなしは`unknown`のtestを書く。
3. RED: same handle複数spaceでも1系統request、両spaceにmention反映のtestを書く。
4. RED: concurrencyが2を超えないtestを書く。
5. RED: current targetがqueue優先されるtestを書く。
6. RED: cursorを日付終了まで追い、200件で勝手にcompleteにしないtestを書く。
7. RED: repeated cursorは`error`として自動continuation停止、50 pages/2000 postsは`partial` + resumeCursor保存後に次sliceへ継続し、最終`nextCursor=null`でのみcompleteになるtestを書く。
8. RED: old nonmatch postsをpersistent recent cacheへ無制限保存しないtestを書く。
9. RED: hidden/offline/online/stop/stale generationをfake timer/fake clientで検証する。
10. RED: request開始間隔が1秒未満のburstにならないtestを書く。
11. RED: persisted `scanning`/continuable `partial`を保存済みresumeCursorから再開するtestを書く。
12. RED: current day complete後の10分refreshと、past day complete後にpollしないtestを書く。
13. detectorとmonitorを最小実装する。
14. background failureをconsole/error stateへ閉じ、route/business mutationを呼ぶ依存自体をmonitorへ渡さない。
15. focused tests/check/buildを通す。

## テスト方針

sleepを伴う実時間testにしない。clock/timer/clientを注入し、決定的にqueue/backoffを証明する。

「200件まで見た」だけで全日scan完了と主張するtestは禁止。completeは終了条件を観測した場合だけ。

## 検証コマンド

```bash
npx vitest run --root . \
  tests/sale-mention-detector.test.ts \
  tests/event-day-x-post-monitor.test.ts
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- UI scrollと独立してday scanする。
- day scanは正常終了条件までcursorを追う。
- safety slice境界到達だけを`partial`としてcursor保存し、後続sliceで全日scanを継続する。cursor loopは`error`で止める。
- `posts=[]`だけではcompleteにせず、`nextCursor=null`でのみcompleteにする。
- complete + no matchだけ`no-mention`。
- matchはscan途中でもwarning可能。
- nonmatching全投稿を無制限保存しない。
- duplicate handleを重複fetchしない。
- concurrency<=2かつrequest開始間隔>=1秒。
- hidden/offline中にrequest stormがない。
- stop/event switch後のstale completionが状態を更新しない。
- monitorからroute/ALNS/purchase mutationを呼べない構造である。

## 予定コミットメッセージ

```text
feat(phase-07-6): monitor event day sale mentions
```
