# フェーズ5D タスク1: Route Guidance固有モジュールの配置を一本化

## 目的

Route Guidanceにだけ使うpure algorithm、Worker protocol、LocalStorage repository、最適化入力変換と経路計算用の型を`features/route-guidance/`配下へ集約する。

このタスクは配置とimport境界の整理だけを行う。`ComiPathBrowserRuntime`の処理順序やmutable stateの移管はTask 2で行う。

## 対象外

- Dijkstra、距離行列、ALNS、時間減衰目的関数、既存nearest-neighbor fallbackの計算変更
- Route Guidanceの画面挙動変更
- `ComiPathBrowserRuntime`の削除
- 新しい汎用routing frameworkの導入

## 前提と依存関係

依存Taskはない。現行のroute guidance focused testsと`npm run verify:webapp`が基準挙動である。

## 読むべき文書と既存実装

- `docs/plans/phase-05d/README.md`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/features/route-guidance/domain/route-guidance-types.ts`
- `apps/webapp/js/features/route-guidance/domain/map-area.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-session.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/runtime-map-area-catalog.ts`
- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- `apps/webapp/js/route-planner.ts`
- `apps/webapp/js/tsp-solver.js`
- `apps/webapp/js/navigation/optimization-input-adapter.ts`
- `apps/webapp/js/navigation/map-session.ts`
- `apps/webapp/js/navigation/start-selection.ts`
- `apps/webapp/js/routing/`
- 関連する`tests/*routing*`、`tests/*alns*`、`tests/*distance-matrix*`

## 対象ファイル

### 作成

- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-types.ts`
- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts`
- `apps/webapp/js/features/route-guidance/domain/routing/distance-matrix.ts`
- `apps/webapp/js/features/route-guidance/domain/routing/distance-matrix-worker-kernel.ts`
- `apps/webapp/js/features/route-guidance/domain/optimization/alns-solver.ts`
- `apps/webapp/js/features/route-guidance/domain/optimization/alns-worker-kernel.ts`
- `apps/webapp/js/features/route-guidance/domain/optimization/time-decayed-objective.ts`
- `apps/webapp/js/features/route-guidance/domain/map-session.ts`
- `apps/webapp/js/features/route-guidance/domain/start-selection.ts`
- `apps/webapp/js/features/route-guidance/use-cases/build-route-optimization-problem.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/worker/distance-matrix-worker-protocol.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/worker/distance-matrix-worker.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/worker/alns-worker-protocol.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/worker/alns-worker.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/local-storage-distance-matrix-repository.ts`

`grid-route-types.ts`には、現在`features/event-day/domain/application-contract-types.ts`に混在しているうちRoute Guidanceだけが所有すべき`OcrPortal`、`OcrPoint`、`PointsPayload`、`GridMeta`、`RouteCell`、grid routeの`RouteResult`相当を移す。既存の`MapPoint`と重複する単純な座標型は、Route Guidance側の既存型を再利用できるなら新型を増やさない。

次のfileは、`TspSolver.solve()`/`calcDist()`のcallerが実際に残る場合だけ作成する。callerがなくなるなら作らない。

- `apps/webapp/js/features/route-guidance/domain/optimization/nearest-neighbor-order.ts`

### 変更

- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/features/route-guidance/domain/route-guidance-types.ts`
- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- `apps/webapp/js/comipath-browser-runtime.js`
- `apps/webapp/js/navigation/navigation-runtime-controller.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/tsp-solver.js`
- 関連するrouting/ALNS/distance-matrix/navigation unit tests

### 削除

新pathへのimport切替後、次の旧pathを削除する。

- `apps/webapp/js/route-planner.ts`
- `apps/webapp/js/tsp-solver.js`
- `apps/webapp/js/navigation/optimization-input-adapter.ts`
- `apps/webapp/js/navigation/map-session.ts`
- `apps/webapp/js/navigation/start-selection.ts`
- `apps/webapp/js/routing/distance-matrix.ts`
- `apps/webapp/js/routing/distance-matrix-worker-kernel.ts`
- `apps/webapp/js/routing/alns-solver.ts`
- `apps/webapp/js/routing/alns-worker-kernel.ts`
- `apps/webapp/js/routing/time-decayed-objective.ts`
- `apps/webapp/js/routing/distance-matrix-worker-protocol.ts`
- `apps/webapp/js/routing/distance-matrix-worker.ts`
- `apps/webapp/js/routing/alns-worker-protocol.ts`
- `apps/webapp/js/routing/alns-worker.ts`
- `apps/webapp/js/routing/distance-matrix-repository.ts`

## 実装手順

1. 各旧moduleのproduction callerとtest callerを`rg`で列挙する。`tsp-solver.js`については`toHalfWidth()`、`parseSpace()`、`calcDist()`、`solve()`をmethod単位で確認する。`application-contract-types.ts`のroute/grid型についてもcallerを型ごとに確認する。
2. `route-planner.ts`が現在event-day contractからimportしているroute/grid geometry型を`grid-route-types.ts`へ移し、Route Guidance内部callerを新しい型へ切り替える。event-day側にRoute Guidance専用型のre-exportを追加してarchitecture checkerを回避する方法は取らない。
3. pure algorithmは処理本体を変更せず、上記target pathへ移す。import pathや型名の整理に必要な最小差分だけを許容する。
4. `grid-route-planner.ts`が現在`TspSolver.parseSpace()`経由で使っているidentifier/number抽出は、同fileのprivate pure helperまたは既存のpure domain helperへ移す。`grid-route-planner.ts`からrootの`tsp-solver.js`をimportしない。現在の`tsp-solver.js`は`runtimeMapAreaCatalog`というconcrete infrastructureをimportしているため、その依存をdomainへ持ち込んではいけない。
5. `TspSolver.solve()`/`calcDist()`の既存fallbackがproductionまたはdev characterizationで必要なら、計算規則を変えず`nearest-neighbor-order.ts`へ移す。map area判定が必要な場合は`MapAreaCatalog`等のdomain contractまたは純粋なlookup関数を引数で受け、domainから`runtimeMapAreaCatalog`をimportしない。callerが残らない場合はこのfileを作らず、旧`TspSolver`を削除する。
6. Worker protocol/entrypointは`infrastructure/worker/`へ、LocalStorage実装は`infrastructure/`へ移す。Use Caseやdomainからbrowser APIを直接参照させない。
7. `optimization-input-adapter.ts`はRoute Guidance固有の入力変換として`build-route-optimization-problem.ts`へ移す。入力値・返り値・validation semanticsを維持する。
8. `map-session.ts`と`start-selection.ts`はRoute Guidance domainへ移し、旧root moduleを残さない。
9. production callerとtestsを新pathへ切り替える。旧pathのre-export shimは作らない。
10. 最後に旧pathと`tsp-solver.js`へのproduction import、Route Guidanceから`features/event-day/domain/application-contract-types.ts`へのdeep importが0件であることを確認して旧moduleを削除する。

`navigation/navigation-orchestration.ts`、`navigation/navigation-runtime-controller.ts`、`routing/distance-matrix-controller.ts`は処理順序を持つため、このタスクで別名移動しない。Task 2で既存Use Caseへ分解する。

## テスト方針

アルゴリズムの期待値は変更しない。既存testを新pathへ向け直し、同じfixture・同じ期待値で通ることを確認する。

route/grid型の移動ではruntime object shapeを変更しない。現在のgrid route resultが持つ`cost`、`cells`、`points`、`startPosition`、`targetPosition`、`image`を別形式へ変換してしまわない。

`TspSolver`からpure helper/fallbackを移す場合も、既存のspace解析とnearest-neighbor順序の期待値を変更しない。移動のためだけに新しいpublic classやwrapperを作らない。

追加testが必要なのは、移動後にdomain/use-caseがDOM、LocalStorage、`fetch`、`Worker`、`runtimeMapAreaCatalog`等のconcrete infrastructureへ直接依存していないこと、またはcross-feature deep importが残っていないことを証明する場合だけとする。単なるfile存在testは追加しない。

## 検証コマンド

```bash
npm run test:route-guidance
npx vitest run --root . tests/navigation-orchestration.test.ts \
  tests/optimization-input-adapter.test.ts \
  tests/alns-adapter.test.ts tests/alns-worker.test.ts \
  tests/alns-worker-protocol.test.ts tests/time-decayed-objective.test.ts
npm run check:webapp
npm run build:webapp
git diff --check
```

存在するdistance-matrix関連testと、route/grid型または`TspSolver`の移動で影響する既存testも同じ作業で実行する。

## 受入条件

- 上記旧route/routing pathと`tsp-solver.js`へのproduction importが0件である。
- Route Guidance production sourceから`features/event-day/domain/application-contract-types.ts`へのdeep importが残っていない。
- route/grid geometry型の正本がRoute Guidance domainから追え、event-day contractへ専用型を残していない。
- pure algorithm、space解析、既存fallback、grid route resultのruntime shapeが変わっていない。
- Route Guidance domainが`runtimeMapAreaCatalog`等のconcrete infrastructureを直接importしていない。
- WorkerとLocalStorageのconcrete実装がRoute Guidance infrastructureから追える。
- `ComiPathBrowserRuntime`や別のFacadeへアルゴリズムをコピーしていない。
- `navigation/navigation-orchestration.ts`等を単にfeature配下へrenameしただけの状態になっていない。
- focused tests、architecture check、buildが成功する。

## 予定コミットメッセージ

```text
refactor(route-guidance): consolidate route modules
```
