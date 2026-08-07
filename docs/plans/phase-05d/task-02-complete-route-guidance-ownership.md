# フェーズ5D タスク2: Route Guidanceの状態所有と処理順序をfeatureへ移管

## 目的

`ComiPathBrowserRuntime`、`NavigationOrchestrationService`、`NavigationRuntimeController`へ分散しているRoute Guidanceのmutable stateと処理順序を、既存の`RouteGuidanceSession`とRoute Guidance Use Caseへ移す。

Task終了時、`ComiPathBrowserRuntime`は一時的なdelegatorとして残っていてよいが、route target、route、selection、optimization generation、snapshot、Worker lifecycleの正本を持ってはいけない。

既存のRoute Guidance Use Case/Sessionは移管先の骨格として利用するが、現在のproduction behaviorより優先される仕様書とは扱わない。production runtime、既存characterization、navigation testsで成立している挙動を保った上で中身を置き換える。

## 対象外

- UIの意図的な変更
- circle statusやevent/day stateの所有変更
- route algorithmの変更
- `ComiPathBrowserRuntime`自体の削除。削除はTask 5で行う。

## 前提と依存関係

Task 1完了後に実施する。Route Guidance固有algorithm、route/grid型、infrastructureのpathが一本化されていることを前提とする。

## 読むべき文書と既存実装

- `docs/plans/phase-05d/task-01-consolidate-route-guidance-modules.md`
- `apps/webapp/js/features/route-guidance/domain/route-guidance-types.ts`
- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-types.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-session.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-map-assets-loader.ts`
- `apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- `apps/webapp/js/features/route-guidance/use-cases/apply-optimized-route-order.ts`
- `apps/webapp/js/features/route-guidance/use-cases/invalidate-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/navigation/navigation-orchestration.ts`
- `apps/webapp/js/navigation/navigation-runtime-controller.ts`
- `apps/webapp/js/routing/distance-matrix-controller.ts`
- `apps/webapp/js/state/navigation-snapshot-repository.ts`
- `apps/webapp/js/comipath-browser-runtime.js`

## 対象ファイル

### 作成

- `apps/webapp/js/features/route-guidance/use-cases/build-distance-matrix.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/local-storage-route-guidance-snapshot-repository.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/web-worker-route-optimizer.ts`

既存contractで十分な場合は新しいinterfaceやsessionを追加しない。

### 変更

