# Phase 7.6 Task 9: lifecycle・削除・offline・gallery回帰・E2E・実環境を閉じる

## 目的

X投稿featureをcomposition rootへ完全接続し、app start/stop、event/day switch、source refresh、local data deletion、offline、外部API failureを含むproduction lifecycleを証明する。さらにTask 7のwall classification/optimization接続とTask 8のgallery ordering/sale badgeをfull regressionへ含め、Phaseを閉じる。

## 対象外

- 新しいX機能追加。
- Yahoo以外のprovider fallback。
- official X API移行。
- route semantics変更。
- gallery sort方式の再設計。
- ALNS objective/operator変更。
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
- `tests/c108-map-assets.test.ts`
- `tests/prepare-route-optimization.test.ts`
- `tests/gallery-view-model.test.ts`
- `tests/gallery-ordering.test.ts`

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

Task 7までに接続済み:
W_* wall classification -> PreparedRouteOptimization.queueClass

Task 8までに接続済み:
gallery point loader / position sort / sale badge

Task 9で追加して閉じる:
DeleteLocalDataWithXPostCleanup
full lifecycle / regression evidence
```

新DI container/global singletonを追加しない。

test injectionが必要な場合は`AssembleComiPathApplicationOptions`へ具体的なport overrideをoptional追加する。production defaultは既存Taskで決めた具体実装。

## lifecycle contract

### start

1. active event/day restore
2. current event registry dayから`date`を解決
3. X cacheからmention stateをderive
4. panel target/current targetを更新
5. monitor start
6. current targetを優先

X cache/monitor start failureでBrowserApplication全体の`start()`をrejectしない。feature unavailableとして表示を縮退する。

Task 8のgallery point loaderはlazyであり、app start時に全area map assetを新規prefetchしない。

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

map area catalog/assetsが切り替わる場合、Task 8 galleryのcached point mappingは新しいarea/bundleに従う。旧bundleのlate load結果を新galleryへ適用しない。

### source refresh / replace

circle source operation完了後:
- panel current circle accountを再評価
- monitor `refreshCircleAccounts()`
- handle変更前のstale requestを新circleへ適用しない

wall classificationはsourceから持たずmap assetからderiveするため、source refreshでwall master dataを再構築しない。

### status change

purchase/holdによる既存circle status mutation後:
- monitor対象queueを再評価
- X featureがcircle statusを逆方向へ書き換えない
- galleryは既存scope/select behaviorで対象cardを更新する
- sale badge/wall sortがstatus mutationを代行しない

### stop

- monitor stop
- panel dispose
- subscriptions解除
- timer/listener解除
- request abort
- `XPostCache.dispose()`でIndexedDB connection close
- stop後のasync completionでDOMを更新しない
- galleryのlate point loadもstop/close後に表示更新しない

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

composition rootの順序:

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
8. mention -> galleryに小さい`完売関連`badge、full timelineなし。
9. warning後もroute/ALNS preview semantics不変。
10. gallery warning後もcard order/swipe/purchase semantics不変。
11. API 429/500 -> route guidance/purchase/hold操作継続。
12. offline -> cache済みpost/warning表示、new networkなし。
13. event/day switch -> old responseを新dayへ表示しない。
14. source accountをX -> Pixivへ変えた後、旧X resultを表示しない。
15. activity delete -> cache維持。
16. event-day delete -> cache削除。
17. all delete -> cache全削除。
18. priority値が異なってもgalleryはspace/position順。
19. priority filterはgalleryで維持。
20. wall fixtureはsame-area nearest non-wall anchor位置へ並ぶ。
21. gallery point asset failureではsymbolic space順で利用継続。
22. 200% text zoom -> post/warning/gallery badgeが操作UIを覆わない。

E2E fixtureはFunctionが返すnormalized contractだけをmockし、Yahoo raw schemaをbrowser E2Eへ持ち込まない。

## optimization regression contract

Task 7のfocused testだけに依存せず、full suiteで次を維持する。

- C108 `W_*` wall identifier mappingがassetからderiveできる。
- wall/non-wall identifierが同一areaで混在しない。
- `PrepareRouteOptimizationUseCase`のreturned pending circleへ`queueClass`が付く。
- source circleはmutationされない。
- existing wall service time / default service time testがgreen。
- distance matrix endpoint順・cache key semanticsが変わらない。
- ALNS objective/operator snapshot/contractに不要な差分を作らない。

## gallery regression contract

- priority comparatorが復活していない。
- priority filter/displayは残る。
- normal circleの従来space順。
- wall nearest anchorはsame-area only。
- tie-break決定論的。
- missing/loading error fallback。
- sale mention badgeはorderへ入らない。
- galleryへX full timelineなし。
- loaderは既存RouteMapAssetsLoaderを再利用し、追加global cacheなし。

## live acceptance

Cloudflare preview:
- Function routeが存在
- valid public X handleでtext-only成功responseまたは観測可能な正規化error
- invalid handleはupstreamを呼ばず4xx
- Pixivはbrowser側でFunction request自体なし
- external failureでもpage/route/galleryが利用可能

actual mobile相当/実機:
- collapsed detail時のmap-first面積維持
- detail openで投稿欄が約2件高さ
- 投稿欄scrollとpage scroll/map gestureが不自然に競合しない
- long text/改行/URL文字列がoverflowしない
- warning `!`が色だけに依存しない
- galleryの`完売関連`badgeがcard操作を邪魔しない
- gallery priority filterが使える
- wall circleが周辺normal位置へ自然に並ぶ
- 200% text zoom
- offline cache表示

## 実装手順

- [ ] **Step 1: application assembly lifecycle REDを書く**

`tests/application-assembly.test.ts` / `tests/x-post-runtime-lifecycle.test.ts`へproduction X client/cache/monitor/panel接続とstartup nonfatal contractを追加する。

- [ ] **Step 2: lifecycle REDを実行する**

```bash
npx vitest run --root . \
  tests/x-post-runtime-lifecycle.test.ts \
  tests/application-assembly.test.ts
