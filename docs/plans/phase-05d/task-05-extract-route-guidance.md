# Phase 5D Task 5: Extract Route Guidance

**Status:** PLANNED
**Depends on:** Task 4
**Commit candidate:** `refactor(route-guidance): extract route guidance workflow`

## Goal

current location、map area、route map assets、route calculation、distance matrix、ALNS、destination selection、arrival、snapshot、resume、Worker lifecycleをRoute Guidance featureへ移す。legacy `App`からroute guidanceのmutable stateと処理順序を除く。

## Corrected source and target rules

- modify対象は`apps/webapp/js/config.ts`
- `apps/webapp/js/config.js`は存在しない
- Task 5は`features/route-guidance/ui/route-guidance-screen-model.ts`を新規作成する
- Task 8はold `ui/navigation-view-model.ts`をそのpathへmoveしない
- Task 8はold fileを責務別に分割し、route guidance screen formattingだけをTask 5のscreen modelへ統合する

## Files

### Create

- `apps/webapp/js/features/route-guidance/domain/route-guidance-types.ts`
- `apps/webapp/js/features/route-guidance/domain/map-area.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-session.ts`
- `apps/webapp/js/features/route-guidance/use-cases/active-map-area-catalog.ts`
- `apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- `apps/webapp/js/features/route-guidance/use-cases/apply-optimized-route-order.ts`
- `apps/webapp/js/features/route-guidance/use-cases/invalidate-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-map-assets-loader.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-optimizer.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-snapshot-repository.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/http-route-map-assets-loader.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/web-worker-route-optimizer.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/in-memory-map-area-catalog.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/dev-demo-nearest-neighbor-order.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `tests/start-route-guidance.test.ts`
- `tests/resume-route-guidance.test.ts`
- `tests/route-guidance-controller.test.ts`

### Move without algorithm change

- `apps/webapp/js/state/navigation-state.ts`
  → `apps/webapp/js/features/route-guidance/domain/navigation-state.ts`
- `apps/webapp/js/routing/distance-matrix.ts`
  → `apps/webapp/js/features/route-guidance/domain/routing/distance-matrix.ts`
- `apps/webapp/js/routing/distance-matrix-worker-kernel.ts`
  → `apps/webapp/js/features/route-guidance/domain/routing/distance-matrix-worker-kernel.ts`
- `apps/webapp/js/routing/alns-solver.ts`
  → `apps/webapp/js/features/route-guidance/domain/optimization/alns-solver.ts`
- `apps/webapp/js/routing/time-decayed-objective.ts`
  → `apps/webapp/js/features/route-guidance/domain/optimization/time-decayed-objective.ts`
- `apps/webapp/js/routing/alns-worker-kernel.ts`
  → `apps/webapp/js/features/route-guidance/domain/optimization/alns-worker-kernel.ts`
- `apps/webapp/js/routing/distance-matrix-worker-protocol.ts`
  → `apps/webapp/js/features/route-guidance/infrastructure/worker/distance-matrix-worker-protocol.ts`
- `apps/webapp/js/routing/distance-matrix-worker.ts`
  → `apps/webapp/js/features/route-guidance/infrastructure/worker/distance-matrix-worker.ts`
- `apps/webapp/js/routing/alns-worker-protocol.ts`
  → `apps/webapp/js/features/route-guidance/infrastructure/worker/alns-worker-protocol.ts`
- `apps/webapp/js/routing/alns-worker.ts`
  → `apps/webapp/js/features/route-guidance/infrastructure/worker/alns-worker.ts`
- `apps/webapp/js/routing/distance-matrix-repository.ts`
  → `apps/webapp/js/features/route-guidance/infrastructure/local-storage-distance-matrix-repository.ts`
- `apps/webapp/js/route-planner.ts`
  → `apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts`
- `apps/webapp/js/navigation/optimization-input-adapter.ts`
  → `apps/webapp/js/features/route-guidance/use-cases/build-route-optimization-problem.ts`

### Refactor and delete old implementations

