# Phase 7.6 Task 7: lifecycle・削除・offline・E2E・実環境を閉じる

## 目的

X投稿featureをcomposition rootへ完全接続し、app start/stop、event/day switch、source refresh、local data deletion、offline、外部API failureを含むproduction lifecycleを証明してPhaseを閉じる。

## 対象外

- 新しいX機能追加。
- Yahoo以外のprovider fallback。
- official X API移行。
- route semantics変更。
- snapshotを自動承認すること。

## 対象ファイル

### 新規作成

- `apps/webapp/js/app/delete-local-data-with-x-post-cleanup.ts`
- `tests/x-post-cleanup.test.ts`
- `tests/x-post-runtime-lifecycle.test.ts`

### 変更

- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/features/x-post-monitoring/public-api.ts`
- `tests/application-assembly.test.ts`
- `tests/apps-behavior-characterization.test.ts`
- `tests/e2e/webapp.spec.ts`
- `tests/architecture-boundaries.test.mjs`

### 削除

なし。

## composition

`assemble-comipath-application.ts`で具体実装を構築する。

```text
Task 4までに接続済み:
HttpXPostClient
BrowserIndexedDbXPostCache
DomXPostPanel

Task 6までに接続済み:
DefaultEventDayXPostMonitor

Task 7で追加して閉じる:
DeleteLocalDataWithXPostCleanup
```

新DI container/global singletonを追加しない。

test injectionが必要な場合は`AssembleComiPathApplicationOptions`へ具体的なport overrideをoptional追加する。production defaultは上記実装。

## lifecycle contract

### start

1. active event/day restore
2. current event registry dayから`date`を解決
3. X cacheからmention stateをderive
4. panel target/current targetを更新
5. monitor start
6. current targetを優先

X cache/monitor start failureでBrowserApplication全体の`start()`をrejectしない。feature unavailableとして表示を縮退する。

### event/day switch

switch開始時:
- current monitor stop/invalidate
- panel request abort
- old warning setをclear

switch成功後:
- new ref/dateを解決
- new cache state読込
- new monitor start
- current navigation stateに合わせてwarning更新

switch失敗時は既存event/day runtime semanticsに従い、X featureが独自にevent/day truthを持たない。

### source refresh / replace

circle source operation完了後:
- panel current circle accountを再評価
- monitor `refreshCircleAccounts()`
- handle変更前のstale requestを新circleへ適用しない

### status change

purchase/holdによる既存circle status mutation後:
- monitor対象queueを再評価
- X featureがcircle statusを逆方向へ書き換えない

### stop

- monitor stop
- panel dispose
- subscriptions解除
- timer/listener解除
- request abort
- `XPostCache.dispose()`でIndexedDB connection close
- stop後のasync completionでDOMを更新しない

## local data cleanup

既存`DeleteLocalDataWithCatalogCleanup`と同様の小さなdecoratorを使う。

```ts
export class DeleteLocalDataWithXPostCleanup
  implements DeleteLocalDataOperation {
  constructor(
    private readonly inner: DeleteLocalDataOperation,
    private readonly xPostCache: XPostCache,
  ) {}

  execute(scope: LocalDataDeletionScope): Promise<void>;
}
```

順序はformal local deletionを先に成功させ、その成功後にX cache cleanupを行う。

scope:
- `activity`: X cache維持
- `circle-source`: 対象event/day delete
- `event-day`: 対象event/day delete
- `all-event-days`: clear

X cache cleanup失敗を理由にformal LocalStorage削除をrollbackしない。warningをconsole/user nonfatal messageに留める。

composition rootの順序は次へ固定する。

```ts
const deleteLocalData = new DeleteLocalDataWithXPostCleanup(
  new DeleteLocalDataWithCatalogCleanup(
    deleteLocalDataUseCase,
    repository,
    catalogOfflineCache,
  ),
  xPostCache,
);
```

正式削除 -> catalog cleanup（既存wrapper内でnonfatal）-> X cache cleanupの順で、同じscopeを適用する。

## E2E contract

CIから実Yahooを呼ばない。Playwrightでsame-origin `/api/x-posts`をroute interception。

必須scenario:

1. Pixiv account -> `投稿情報なし`、X API requestなし。
2. X account -> recent text posts表示。
3. 投稿欄だけscroll、nextCursor request。
4. reload -> IndexedDB cacheを先に表示。
5. day scan -> `完売`取得 -> current target banner。
6. mention -> route map pin warning。
7. mention -> nearby warning。
8. warning後もroute/ALNS preview semantics不変。
9. API 429/500 -> route guidance/purchase/hold操作継続。
10. offline -> cache済みpost/warning表示、new networkなし。
11. event/day switch -> old responseを新dayへ表示しない。
12. source accountをX -> Pixivへ変えた後、旧X resultを表示しない。
13. activity delete -> cache維持。
14. event-day delete -> cache削除。
15. all delete -> cache全削除。
16. 200% text zoom -> post/warningが操作UIを覆わない。

E2E fixtureはFunctionが返すnormalized contractだけをmockし、Yahoo raw schemaをbrowser E2Eへ持ち込まない。

## live acceptance

Cloudflare previewで:
- Function routeが存在
- valid public X handleでtext-only成功responseまたは観測可能な正規化error
- invalid handleはupstreamを呼ばず4xx
- Pixivはbrowser側でFunction request自体なし
- external failureでもpage/routeが利用可能

actual mobile相当/実機で:
- collapsed detail時のmap-first面積維持
- detail openで投稿欄が約2件高さ
- 投稿欄scrollとpage scroll/map gestureが不自然に競合しない
- long text/改行/URL文字列がoverflowしない
- warning `!`が色だけに依存しない
- 200% text zoom
- offline cache表示

## 実装手順

1. RED: application assemblyがX client/cache/monitor/panelをproduction runtimeへ渡すtestを書く。
2. RED: start failureがapp全体を止めないlifecycle testを書く。
3. RED: event switch/source refresh/stopでstale responseを遮断するtestを書く。
4. RED: deletion scopeごとのcache behaviorとcleanup failure nonrollback testを書く。
5. RED: architecture boundary testへ、`x-post-monitoring/domain`がapp/UI/infrastructureへ依存しないことと、monitorがroute/purchase mutation concreteをimportしないことを追加する。
6. composition rootへfeatureを接続する。
7. BrowserApplication lifecycleへstart/switch/source/status/stop hookを最小追加する。generic lifecycle busを作らない。
8. deletion decoratorを接続する。
9. E2E fixtures/routesを追加し、上記scenarioを証明する。
10. focused test -> full `npm run verify` -> CI-equivalent E2Eを実行する。
11. visual差分が出たらexpectedだから更新するのではなく、人間がroute map/post panel/warningを確認してからsnapshotを更新する。
12. Cloudflare preview live smokeとmobile/actual-device acceptanceを記録する。
13. すべてgreen/acceptedの場合だけprogress/current phase closureを更新する。外部API live contractが壊れている場合はX featureの状態を明記し、成功扱いにしない。

## 検証コマンド

focused:

```bash
npx vitest run --root . \
  tests/x-post-cleanup.test.ts \
  tests/x-post-runtime-lifecycle.test.ts \
  tests/application-assembly.test.ts \
  tests/apps-behavior-characterization.test.ts
```

full:

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

Task 1で追加した`typecheck:functions`が`npm run verify`経路に含まれていることを確認する。

## 受入条件

- production composition rootからX featureが実際に接続される。
- X feature failureでapp start/navigationを失敗させない。
- event/day/source switch後のstale data混入なし。
- stop後timer/listener/request残留なし。
- delete scopeがX cacheへ正しく反映。
- CI E2Eは外部Yahooに依存しない。
- Cloudflare preview live smokeを別途通す。
- mobile/200% zoom/offlineを確認。
- full verify / CI-equivalent E2E / public tree audit / diff checkを通す。
- visual snapshotは人間確認後だけ更新。

## 予定コミットメッセージ

```text
test(phase-07-6): close x post monitoring integration
```
