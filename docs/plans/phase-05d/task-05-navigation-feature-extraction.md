# Phase 5D Task 5: Navigation Feature Extraction

**Status:** PLANNED
**Depends on:** Task 4
**Commit candidate:** `refactor(navigation): move runtime flow behind use cases`

## Goal

`App`に残る現在地読取、route asset取得、始点確定、目的地選択、経路比較、到着、購入/保留後の進行、snapshot、resume、Worker lifecycleをNavigation featureへ移す。

## Files

### Create

- `apps/webapp/js/features/navigation/domain/navigation.ts`
- `apps/webapp/js/features/navigation/application/navigation-session.ts`
- `apps/webapp/js/features/navigation/application/start-navigation.ts`
- `apps/webapp/js/features/navigation/application/resume-navigation.ts`
- `apps/webapp/js/features/navigation/application/change-navigation-target.ts`
- `apps/webapp/js/features/navigation/application/complete-navigation-target.ts`
- `apps/webapp/js/features/navigation/application/navigation-queries.ts`
- `apps/webapp/js/features/navigation/ports/route-asset-port.ts`
- `apps/webapp/js/features/navigation/ports/route-optimizer-port.ts`
- `apps/webapp/js/features/navigation/ports/navigation-snapshot-port.ts`
- `apps/webapp/js/features/navigation/infrastructure/http-route-asset-adapter.ts`
- `apps/webapp/js/features/navigation/infrastructure/alns-worker-adapter.ts`
- `apps/webapp/js/features/navigation/infrastructure/local-storage-navigation-snapshot-adapter.ts`
- `apps/webapp/js/features/navigation/presentation/navigation-controller.ts`
- `apps/webapp/js/features/navigation/presentation/navigation-view-model.ts`
- `apps/webapp/js/features/navigation/index.ts`
- `tests/navigation-use-cases.test.ts`
- `tests/navigation-controller-integration.test.ts`

### Move

- `apps/webapp/js/navigation/navigation-orchestration.ts` → `apps/webapp/js/features/navigation/application/navigation-orchestration.ts`
- `apps/webapp/js/navigation/navigation-runtime-controller.ts` → `apps/webapp/js/features/navigation/application/navigation-runtime.ts`
- `apps/webapp/js/state/navigation-state.ts` → `apps/webapp/js/features/navigation/domain/navigation-state.ts`
- `apps/webapp/js/state/navigation-snapshot-repository.ts` → `apps/webapp/js/features/navigation/infrastructure/navigation-snapshot-repository.ts`
- `apps/webapp/js/routing/distance-matrix.ts` → `apps/webapp/js/features/navigation/domain/routing/distance-matrix.ts`
- `apps/webapp/js/routing/distance-matrix-worker-kernel.ts` → `apps/webapp/js/features/navigation/domain/routing/distance-matrix-worker-kernel.ts`
- `apps/webapp/js/routing/distance-matrix-controller.ts` → `apps/webapp/js/features/navigation/application/distance-matrix-controller.ts`
- `apps/webapp/js/routing/distance-matrix-repository.ts` → `apps/webapp/js/features/navigation/infrastructure/distance-matrix-repository.ts`
- `apps/webapp/js/routing/distance-matrix-worker-protocol.ts` → `apps/webapp/js/features/navigation/infrastructure/worker/distance-matrix-worker-protocol.ts`
- `apps/webapp/js/routing/distance-matrix-worker.ts` → `apps/webapp/js/features/navigation/infrastructure/worker/distance-matrix-worker.ts`
- `apps/webapp/js/routing/alns-solver.ts` → `apps/webapp/js/features/navigation/domain/optimization/alns-solver.ts`
- `apps/webapp/js/routing/time-decayed-objective.ts` → `apps/webapp/js/features/navigation/domain/optimization/time-decayed-objective.ts`
- `apps/webapp/js/routing/alns-worker-kernel.ts` → `apps/webapp/js/features/navigation/domain/optimization/alns-worker-kernel.ts`
- `apps/webapp/js/routing/alns-worker-protocol.ts` → `apps/webapp/js/features/navigation/infrastructure/worker/alns-worker-protocol.ts`
- `apps/webapp/js/routing/alns-worker.ts` → `apps/webapp/js/features/navigation/infrastructure/worker/alns-worker.ts`
- `apps/webapp/js/navigation/optimization-input-adapter.ts` → `apps/webapp/js/features/navigation/application/optimization-input-adapter.ts`
- `apps/webapp/js/route-planner.ts` → `apps/webapp/js/features/navigation/domain/routing/route-planner.ts`

### Modify

- `apps/webapp/js/app.js`
- `apps/webapp/js/app/composition-root.ts`
- `apps/webapp/js/config.js`
- navigation/routing testsのimport
- E2E navigation tests
- `scripts/webapp-architecture-legacy-allowlist.json`

## Interfaces

```ts
export interface NavigationController {
  startFromLocation(input: CurrentLocationInput): Promise<void>;
  selectTarget(space: string): Promise<void>;
  previewSelectedRoute(): void;
  confirmSelectedRoute(): Promise<void>;
  cancelSelectedRoute(): void;
  completeCurrentTarget(action: "purchase" | "hold"): Promise<void>;
  resume(): Promise<void>;
  resetStart(): Promise<void>;
  setOptimizationTimeLimit(milliseconds: 5000 | 10000 | 15000): void;
  dispose(): void;
}
```

