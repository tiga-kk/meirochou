# フェーズ5D タスク2: Route Guidanceの状態所有と処理順序をfeatureへ移管

## 目的

`ComiPathBrowserRuntime`、`NavigationOrchestrationService`、`NavigationRuntimeController`へ分散しているRoute Guidanceのmutable stateと処理順序を、既存の`RouteGuidanceSession`とRoute Guidance Use Caseへ移す。

Task終了時、`ComiPathBrowserRuntime`は一時的なdelegatorとして残っていてよいが、route target、route、selection、optimization generation、snapshot、Worker lifecycleの正本を持ってはいけない。

## 対象外

- UIの意図的な変更
- circle statusやevent/day stateの所有変更
- route algorithmの変更
- `ComiPathBrowserRuntime`自体の削除。削除はTask 5で行う。

## 前提と依存関係

Task 1完了後に実施する。Route Guidance固有algorithmとinfrastructureのpathが一本化されていることを前提とする。

## 読むべき文書と既存実装

- `docs/plans/phase-05d/task-01-consolidate-route-guidance-modules.md`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-session.ts`
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

1. `ComiPathBrowserRuntime`と二つのroot navigation classesが持つRoute Guidanceのmutable propertyを列挙し、各propertyの唯一のownerを決める。
2. current/selected destination、current/selected route、selection status、optimization generationは既存`RouteGuidanceSessionSnapshot`へ集約する。必要なfieldだけを追加し、別sessionを作らない。
3. start、resume、destination change、arrival/finish、optimized order適用、invalidateの処理順序を対応する既存Use Caseへ移す。generic orchestration classの別名移植はしない。
4. distance matrix生成の調整だけを`build-distance-matrix.ts`へ移し、計算本体はTask 1で移動したpure moduleを呼ぶ。
5. snapshotの保存・復元・削除を`RouteGuidanceSnapshotRepository` contract経由に統一し、LocalStorage keyはconcrete repositoryだけが知るようにする。
6. ALNS Workerの生成、cancel、generationによるstale result拒否を`WebWorkerRouteOptimizer`へ集約する。Sessionへ`Worker` objectそのものを保持しない。
7. `RouteGuidanceController`にproduction操作として不足しているdestination選択、比較、確定/取消、current circle完了、reset、time limit等を、既存Use Caseを呼ぶ薄いoperationとして追加する。
8. `ComiPathBrowserRuntime`の同名処理はController/Use Caseへdelegateするだけに縮め、移管済みstateをruntime側で同期コピーしない。
9. root navigation/controller/snapshot filesへのimportを0件にして削除する。

## テスト方針

主に次を直接検証する。

- Session snapshotだけからcurrent/selected route状態を再現できる。
- start/resume/change/finishの各Use Caseが期待する状態遷移を行う。
- stale Worker progress/resultはSessionを変更しない。
- snapshot invalidationとresume failureの既存semanticsを維持する。
- `ComiPathBrowserRuntime`のprivate fieldを観測しないtestへ移行する。
- production assemblyからControllerを経由して同じ操作が到達する。

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
- `NavigationOrchestrationService`と`NavigationRuntimeController`が存在しない。
- `ComiPathBrowserRuntime`がroute state、Worker generation、snapshot stateを正本として持たない。
- productionの各route操作が既存Use Case/Controllerを経由する。
- Worker、LocalStorage、route algorithmへのconcrete依存がUse Caseへ漏れていない。
- focused tests、Phase 5D regression tests、architecture check、buildが成功する。

## 予定コミットメッセージ

```text
refactor(route-guidance): centralize guidance ownership
```