- `apps/webapp/js/navigation/navigation-orchestration.ts`
  - logicを`start-route-guidance.ts`、`finish-current-circle.ts`、`change-destination.ts`、`apply-optimized-route-order.ts`へ分割
  - old fileを削除
- `apps/webapp/js/navigation/navigation-runtime-controller.ts`
  - runtime stateを`RouteGuidanceSession`
  - startup/resumeを`ResumeRouteGuidance`
  - snapshot save/clearをRepository contractへ分割
  - old fileを削除
- `apps/webapp/js/state/navigation-snapshot-repository.ts`
  - concrete behaviorを`LocalStorageRouteGuidanceSnapshotRepository`へrename/move
  - old fileを削除
- `apps/webapp/js/routing/distance-matrix-controller.ts`
  - use-case coordinationを`build-distance-matrix.ts`としてRoute Guidance featureへ移す
  - old generic Controller fileを削除
- `apps/webapp/js/tsp-solver.js`
  - dev demoで使用するnearest-neighbor orderingだけを`DevDemoNearestNeighborOrder`へ移す
  - old misleading class/fileを削除

### Modify

- `apps/webapp/js/app.js`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/config.ts`
- `apps/webapp/js/ui/navigation-view-model.ts`
  - Task 5ではproduction route guidance screen formattingのcallerをnew screen modelへ切替
  - old fileのmap/UI utilityは残す
- `apps/webapp/js/components/navigation-resume-dialog.ts`
- `apps/webapp/js/components/circle-detail-dialog.ts`
- `tests/navigation-orchestration.test.ts`
- `tests/navigation-recovery.test.ts`
- `tests/navigation-runtime-controller.test.ts`
- `tests/optimization-input-adapter.test.ts`
- `tests/alns-adapter.test.ts`
- `tests/alns-worker.test.ts`
- `tests/alns-worker-protocol.test.ts`
- `tests/time-decayed-objective.test.ts`
- `tests/distance-matrix.test.ts`
- `tests/distance-matrix-controller.test.ts`
- `tests/distance-matrix-repository.test.ts`
- `tests/distance-matrix-worker.test.ts`
- `tests/e2e/navigation-resume.spec.ts`
- `tests/e2e/navigation-mobile.spec.ts`
- `tests/e2e/navigation-keyboard.spec.ts`
- `scripts/webapp-architecture-legacy-allowlist.json`

## Preflight

```bash
test -e apps/webapp/js/config.ts
test ! -e apps/webapp/js/config.js
test -e apps/webapp/js/ui/navigation-view-model.ts
test -e apps/webapp/js/navigation/navigation-orchestration.ts
test -e apps/webapp/js/navigation/navigation-runtime-controller.ts
test -e apps/webapp/js/state/navigation-state.ts
test -e apps/webapp/js/state/navigation-snapshot-repository.ts
test -e apps/webapp/js/route-planner.ts
test -e apps/webapp/js/tsp-solver.js
test ! -e apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model.ts
```

## Interfaces

```ts
export interface RouteGuidanceSessionSnapshot {
  readonly navigationState: NavigationState | null;
  readonly currentDestination: Circle | null;
  readonly currentRoute: RouteResult | null;
  readonly selectedDestination: Circle | null;
  readonly selectedRoute: RouteResult | null;
  readonly selectionStatus:
    | "idle"
    | "calculating"
    | "ready"
    | "comparing"
    | "error";
  readonly routeOptimizationGeneration: number;
}

export interface RouteGuidanceSession {
  getSnapshot(): RouteGuidanceSessionSnapshot;
  replaceSnapshot(snapshot: RouteGuidanceSessionSnapshot): void;
  clear(): void;
  subscribe(
    listener: (snapshot: RouteGuidanceSessionSnapshot) => void,
  ): () => void;
}
```

```ts
export interface MapAreaCatalog {
  getAllMapAreas(): readonly MapArea[];
  getMapArea(areaId: string): MapArea | null;
  findMapAreaForCircleSpace(circleSpace: string): MapArea | null;
  initializeMapAreas(areas: readonly MapArea[]): void;
  replaceMapAreas(areas: readonly MapArea[]): void;
}
```

```ts
export interface RouteMapAssets {
  readonly points: PointsPayload;
  readonly gridMetadata: GridMeta;
  readonly gridBytes: Uint8Array;
}