```ts
export type AreaId = string;

export interface RouteAssets {
  readonly pointsPayload: PointsPayload;
  readonly gridMeta: GridMeta;
  readonly gridBytes: Uint8Array;
}

export interface RouteAssetPort {
  load(areaId: AreaId): Promise<RouteAssets>;
  clear(areaId?: AreaId): void;
}

export interface NavigationSnapshotPort {
  load(ref: EventDayRef): NavigationSnapshot | null;
  save(ref: EventDayRef, snapshot: NavigationSnapshot): void;
  clear(ref: EventDayRef): void;
}
```

`PointsPayload`、`GridMeta`、`RouteResult`、`EventDayRef`はTask開始時点の`apps/webapp/js/types/domain.ts`を再利用する。`NavigationSnapshot`とoptimization protocol型はPhase 5C実装の既存型をmoveして再利用し、同義型を作らない。

Navigation featureは`CircleStateCommands`をfeature public APIから受け取る。circle state infrastructureを直接importしない。

## TDD Procedure

- [ ] **Step 1: StartNavigationのRED testを書く**

同一area候補だけを使用し、route assetとstart distanceをPort経由で取得し、current legを固定してsnapshotを保存することを検証する。

- [ ] **Step 2: ResumeNavigationのRED testを書く**

valid snapshot、geometry再構築、saved bestOrder warm-start、geometry失敗時のsnapshot保持を検証する。

- [ ] **Step 3: Controller integrationのRED testを書く**

location input、loading、route view、toast、snapshot trigger、stale selection token、disposeをfake Viewで検証する。

- [ ] **Step 4: REDを確認する**

```bash
npx vitest run --root . tests/navigation-use-cases.test.ts \
  tests/navigation-controller-integration.test.ts
```

- [ ] **Step 5: Domainとexisting pure implementationをmoveする**

Dijkstra、distance matrix、time-decayed objective、ALNS algorithmの内容を変更しない。move commit内でformat以外のalgorithm diffを出さない。

- [ ] **Step 6: browser adapterを実装する**

`http-route-asset-adapter.ts`だけが`fetch`とroute asset cacheを扱う。runtime parserは既存parserを利用する。

`alns-worker-adapter.ts`だけがWorker factory、message protocol、generation、cancelを扱う。

- [ ] **Step 7: Use Caseを実装する**

Appの`searchNext`、`handleSetNextTarget`、resume、snapshot save/clearの処理順序を移す。user-facing messageは返さずtyped errorを返す。

- [ ] **Step 8: Controllerをproduction eventへ接続する**

`btn-search`、map pin select、route preview/confirm/cancel、resume dialog、optimization time eventをControllerへbindする。

- [ ] **Step 9: purchase/hold後のnavigation進行を接続する**

ControllerはCircle State Commandsの成功結果を受けてNavigation Use Caseを進める。Appがmutationとnavigationの順序を調整しない。

- [ ] **Step 10: dev demoを隔離する**

`demo_ui=1`のlegacy TSP behaviorは`features/navigation/infrastructure/dev-demo-navigation-adapter.ts`へ移す。production Use Caseから`TspSolver`をimportしない。

- [ ] **Step 11: Appからnavigation state/property/methodを削除する**

`currentTarget`、`currentRoute`、`selectedTarget`、`selectionState`、route asset cache、navigation snapshot helperをNavigation Session/Controllerへ移す。

- [ ] **Step 12: allowlistを縮小する**

Appのnavigation/routing/Worker/snapshot依存を削除し、architecture checkerでNavigation applicationがbrowser APIをimportしないことを確認する。

- [ ] **Step 13: focused testを実行する**

```bash
npx vitest run --root . tests/navigation-use-cases.test.ts \
  tests/navigation-controller-integration.test.ts \
  tests/navigation-orchestration.test.ts tests/navigation-recovery.test.ts \
  tests/navigation-runtime-controller.test.ts tests/alns-worker.test.ts \
  tests/distance-matrix-controller.test.ts
```

- [ ] **Step 14: E2Eとregressionを実行する**

```bash
node scripts/check-webapp-architecture.mjs
npm run test:webapp
npm run check:webapp
npm run build:webapp
npx playwright test tests/e2e/navigation-resume.spec.ts \
  tests/e2e/navigation-mobile.spec.ts tests/e2e/navigation-keyboard.spec.ts
git diff --check
```

- [ ] **Step 15: commit**

```bash
git add apps/webapp/js/features/navigation apps/webapp/js/app.js \
  apps/webapp/js/app/composition-root.ts apps/webapp/js/config.js \
  apps/webapp/js/navigation apps/webapp/js/routing \
  apps/webapp/js/state/navigation-state.ts \
  apps/webapp/js/state/navigation-snapshot-repository.ts \
  apps/webapp/js/route-planner.ts tests \
  scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(navigation): move runtime flow behind use cases"
```

## Acceptance Criteria

- production Appがnavigation algorithm、route asset fetch、Worker、snapshotをimportしない。
- Navigation applicationがbrowser APIを直接利用しない。
- current target、selection、route、Worker generationのmutable正本がNavigation Sessionに一つだけある。
- current leg固定、warm start、cancel、stale response、resume semanticsが維持される。
- production navigationがlegacy `TspSolver`へfallbackしない。