- `apps/webapp/js/features/route-guidance/domain/route-guidance-types.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-session.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-map-assets-loader.ts`
- `apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- `apps/webapp/js/features/route-guidance/use-cases/apply-optimized-route-order.ts`
- `apps/webapp/js/features/route-guidance/use-cases/invalidate-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/comipath-browser-runtime.js`
- Route Guidanceのunit/characterization tests

### 削除

責務移管後に次を削除する。

- `apps/webapp/js/navigation/navigation-orchestration.ts`
- `apps/webapp/js/navigation/navigation-runtime-controller.ts`
- `apps/webapp/js/routing/distance-matrix-controller.ts`
- `apps/webapp/js/state/navigation-snapshot-repository.ts`

## 実装手順

1. まず現在のproduction behaviorを基準化する。`ComiPathBrowserRuntime`と二つのroot navigation classesが持つRoute Guidanceのmutable propertyと処理順序を列挙し、関連characterization/navigation testsと対応付ける。既存feature Use Caseの現在実装だけを基準にしない。たとえば現行`StartRouteGuidanceUseCase`は先頭のpending circleを選ぶ骨格だが、production startは始点からのgrid distanceで到達可能候補を比較して最寄りを第一目的地に固定するため、その差をそのまま残してはいけない。
2. Task 1で正本化したgrid route resultを、Sessionの`currentRoute`/`selectedRoute`でも同じruntime shapeのまま使う。現在`route-guidance-types.ts`にある`path`/`distance`だけの別`RouteResult`をproduction routeの正本として残さず、`cost`、`cells`、`points`、`startPosition`、`targetPosition`、`image`を持つ実際の経路形状と一本化する。`route-guidance-session.ts`のfreeze/copy処理もその正本に合わせ、描画に必要なgeometryを失うadapterを挟まない。
3. `ComiPathBrowserRuntime`のcurrent/selected destination、current/selected route、selection status、optimization generationは既存`RouteGuidanceSessionSnapshot`へ集約する。`nextTarget`のように`bestOrder`とcurrent targetから決定的に導出できる表示値はscreen modelで導出し、同期用mutable copyをSessionへ増やさない。selection message等の純粋な表示文言もdomain stateにしない。
4. route assets cache、distance matrix参照、resume snapshot、optimization time limit等、Session外に残す値にもownerを一つずつ決める。browser runtimeのfieldとfeature infrastructure/use-caseの両方で同じ値を同期保持しない。
5. `StartRouteGuidanceUseCase`へproduction startの処理順序を移す。少なくとも、対象area確定→map assets取得→始点から各pending circleへのgrid distance算出→到達可能な最寄りtarget決定→第一leg固定→targetへのroute再構築成功確認→Session commitの順を保つ。route再構築に失敗した場合、部分的なnavigation stateをSessionへcommitしない。pendingが0件ならidleとして扱う既存production semanticsを維持する。
6. resume、destination change、arrival/finish、optimized order適用、invalidateの処理順序を対応する既存Use Caseへ移す。generic orchestration classの別名移植はしない。第一legをoptimizer resultで上書きしない、stale generationを無視する等の既存制約を保つ。
7. distance matrix生成の調整だけを`build-distance-matrix.ts`へ移し、計算本体はTask 1で移動したpure moduleを呼ぶ。
8. snapshotの保存・復元・削除を`RouteGuidanceSnapshotRepository` contract経由に統一し、LocalStorage keyはconcrete repositoryだけが知るようにする。
9. ALNS Workerの生成、cancel、generationによるstale result拒否を`WebWorkerRouteOptimizer`へ集約する。Sessionへ`Worker` objectそのものを保持しない。
10. `RouteGuidanceController`にproduction操作として不足しているdestination選択、比較、確定/取消、current circle完了、reset、time limit等を、既存Use Caseを呼ぶ薄いoperationとして追加する。
11. `ComiPathBrowserRuntime`の同名処理はController/Use Caseへdelegateするだけに縮め、移管済みstateをruntime側で同期コピーしない。
12. root navigation/controller/snapshot filesへのimportを0件にして削除する。

## テスト方針

主に次を直接検証する。

- Session snapshotだけからcurrent/selected route状態を、実際のgrid route geometryを失わず再現できる。
- source配列の先頭より近い別candidateがあるfixtureで、production startがgrid distance最小の到達可能candidateを選び、第一legを固定する。既存骨格の「先頭要素を選ぶ」実装のままなら失敗するtestにする。
- route再構築失敗時にSessionが半端なnavigating stateへ更新されない。
- start/resume/change/finishの各Use Caseが期待する状態遷移を行う。
- stale Worker progress/resultはSessionを変更しない。
- snapshot invalidationとresume failureの既存semanticsを維持する。
- `ComiPathBrowserRuntime`のprivate fieldを観測しないtestへ移行する。
- production assemblyからControllerを経由して同じ操作が到達し、mock内だけで新Session/Use Caseが成立していない。

既存`npm run test:route-guidance`がGREENであることだけではproduction behavior移管の証明にしない。既存feature skeletonのtestとproduction characterizationの両方を更新し、旧runtime/orchestrationを外すと意味のあるassertionが失敗することを確認する。

## 検証コマンド

```bash
npm run test:route-guidance
npx vitest run --root . tests/navigation-orchestration.test.ts \
  tests/navigation-recovery.test.ts \
  tests/optimization-input-adapter.test.ts \
  tests/apps-behavior-characterization.test.ts
npm run test:phase-05d-regressions
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- Route Guidanceのmutable stateを追う入口が`RouteGuidanceSession`に一本化されている。
- productionで描画するgrid route resultとSessionが保持するroute型が一本化され、lossyな二重表現がない。
- production startの最寄りcandidate選択、第一leg固定、route再構築失敗時の非commitがfeature Use Caseで維持されている。
- `NavigationOrchestrationService`と`NavigationRuntimeController`が存在しない。
- `ComiPathBrowserRuntime`がroute state、Worker generation、snapshot stateを正本として持たない。
- productionの各route操作が既存Use Case/Controllerを経由する。
- Worker、LocalStorage、route algorithmへのconcrete依存がUse Caseへ漏れていない。
- focused tests、Phase 5D regression tests、architecture check、buildが成功する。

## 予定コミットメッセージ

```text
refactor(route-guidance): centralize guidance ownership
```