export interface RouteMapAssetsLoader {
  loadMapAssets(mapAreaId: string): Promise<RouteMapAssets>;
  clearCachedMapAssets(mapAreaId?: string): void;
}
```

```ts
export interface RouteOptimizer {
  startOptimization(
    problem: TimeDecayedOptimizationProblem,
    options: RouteOptimizationOptions,
  ): RouteOptimizationRun;
}

export interface RouteOptimizationRun {
  cancel(): void;
  onProgress(listener: (progress: RouteOptimizationProgress) => void): void;
  result: Promise<RouteOptimizationResult>;
}
```

```ts
export interface RouteGuidanceSnapshotRepository {
  loadSnapshot(eventDay: EventDayRef): NavigationSnapshot | null;
  saveSnapshot(
    eventDay: EventDayRef,
    snapshot: NavigationSnapshot,
  ): void;
  deleteSnapshot(eventDay: EventDayRef): void;
}
```

```ts
export interface RouteGuidanceController {
  startFromCurrentLocation(input: unknown): Promise<void>;
  selectDestination(circleSpace: unknown): Promise<void>;
  showRouteComparison(): void;
  confirmDestinationChange(): Promise<void>;
  cancelDestinationChange(): void;
  resumeSavedGuidance(): Promise<void>;
  resetStartingLocation(): Promise<void>;
  setOptimizationTimeLimit(milliseconds: unknown): void;
  stop(): void;
}
```

Route Guidanceは`CircleStatusActions`を`circle-status/public-api.ts`から受け取る。circle-status Infrastructureを直接importしない。

## TDD procedure

- [ ] **Step 1: route guidance sessionのRED testを書く**

current/selected destination、route、selection status、Worker generationが一つのsessionにあり、subscriberへatomic snapshotを返すことを検証する。

- [ ] **Step 2: start Use CaseのRED testを書く**

same map area候補だけを使用し、current locationをwalkable endpointへ解決し、first destination、route、snapshotを設定することを検証する。

- [ ] **Step 3: resume Use CaseのRED testを書く**

valid snapshot、route geometry再構築、saved best order warm-start、invalid snapshot clear、geometry失敗時snapshot保持を検証する。

- [ ] **Step 4: destination changeとcurrent circle completionのRED testを書く**

current leg固定、selected route comparison、purchase/hold後の次destination、stale Worker progress拒否を検証する。

- [ ] **Step 5: browser infrastructureのRED testを書く**

HTTP loaderのruntime parsing/cache/error、Web Worker optimizerのgeneration/cancel、LocalStorage snapshotのquota error behaviorを検証する。

- [ ] **Step 6: ControllerのRED testを書く**

unknown input validation、loading、screen model、notification、focus、stop後のstale callback拒否をfake Viewで検証する。

- [ ] **Step 7: REDを確認する**

```bash
npx vitest run --root . tests/start-route-guidance.test.ts \
  tests/resume-route-guidance.test.ts \
  tests/route-guidance-controller.test.ts
