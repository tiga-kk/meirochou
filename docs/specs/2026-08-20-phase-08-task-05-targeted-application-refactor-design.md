# Phase 8 Task 5: Targeted Application Refactor Design

## Goal

Phase 8 Task 1〜4でevent/map data contractの汎用化を完了した現在のWebappについて、ユーザー向け挙動を変えずに`apps/webapp/js/app/`の残存責務を限定的に整理する。

このTaskの目的は「Clean Architecture化をもう一度やり直す」ことではない。Phase 5Dで既に確立したfeature境界を維持しつつ、現在も`BrowserApplication`とcomposition rootに残っている、明確に切り出せる三つの責務だけを整理する。

1. `BrowserApplication`内に残るmanagement actionのDOM listener登録。
2. `BrowserApplication.updateManagementModels()`内のread-only view-model合成。
3. `assemble-comipath-application.ts`内の長いRoute Guidance dependency wiring。

Task 5では新機能、UI変更、event/map contract変更、route algorithm変更を行わない。

## Verified current state

設計時点でGitHub上のcurrent `main`を確認した。

- `tiga-kk/meirochou/main`: `9969da2cfee80b5b683772061938539b3bab659a`。
- Phase 8 Task 4 branchは`main`とidenticalで、Task 4はCLOSED。
- `docs/status/progress.md`はTask 5を次のTaskとしている。
- `apps/webapp/js/app/browser-application.ts`は約83KB。
- `apps/webapp/js/app/assemble-comipath-application.ts`は約25KB。
- `apps/webapp/js/app/bind-browser-events.ts`は約1KBで、Route Guidance / Circle Status / Settings Shellのbinderを既に合成している。
- `scripts/check-webapp-architecture.mjs`は`browser-application.ts`を特例除外していない。
- `BrowserApplication`は既にfeature concrete infrastructureやroute planner本体を生成していない。
- Pending GAS / Local Data Deletionのrequest version / busy / errorの正本は各feature Controllerへ移管済み。
- Route Guidanceのproduction state / snapshot / optimization ownerは既存`features/route-guidance/`側へ移管済み。

したがってTask 5でPhase 5Dの大規模責務移行を再実装しない。

## Design principles

### 1. 行数削減を目的にしない

`browser-application.ts`が大きいこと自体をfailure条件にしない。責務が明確に一つの場所へ移せる場合だけ切り出す。

次は禁止する。

- 別名の巨大classへmethod群を移す。
- `ApplicationManager` / `Coordinator` / `Service`等へまとめ直す。
- file line count上限を追加する。
- source code sizeだけをacceptance criteriaにする。

### 2. 新しいframeworkを導入しない

Task 5では次を導入しない。

- DI container。
- EventBus。
- service locator。
- generic callback registry。
- plugin framework。
- generic application runtime framework。
- featureごとのfactory file群。

現在のtyped constructor injectionと1個の`BrowserApplication | null` late bindingを維持してよい。

### 3. feature ownershipを再変更しない

Task 5では既存featureのdomain/use-case/controller/infrastructureを作り直さない。

特に次を変更しない。

- Event Day transition semantics。
- Route Guidance state/snapshot/matrix/Worker semantics。
- Circle Status / Pending GAS semantics。
- Circle Data Source request lifecycle。
- Local Data Deletion request lifecycle。
- X post / sale warning semantics。
- Catalog offline cache semantics。

## Chosen design

### A. Management action event bindingを既存binder体系へ移す

現在`BrowserApplication`には次のprivate methodがある。

- `handleEventDayOpenRequest()`
- `handleEventDayRefreshRequest()`
- `handleEventDayOfflineRequest()`
- `handleEventDayEditRequest()`
- `handleEventDayDeleteRequest()`
- `bindManagementActionEvents()`

最初の5つは複数featureをまたぐapplication orchestrationであり、`BrowserApplication`に残してよい。一方、`bindManagementActionEvents()`はDOM event listenerの登録・解除だけを担当し、既存`bind-route-guidance-events.ts`等と同じbrowser binding責務である。

新規file:

```text
apps/webapp/js/app/bind-management-action-events.ts
```

interface:

