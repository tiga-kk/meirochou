# フェーズ5D タスク1: Route Guidance固有モジュールの配置を一本化

## 目的

Route Guidanceにだけ使うpure algorithm、Worker protocol、LocalStorage repository、最適化入力変換を`features/route-guidance/`配下へ集約する。

このタスクは配置とimport境界の整理だけを行う。`ComiPathBrowserRuntime`の処理順序やmutable stateの移管はTask 2で行う。

## 対象外

- Dijkstra、距離行列、ALNS、時間減衰目的関数の計算変更
- Route Guidanceの画面挙動変更
- `ComiPathBrowserRuntime`の削除
- 新しい汎用routing frameworkの導入

## 前提と依存関係

依存Taskはない。現行のroute guidance focused testsと`npm run verify:webapp`が基準挙動である。

## 読むべき文書と既存実装

- `docs/plans/phase-05d/README.md`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/features/route-guidance/domain/route-guidance-types.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-session.ts`
- `apps/webapp/js/route-planner.ts`
- `apps/webapp/js/navigation/optimization-input-adapter.ts`
- `apps/webapp/js/navigation/map-session.ts`
- `apps/webapp/js/navigation/start-selection.ts`
- `apps/webapp/js/routing/`
- 関連する`tests/*routing*`、`tests/*alns*`、`tests/*distance-matrix*`

## 対象ファイル

### 作成

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

### 変更

- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/comipath-browser-runtime.js`
- `apps/webapp/js/navigation/navigation-runtime-controller.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- 関連するrouting/ALNS/distance-matrix/navigation unit tests

### 削除

新pathへのimport切替後、次の旧pathを削除する。

- `apps/webapp/js/route-planner.ts`
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

1. 各旧moduleのproduction callerとtest callerを`rg`で列挙する。
2. pure algorithmは処理本体を変更せず、上記target pathへ移す。import pathや型名の整理に必要な最小差分だけを許容する。
3. Worker protocol/entrypointは`infrastructure/worker/`へ、LocalStorage実装は`infrastructure/`へ移す。Use Caseやdomainからbrowser APIを直接参照させない。
4. `optimization-input-adapter.ts`はRoute Guidance固有の入力変換として`build-route-optimization-problem.ts`へ移す。入力値・返り値・validation semanticsを維持する。
5. `map-session.ts`と`start-selection.ts`はRoute Guidance domainへ移し、旧root moduleを残さない。
6. production callerとtestsを新pathへ切り替える。旧pathのre-export shimは作らない。
7. 最後に旧pathへのimportが0件であることを確認して削除する。

`navigation/navigation-orchestration.ts`、`navigation/navigation-runtime-controller.ts`、`routing/distance-matrix-controller.ts`は処理順序を持つため、このタスクで別名移動しない。Task 2で既存Use Caseへ分解する。

## テスト方針

アルゴリズムの期待値は変更しない。既存testを新pathへ向け直し、同じfixture・同じ期待値で通ることを確認する。

追加testが必要なのは、移動後にdomain/use-caseがDOM、LocalStorage、`fetch`、`Worker`へ直接依存していないことを証明する場合だけとする。単なるfile存在testは追加しない。

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

存在するdistance-matrix関連testも同じ作業で実行する。

## 受入条件

- 上記旧route/routing pathへのproduction importが0件である。
- pure algorithmの既存期待値が変わっていない。
- WorkerとLocalStorageのconcrete実装がRoute Guidance infrastructureから追える。
- `ComiPathBrowserRuntime`や別のFacadeへアルゴリズムをコピーしていない。
- `navigation/navigation-orchestration.ts`等を単にfeature配下へrenameしただけの状態になっていない。
- focused tests、architecture check、buildが成功する。

## 予定コミットメッセージ

```text
refactor(route-guidance): consolidate route modules
```