```

- [ ] **Step 8: pure algorithmをmechanical moveする**

Dijkstra、distance matrix、time-decayed objective、ALNS、grid route plannerのalgorithmを変更しない。renameに伴うsymbol変更とimport変更以外のdiffを出さない。

- [ ] **Step 9: MapAreaCatalogを導入する**

`Config.AREAS`のread callerをcatalogへ切り替える。Task 5では`config.ts`をcompatibility delegatorとして残し、Task 7でlast writerを移して削除する。

`Config.STORAGE_KEYS`をRoute Guidanceへ持ち込まない。

- [ ] **Step 10: browser implementationsを実装する**

- `HttpRouteMapAssetsLoader`だけが`fetch`を使用
- `WebWorkerRouteOptimizer`だけがALNS Workerを生成
- Worker entrypointsだけがprotocolを知る
- `LocalStorageRouteGuidanceSnapshotRepository`だけがsnapshot keyを知る

- [ ] **Step 11: existing orchestration/runtimeをUse Caseへ分解する**

generic `NavigationOrchestrationService`と`NavigationRuntimeController`をnew nameで包むだけにしない。各public operationが一つのUse Caseへ対応するよう分割する。

- [ ] **Step 12: new screen modelを作成する**

`route-guidance-screen-model.ts`はcurrent destination、selected destination、distance、next destination、comparison、resume表示に必要な型とformatだけを持つ。map pin geometry、image layout、safe URL、current location parsingを入れない。

- [ ] **Step 13: Controllerをproduction eventsへ接続する**

search、pin selection、route preview/confirm/cancel、resume/reset、optimization time eventsをnew Controllerへbindする。

- [ ] **Step 14: circle status変更後の進行を接続する**

Circle Status featureのpublic resultを受けて`FinishCurrentCircle`を呼ぶ。legacy Appがpurchase mutationとroute guidanceの順序を調整しない。

- [ ] **Step 15: dev demoを明確な名前へ隔離する**

nearest-neighbor fallbackは`DevDemoNearestNeighborOrder`だけに置く。production Route Guidance Use Caseからimportしない。

- [ ] **Step 16: Appからroute guidance stateを削除する**

current/selected destination、route、selection token/status、route map cache、snapshot helper、Worker generationをSession/Use Caseへ移す。

- [ ] **Step 17: old navigation/routing sourceを削除する**

全import更新後、Task FilesのRefactor/Delete対象とmove sourceを削除する。old re-export shimを作らない。

- [ ] **Step 18: allowlistを縮小する**

Appのrouting、HTTP、Worker、snapshot、map area read依存を削除する。Route Guidance Use Caseがbrowser APIsをimportしないことをcheckerで確認する。

- [ ] **Step 19: focused verificationを実行する**

```bash
npx vitest run --root . tests/start-route-guidance.test.ts \
  tests/resume-route-guidance.test.ts \
  tests/route-guidance-controller.test.ts \
  tests/navigation-orchestration.test.ts \
  tests/navigation-recovery.test.ts \
  tests/navigation-runtime-controller.test.ts \
  tests/alns-worker.test.ts tests/alns-adapter.test.ts \
  tests/distance-matrix-controller.test.ts \
  tests/distance-matrix-repository.test.ts \
  tests/route-overlay-contract.test.ts
node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 20: E2Eとregressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npx playwright test tests/e2e/navigation-resume.spec.ts \
  tests/e2e/navigation-mobile.spec.ts \
  tests/e2e/navigation-keyboard.spec.ts
git diff --check
```

- [ ] **Step 21: commit**

```bash
git add -A apps/webapp/js/features/route-guidance \
  apps/webapp/js/navigation apps/webapp/js/routing \
  apps/webapp/js/state/navigation-state.ts \
  apps/webapp/js/state/navigation-snapshot-repository.ts \
  apps/webapp/js/route-planner.ts apps/webapp/js/tsp-solver.js \
  apps/webapp/js/config.ts apps/webapp/js/ui/navigation-view-model.ts \
  apps/webapp/js/app.js apps/webapp/js/app tests \
  scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(route-guidance): extract route guidance workflow"
```

## Acceptance criteria

- source/target overlapがない。
- modify対象が`config.ts`である。
- Task 5のscreen modelとTask 8のold file分割が明確に分離される。
- Appがroute algorithm、HTTP asset load、Worker、snapshot、route runtime stateを持たない。
- Route Guidance Use Caseがbrowser APIを直接利用しない。
- route runtimeのmutable正本が`RouteGuidanceSession`に一つである。
- current leg、warm start、cancel、stale response、resume semanticsが維持される。
- production route guidanceがdev demo nearest-neighborへfallbackしない。