```ts
export interface ManagementActionEventApplication {
  handleEventDayOpenRequest(detail: unknown): Promise<void>;
  handleEventDayRefreshRequest(detail: unknown): Promise<void>;
  handleEventDayOfflineRequest(detail: unknown): Promise<void>;
  handleEventDayEditRequest(detail: unknown): Promise<void>;
  handleEventDayDeleteRequest(detail: unknown): Promise<void>;
}

export function bindManagementActionEvents(
  application: ManagementActionEventApplication,
  document: Document,
): () => void;
```

このbinderはexactly次の5 eventだけをlistenする。

```text
event-day-open-request
event-day-refresh-request
event-day-offline-request
event-day-edit-request
event-day-delete-request
```

各listenerは`CustomEvent.detail`を対応methodへ渡すだけにする。validation、repository read/write、toast、offline cache処理はbinderへ移さない。

`bind-browser-events.ts`が4個目のbinderとしてこれを合成する。

`BrowserApplication.setupEvents()`は`bindBrowserEvents()`のstopだけを所有し、management用cleanupを別管理しない。

5 handler methodはbinderから呼べるよう`private`を外すが、behaviorは変更しない。

### B. Management read-only projectionをpure functionへ移す

現在`BrowserApplication.updateManagementModels()`は次の二種類の責務を同時に持つ。

1. feature state/repository/controllerから現在snapshotを読む。
2. そのsnapshotからsettings用view model群を組み立てる。

1はcross-feature browser/application shellの責務として残してよい。2はpure read-only transformationなので分離する。

新規file:

```text
apps/webapp/js/app/browser-management-projection.ts
```

このfileはclassやmutable stateを持たない。

input:

```ts
export interface BrowserManagementProjectionInput {
  readonly registry: EventRegistry;
  readonly states: readonly {
    readonly ref: EventDayRef;
    readonly state: LocalEventDayState;
  }[];
  readonly activeRef: EventDayRef | null;
  readonly activeState: LocalEventDayState | null;
  readonly sourceDraft: SourceManagerPanelModelInput["sourceDraft"];
  readonly transitionBusy: boolean;
  readonly sourceErrorMessage: string;
  readonly pendingGasState: {
    readonly busy: boolean;
    readonly resultMessage: string;
    readonly errorMessage: string;
  };
  readonly deletionState: {
    readonly selectedScope: LocalDataDeletionScope | null;
    readonly busy: boolean;
    readonly errorMessage: string;
  };
  readonly eventDayCount: number;
  readonly managementRows: readonly EventDayManagementRow[];
}
```

output:

```ts
export interface BrowserManagementProjection {
  readonly eventDayOptions: ReturnType<typeof buildEventDayOptions>;
  readonly eventDayManagementRows: readonly EventDayManagementRow[];
  readonly selectedEventId: string;
  readonly selectedDayId: string;
  readonly sourceManagerModel: ReturnType<typeof buildSourceManagerPanelModel>;
  readonly outboxPanelModel: ReturnType<typeof buildOutboxPanelModel>;
  readonly deleteOptions: ReturnType<typeof buildDeleteOptions>;
  readonly deleteDialogModel: ReturnType<typeof buildStorageDeleteDialogModel>;
}

export function buildBrowserManagementProjection(
  input: BrowserManagementProjectionInput,
): BrowserManagementProjection;
```

このpure functionへ次を移す。

- registry eventから`activeRefLabel`を作る処理。
- `buildEventDayOptions()`。
- `buildSourceManagerPanelModel()`。
- `buildOutboxPanelModel()`。
- selected / total pending count計算。
- `buildDeleteOptions()`。
- `LocalDataDeletionScope`からUI `DeleteScope`へのpure mapping。
- `buildStorageDeleteDialogModel()`。
- selected event/day IDのprojection。

次は移さない。

- `eventDayRepository.listEventDays()` / `load()`。
- `circleDataSourceSession.getSnapshot()`。
- `pendingGasUpdatesController.getViewState()`。
- `localDataDeletionController.getViewState()` / `getSelectedScope()`。
- `ui.updateSettingsState()`。
- `managementUpdateToken`。
- async `buildEventDayManagementRows()`のstale-result gate。

理由: repository/controllerをpure projectionへ渡すと新しいapplication facadeになるため。

`BrowserApplication.updateManagementModels()`はfeature snapshotを一度ずつ取得し、`buildBrowserManagementProjection()`へplain dataを渡し、返値を`ui.updateSettingsState()`へ渡す。async management row更新は現在と同じ順序を維持する。

