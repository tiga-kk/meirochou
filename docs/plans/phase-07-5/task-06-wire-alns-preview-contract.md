# Phase 7.5 Task 6: fresh start ALNSとpreview-only progress contractをproduction接続

## 目的

既存distance-matrix workerとALNS workerをfresh startへ接続し、ALNS progressを正式NavigationState更新から分離する。

## 対象外

- ALNS solverの評価関数/operator変更。
- 地図への青紫preview描画。
- progressごとのpath再計算。
- unused `WebWorkerRouteOptimizer`を新しいproduction正本にすること。
- route priority / holdの候補選定意味論を最適化準備側で再解釈すること。

## 前提と依存関係

Task 1完了。Phase 7.4 navigation semanticsを維持する。

fresh startの最適化対象は、`BrowserApplication.searchNext()`が`getRouteGuidanceCandidates(selectedPriorities)`で確定し、`StartRouteGuidanceUseCase`へ渡した**同一のfiltered candidate集合**とする。最適化準備側で`getUnvisited()`等から候補を取り直してはいけない。priorityで除外されたcircleやholdはdistance matrix、ALNS `nodeIds`、previewへ再混入させない。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/infrastructure/distance-matrix-controller.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/worker/distance-matrix-worker.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/route-guidance-runtime-controller.ts`
- `apps/webapp/js/features/route-guidance/domain/optimization/alns-worker-kernel.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/worker/alns-worker-protocol.ts`
- `apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/route-guidance/use-cases/route-optimization-preview.ts`
- `apps/webapp/js/features/route-guidance/use-cases/prepare-route-optimization.ts`
- `tests/route-optimization-preview.test.ts`
- `tests/prepare-route-optimization.test.ts`

### 変更

- `apps/webapp/js/features/route-guidance/infrastructure/route-guidance-runtime-controller.ts`
- `apps/webapp/js/features/route-guidance/domain/optimization/alns-worker-kernel.ts`
- `apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/browser-application.ts`
- `tests/navigation-runtime-controller.test.ts`
- `tests/alns-worker.test.ts`
- `tests/distance-matrix-controller.test.ts`
- `tests/apps-behavior-characterization.test.ts`

### 削除

なし。unused optimizerの整理はこのTaskの目的にしない。

## Interfaces

```ts
export interface RouteOptimizationPreview {
  readonly jobId: string;
  readonly generation: number;
  readonly elapsedMs: number;
  readonly searchTimeLimitMs: number;
  readonly bestOrder: readonly string[];
  readonly score: number;
}

export interface RouteOptimizationCallbacks {
  onPreview(preview: RouteOptimizationPreview): void;
  onCommit(navState: NavigationState): void;
  onCancel?(): void;
  onError?(code: string): void;
}

export interface PrepareRouteOptimizationInput {
  readonly eventDay: EventDayRef;
  readonly bundleVersion: string;
  readonly areaId: string;
  readonly currentPosition: ConfirmedPosition;
  /** searchNextでpriority/hold条件を適用済みの、StartRouteGuidanceUseCaseと同一集合。 */
  readonly pendingCircles: readonly CircleRecord[];
  readonly searchTimeLimitMs: 5000 | 10000 | 15000;
}
```

`PrepareRouteOptimizationUseCase`はこの`pendingCircles`だけからmatrix endpointsとALNS inputを作る。候補をrepository/sessionから再取得するAPIを持たせない。

`RouteGuidanceRuntimePort.launchAlnsOptimization(input, callbacks)`へ変更する。`progress`では`onPreview`だけ、`complete`では`handleWorkerProgress()`を一度だけ適用して`onCommit`する。

## 実装手順

1. RED: runtime progressを受けても`NavigationState.bestOrder`が変わらず、completeでだけ変わるtestを書く。
2. RED: stale/cancelled responseはcommitしないtestを書く。
3. RED: workerが初期bestを即時送る一方、改善progressは250ms未満では連投せず、completeは即時送るtestを書く。
4. RED: priority 10だけを選択したfresh startで、priority 9やhold circleがmatrix endpoints・ALNS `nodeIds`へ入らないintegration testを書く。
5. `RouteOptimizationPreview`とcallbacks contractを実装する。
6. kernelに`progressIntervalMs=250`を追加し、best score改善をdirtyとしてcoalesceする。initial progressとcompleteは待たせない。
7. `ResumeRouteGuidanceUseCase`をcallbacks contractへ移行し、snapshot保存は`onCommit`だけにする。
8. `PrepareRouteOptimizationUseCase`で**入力済み`pendingCircles`のみ**のfirst portalからmatrix endpointsを作り、既存`DistanceMatrixController`へ渡すjob inputとALNS inputを構築する。候補集合を再取得・拡張しない。
9. composition rootで`DistanceMatrixController`を既存`LocalStorageDistanceMatrixRepository`とdistance-matrix workerへ接続する。appへinfrastructure concreteを漏らさない。
10. fresh `searchNext()`は`getRouteGuidanceCandidates(selectedPriorities)`で得た同一配列を、従来のnearest current route開始とbackground optimization準備の双方へ渡す。current routeを先に表示し、その後distance matrix準備 -> ALNS開始を行う。
11. matrix cache hitではworker再計算せずALNSへ進む。
12. matrix計算/ALNSが失敗してもcurrent exact routeは維持し、案内開始自体をrollbackしない。
13. manual target、purchase、hold、event/day切替ではactive optimizationをinvalidateする。
14. architecture boundary、focused tests、buildを通してcommitする。

## テスト方針

最重要証明は「progressはephemeral、completeだけcommit」「fresh startでdistance matrix -> ALNS workerへproduction wiring」「既存priority/hold filterを最適化が破らない」の三点。mock importだけのtestでは合格にしない。

## 検証コマンド

```bash
npx vitest run --root . tests/route-optimization-preview.test.ts tests/prepare-route-optimization.test.ts tests/navigation-runtime-controller.test.ts tests/alns-worker.test.ts tests/distance-matrix-controller.test.ts tests/apps-behavior-characterization.test.ts
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- fresh startでもALNS workerがproduction経路で起動する。
- current exact routeはmatrix/ALNS待ちで消えない。
- `StartRouteGuidanceUseCase`へ渡したfiltered candidate集合とmatrix/ALNS対象が一致する。
- priority除外circleとholdがmatrix、ALNS、previewへ再混入しない。
- progressで正式bestOrder/snapshotが変わらない。
- completeでだけbestOrderをcommitする。
- progress通知は最大4回/秒程度で、finalは遅延しない。
- stale/cancelled jobがUI/stateを更新しない。

## 予定コミットメッセージ

```text
feat(phase-07-5): wire live alns preview contract
```