```

期待: 未接続箇所でFAIL。

- [ ] **Step 3: event switch/source refresh/stopのstale response REDを書く**

old generationのX responseとgallery point loadが新event/day/closed UIを更新しないtestを追加する。

- [ ] **Step 4: deletion scope REDを書く**

`tests/x-post-cleanup.test.ts`へactivity維持、circle-source/event-day削除、all clear、cleanup failure nonrollbackを追加する。

- [ ] **Step 5: architecture gateを追加する**

`tests/architecture-boundaries.test.mjs`へ:
- `x-post-monitoring/domain`がapp/UI/infrastructureへ依存しない。
- monitorがroute/purchase mutation concreteをimportしない。
- shared wall classificationがroute-guidance/circle-status concreteへ依存しない。
- circle-status galleryがroute-guidance concrete loaderをimportしない。

を追加する。

- [ ] **Step 6: composition/lifecycle/cleanupを最小接続する**

generic lifecycle busやDI containerを作らず既存BrowserApplication hookへ接続する。

- [ ] **Step 7: focused lifecycle/cleanupをGREENにする**

```bash
npx vitest run --root . \
  tests/x-post-cleanup.test.ts \
  tests/x-post-runtime-lifecycle.test.ts \
  tests/application-assembly.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/architecture-boundaries.test.mjs
```

期待: 全PASS。

- [ ] **Step 8: Task 7〜8 focused regressionを再実行する**

```bash
npx vitest run --root . \
  tests/wall-circle-classification.test.ts \
  tests/c108-map-assets.test.ts \
  tests/prepare-route-optimization.test.ts \
  tests/optimization-input-adapter.test.ts \
  tests/gallery-view-model.test.ts \
  tests/gallery-ordering.test.ts
```

期待: 全PASS。

- [ ] **Step 9: E2E fixtures/routesを追加する**

上記22 scenarioのうち既存testで未証明のものを`tests/e2e/webapp.spec.ts`へ追加する。Yahoo raw schemaはfixtureへ入れない。

- [ ] **Step 10: CI-equivalent full verificationを実行する**

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

期待: 全PASS。

Task 1で追加する`typecheck:functions`が`npm run verify`経路に含まれていることを確認する。

- [ ] **Step 11: visual/manual acceptanceを行う**

visual差分が出ても自動更新しない。route map/post panel/warning/gallery ordering/badgeを人間が確認した後だけsnapshotを更新する。

- [ ] **Step 12: Cloudflare preview live smokeを行う**

live Yahoo failure時もroute guidance/galleryが利用可能であることを含めて記録する。

- [ ] **Step 13: progressを閉じる**

すべてgreen/acceptedの場合だけ`docs/status/progress.md`のcurrent phase closureを更新する。外部API live contractが壊れている場合はX featureの状態を明記し、成功扱いにしない。

- [ ] **Step 14: commit**

```bash
git add \
  apps/webapp/js/app/delete-local-data-with-x-post-cleanup.ts \
  apps/webapp/js/app/assemble-comipath-application.ts \
  apps/webapp/js/app/browser-application.ts \
  apps/webapp/js/features/x-post-monitoring/public-api.ts \
  tests/x-post-cleanup.test.ts \
  tests/x-post-runtime-lifecycle.test.ts \
  tests/application-assembly.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/architecture-boundaries.test.mjs \
  tests/e2e/webapp.spec.ts \
  docs/status/progress.md
git commit -m "test(phase-07-6): close x post and gallery integration"
```

## 受入条件

- production composition rootからX featureが実際に接続される。
- X feature failureでapp start/navigation/galleryを失敗させない。
- event/day/source switch後のstale data混入なし。
- stop後timer/listener/request/late gallery render残留なし。
- delete scopeがX cacheへ正しく反映。
- CI E2Eは外部Yahooに依存しない。
- Cloudflare preview live smokeを別途通す。
- Task 7 wall classification -> queueClass -> existing service timeがfull regressionで維持。
- Task 8 priority-free gallery order / wall anchor / sale badgeがfull regressionで維持。
- mobile/200% zoom/offlineを確認。
- full verify / CI-equivalent E2E / public tree audit / diff checkを通す。
- visual snapshotは人間確認後だけ更新。

## 予定コミットメッセージ

```text
test(phase-07-6): close x post and gallery integration
```