重要: 現在はsync modelを即時renderし、その後async offline rowが解決した時だけrowsを更新する。このタイミングを変更しない。`Promise.all`等でsync renderを遅らせない。

### C. Route Guidance wiringをcomposition root内の1個の名前付きunitにまとめる

現在`assemble-comipath-application.ts`にはRoute Guidanceの具体的なdependency assemblyが約100行連続している。これはcomposition rootとして正しい責務だが、他feature assemblyとの境界が読み取りにくい。

新しいfactory module群は作らない。**同じ`assemble-comipath-application.ts`内**にprivate top-level functionを1個だけ追加する。

```ts
interface RouteGuidanceAssembly {
  readonly routeGuidanceSession: ReturnType<typeof createRouteGuidanceSession>;
  readonly routeMapAreaCatalog: MapAreaCatalog;
  readonly routeMapAssetsLoader: HttpRouteMapAssetsLoader;
  readonly navigationRuntimeController: RouteGuidanceRuntimeController;
  readonly routeGuidanceController: RouteGuidanceController;
}

function assembleRouteGuidance(
  options: {
    readonly createAlnsWorker?: () => Worker;
    readonly getBrowserRuntime: () => BrowserApplication | null;
  },
): RouteGuidanceAssembly;
```

このfunctionの内部へ現在の次だけを機械的に移す。

- `createRouteGuidanceSession()`。
- runtime map-area catalog adapter。
- `HttpRouteMapAssetsLoader`。
- snapshot / matrix repository。
- `DistanceMatrixController`。
- `RouteGuidanceNavigationOperations`。
- `RouteGuidanceRuntimeController`。
- optimization feedback。
- `RouteGuidanceController`と既存use cases。

外部へ返すのは現在BrowserApplicationと他cross-feature cleanupが実際に使う5 objectだけ。

このfunctionはexportしない。`route-guidance-assembly.ts`等の新規fileを作らない。Task 5でCircle Status / Event Day / X Post等のsub-assembly functionを追加しない。

`getBrowserRuntime()` callbackは既存のtyped late bindingをそのまま表すために使用する。EventBusへ置き換えない。

### D. Application testはprivate implementationへさらに結合させない

既存`tests/application-assembly.test.ts`にはRoute Guidance wiringを確認するtestがある。Task 5ではこれを削除・弱化しない。

新しいassembly functionをtestのためだけにexportしない。production public APIを拡張しない。

既存testがrefactor後も同じBrowserApplication injectionを観測できることを利用する。

必要なtest調整は型・構造変更に限定し、route behavior assertionを減らさない。

## File scope

### Create

```text
apps/webapp/js/app/bind-management-action-events.ts
tests/bind-management-action-events.test.ts
apps/webapp/js/app/browser-management-projection.ts
tests/browser-management-projection.test.ts
```

### Modify

```text
apps/webapp/js/app/bind-browser-events.ts
apps/webapp/js/app/browser-application.ts
apps/webapp/js/app/assemble-comipath-application.ts
tests/application-assembly.test.ts        # only if typing/characterization adjustment is actually needed
tests/browser-event-bindings.test.ts     # only if listener-count expectations require update
docs/status/progress.md                  # after verification only
```

### Do not modify

```text
apps/webapp/js/features/**
apps/webapp/js/components/**
apps/webapp/js/shared/**
apps/webapp/events/**
apps/webapp/map-bundles/**
vite.config.ts
package.json
package-lock.json
integrations/**
functions/**
.github/workflows/**
tests/e2e/**
```

`tests/apps-behavior-characterization.test.ts`はfocused regressionとして実行するが、原則変更しない。既存behaviorが本当に誤っていることをTask 5中に発見した場合は勝手に修正せずbrowser reviewへ戻す。

## Behavior invariants

Task 5はrefactorなので次を変えない。

- app start/stop idempotence。
- event/day open / refresh / offline / edit / delete event semantics。
- management action event名と`CustomEvent.detail` contract。
- settings close/open behavior。
- source refresh behavior。
- catalog offline progress表示。
- Pending GAS retry/discard behavior。
- Local Data Deletion behavior。
- active event/day selection/transition behavior。
- route start/resume/destination/finish/optimization behavior。
- ALNS Worker creation timing。
- dev demo behavior。
- X post / sale warning behavior。
- current C108 production data。
- Task 4 C999 test fixture semantics。

