# Phase 7.5 Planning Basis

## 基準

- Repository: `tiga-kk/meirochou`
- 計画開始時main: `6c5c11ffa06921d434439b2e75587c0171d70ecb`
- Phase 7.4 Task 27: 人間確認・CI greenで完了

## 現行コードから確認した事実

### 経路地図が小さい

`apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`の`applyViewportLayout()`は`calculateMapViewportLayout()`へ`viewportMaxHeight: 520`、`minimumInteractiveHeight: 220`を渡し、JSが地図高さを決めている。

本Phaseでは`overflow: hidden`を原因扱いしない。clipは維持してviewport配分を増やす。

### 独立地図の補助UI

`DomNearbyMapView`はtitle、area select、現在地、基準地点、priority、件数、保留を通常時からすべて展開する。Phase 7.4のworkspace/gridでcardとmapの重複は解消したが、補助UIとcatalog panelがmap面積を消費する。

### ALNS progressは既にある

- `alns-worker-protocol.ts`は`progress / complete / cancelled / error`を持つ。
- `TimeDecayedAlnsWorkerKernel`は初期bestと各batch後にprogressを送る。
- `RouteGuidanceRuntimeController.launchAlnsOptimization()`はprogressとcompleteの双方で`handleWorkerProgress()`を呼ぶ。

したがって「progressを追加する」のではなく、**通知頻度とstate意味論を修正してUIへ公開する**。

### fresh startではALNSがproduction接続されていない

`StartRouteGuidanceUseCase`は最寄り候補を選びcurrent routeを作るが、distance matrix workerやALNS workerを起動しない。`BrowserApplication.searchNext()`も`startFromCurrentLocation()`後にそのまま描画して終了する。

一方で`DistanceMatrixController`、distance-matrix worker / protocol / kernel、`LocalStorageDistanceMatrixRepository`、`RouteGuidanceRuntimeController`、ALNS worker / protocol / kernelは既に存在する。新しいoptimizer基盤を増やさず、既存部品をcomposition rootからproductionへ接続する。

### distance matrixは経路形状を持たない

`StoredDistanceMatrix`は距離だけを保存し、`distance-matrix.ts`も「パス形状は保存しない」と明記する。そのためALNS progressごとに全区間の正確なwalkable pathを再計算するのは避ける。

live previewはcircle anchorを順番に結ぶ「巡回順preview」とし、既存赤current routeだけをexact walkable pathとして扱う。

## 過剰実装防止

- 全画面UI framework化しない。
- generic drawer/component libraryを作らない。
- perimeter layoutにforce simulationを使わない。
- 10件以下を同時表示するためだけにvirtualizationを導入しない。
- ALNS progress用の第二NavigationStoreを作らない。
- full itineraryのpath cache schemaを追加しない。