## Alternatives rejected

### 1. BrowserApplicationを複数classへ分割

`ManagementApplication`, `RouteApplication`, `SettingsCoordinator`等へmethodを移すだけだとFacadeを増やす。state ownerも曖昧になるため不採用。

### 2. DI container / EventBusを導入

現在の依存関係はtyped constructor injectionとcomposition rootで追跡できる。循環callbackを消すためだけのframework導入は過剰。

### 3. 全feature assemblyをfactory fileへ分割

composition rootから具体的wiringが見えなくなり、Phase 5Dの設計原則に反する。Task 5ではRoute Guidanceの長い一塊だけを同一file内の1 functionへまとめる。

### 4. browser-application.tsの行数上限を設定

責務境界の品質を行数で代理評価することになるため不採用。

### 5. management view modelを既存`shared/ui/management-view-model.ts`へさらに集約

同fileは既に各個別builderを所有している。application固有の「複数builderをどう組み合わせるか」までsharedへ押し込むとshared moduleがapplication compositionを知るため不採用。

## Verification

### Focused binder/projection

```bash
npx vitest run --root . \
  tests/bind-management-action-events.test.ts \
  tests/browser-management-projection.test.ts \
  tests/browser-event-bindings.test.ts \
  tests/event-day-management-actions.test.ts \
  tests/management-view-model.test.ts \
  tests/event-day-management-view-model.test.ts
```

### Focused application/assembly behavior

```bash
npx vitest run --root . \
  tests/application-assembly.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/comipath-application.test.ts
```

### Architecture/type/build/full unit

```bash
npm run verify
```

### Full browser regression

Task 5はproduction event bindingとcomposition rootを変更するため、Task 4と異なりfull CI-equivalent E2Eをcompletion gateにする。

```bash
npm run test:e2e:ci
```

visual snapshotをfailure回避のために更新しない。failureが出た場合はbaselineとheadを比較し、Task 5 regressionか既存flakyかを証拠付きで分類する。

### Scope audit

```bash
git diff --check
git diff --name-status TASK_START_SHA..HEAD
git diff --name-only TASK_START_SHA..HEAD -- \
  apps/webapp/js/features \
  apps/webapp/js/components \
  apps/webapp/js/shared \
  apps/webapp/events \
  apps/webapp/map-bundles \
  vite.config.ts package.json package-lock.json integrations functions .github/workflows tests/e2e
```

protected path diffはemptyでなければならない。

また新しいarchitecture frameworkを導入していないことを確認する。

```bash
git grep -nE 'EventBus|DIContainer|DependencyContainer|ServiceLocator|ApplicationManager|ApplicationCoordinator' -- apps/webapp/js/app || true
```

既存コード由来でない新規matchがあればTask 5 scopeを再評価する。

## Acceptance

Task 5は次をすべて満たした時だけbrowser-side reviewへ進める。

1. management action DOM listener登録が`bind-management-action-events.ts`へ移り、5 eventの登録・cleanupがfocused testで証明される。
2. `BrowserApplication`にはmanagement actionのcross-feature handlerは残るが、listener登録loopは残らない。
3. management sync view-model合成が`buildBrowserManagementProjection()`へ移る。
4. projectionはpure functionでrepository/controller/DOM/mutable stateを所有しない。
5. `updateManagementModels()`のsync render → async rows更新順序が維持される。
6. Route Guidance wiringは`assemble-comipath-application.ts`内の1個の`assembleRouteGuidance()`へまとまり、別factory module群は増えない。
7. Route Guidance feature implementation/semanticsは変更されない。
8. DI container / EventBus / generic frameworkを導入しない。
9. user-facing behavior、event/map contract、storage schema、route algorithmを変更しない。
10. focused binder/projection/application testsがgreen。
11. `npm run verify`がgreen。
12. `npm run test:e2e:ci`がgreen、または既知flakyがbaseline比較で明確に証明される。Task 5起因failureをretry/skip/snapshot updateで隠さない。
13. protected production pathsにscope外diffがない。
14. progressは「Task 5 implementation complete / browser review pending」とし、browser acceptance前にCLOSEDにしない。
15. Task 6 onboardingとTask 7 operator docsを開始していない。
