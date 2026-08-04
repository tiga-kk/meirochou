# Phase 5D Task 7: Extract Event/Day Switching and Local Data Deletion

**Status:** IMPLEMENTED
**Depends on:** Task 6
**Commit candidate:** `refactor(event-day): extract switching and local data deletion`

## Goal

initial event/day open、event/day switch、map manifest replacement、settings lifecycle、circles/activity/event-day/all-events deletionをEvent DayとLocal Data Deletion featuresへ移す。last `Config` callerを置換して`config.ts`を削除する。

## Corrected source path

modify/delete対象は`apps/webapp/js/config.ts`である。`config.js`を計画へ記載しない。

## Files

### Create

- `apps/webapp/js/features/event-day/use-cases/open-initial-event-day.ts`
- `apps/webapp/js/features/event-day/use-cases/switch-event-day.ts`
- `apps/webapp/js/features/event-day/use-cases/load-event-registry.ts`
- `apps/webapp/js/features/event-day/use-cases/load-map-manifest.ts`
- `apps/webapp/js/features/event-day/ui/event-day-selector-controller.ts`
- `apps/webapp/js/features/event-day/ui/event-day-selector-view.ts`
- `apps/webapp/js/features/event-day/ui/event-day-selector-model.ts`
- `apps/webapp/js/features/local-data-deletion/domain/local-data-deletion-types.ts`
- `apps/webapp/js/features/local-data-deletion/use-cases/delete-local-data.ts`
- `apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-controller.ts`
- `apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-view.ts`
- `apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-dialog-model.ts`
- `apps/webapp/js/features/local-data-deletion/public-api.ts`
- `tests/event-day-selector-controller.test.ts`
- `tests/delete-local-data.test.ts`
- `tests/local-data-deletion-controller.test.ts`

### Move and rename

- `apps/webapp/js/data/event-registry.ts`
  → `apps/webapp/js/features/event-day/infrastructure/http-event-registry-loader.ts`
- `apps/webapp/js/map-manifest-loader.ts`
  → `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`

### Refactor and delete old implementation

- `apps/webapp/js/state/event-day-transition-service.ts`
  - prepare/commit/rollbackを`SwitchEventDay`へ移す
  - old generic service fileを削除
- `apps/webapp/js/state/storage-deletion-service.ts`
  - deletion scopeごとの処理を`DeleteLocalData`へ移す
  - old generic service fileを削除
- `apps/webapp/js/ui/management-view-model.ts`
  - remaining event-day option/delete option modelをnew model filesへ移す
  - old fileを削除
- `apps/webapp/js/ui/management-events.ts`
  - remaining event-day/delete eventsをfeature UIへ移す
  - old fileを削除
- `apps/webapp/js/config.ts`
  - `AREAS` read/writeをTask 5の`MapAreaCatalog`へ移す
  - legacy storage keysを対応するLocalStorage infrastructureへ移す
  - old fileを削除

### Modify

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/components/event-day-selector.ts`
- `apps/webapp/js/components/storage-delete-dialog.ts`
- `apps/webapp/js/components/comipath-settings.ts`
- `tests/event-day-transition-service.test.ts`
- `tests/event-day-selector.test.ts`
- `tests/event-registry.test.ts`
- `tests/storage-deletion-service.test.ts`
- `tests/storage-deletion-app.test.ts`
- `tests/storage-delete-dialog.test.ts`
- `scripts/webapp-architecture-legacy-allowlist.json`

## Preflight

```bash
test -e apps/webapp/js/config.ts
test ! -e apps/webapp/js/config.js
test -e apps/webapp/js/state/event-day-transition-service.ts
test -e apps/webapp/js/state/storage-deletion-service.ts
test -e apps/webapp/js/data/event-registry.ts
test -e apps/webapp/js/map-manifest-loader.ts
test -e apps/webapp/js/ui/management-view-model.ts
test -e apps/webapp/js/ui/management-events.ts
test ! -e apps/webapp/js/features/local-data-deletion/use-cases/delete-local-data.ts
```

## Interfaces

```ts
export interface EventDaySelectorController {
  openInitialEventDay(initialEventDay?: EventDayRef): Promise<void>;
  selectEventDay(detail: unknown): Promise<void>;
  stop(): void;
}
```

```ts
export interface EventDaySwitchCollaborators {
  beforeEventDaySwitch(currentEventDay: EventDayRef): Promise<void>;
  afterEventDaySwitch(newEventDay: EventDayRef): Promise<void>;
  onEventDaySwitchFailure(
    requestedEventDay: EventDayRef,
    error: unknown,
  ): void;
}
```

collaboratorsはCircle Data Source preview cancel、Route Guidance snapshot save/reset、Views refreshをfeature public API経由で接続する。

```ts
export type LocalDataDeletionScope =
  | { readonly kind: "circle-source"; readonly eventDay: EventDayRef }
  | { readonly kind: "activity"; readonly eventDay: EventDayRef }
  | { readonly kind: "event-day"; readonly eventDay: EventDayRef }
  | { readonly kind: "all-event-days" };

export interface LocalDataDeletionController {
  selectDeletionScope(detail: unknown): void;
  confirmDeletion(detail: unknown): Promise<void>;
  cancelDeletion(): void;
  stop(): void;
}
```

```ts
export interface RouteGuidanceStorageCleanup {
  deleteActivitySnapshot(eventDay: EventDayRef): void;
  deleteAllRouteData(eventDay: EventDayRef): void;
}
```

activity deletionはdistance matrixを保持し、circle source/event-day/all-events deletionはexisting contractどおり削除する。

## TDD procedure

- [ ] **Step 1: Event Day Selector ControllerのRED testを書く**

registry外ref拒否、same ref no-op、concurrent switch拒否、prepare失敗時old state維持、commit後session update、focus returnを検証する。

- [ ] **Step 2: initial openのRED testを書く**

last opened validation、registry default fallback、empty registry fatal error、existing state/load migrationを検証する。

- [ ] **Step 3: DeleteLocalDataのRED testを書く**

four scopes、confirmation text、pending GAS update block、strict deletion preflight、rollback、active event/day fallbackを検証する。

- [ ] **Step 4: route data cleanup boundaryのRED testを書く**

- activity: snapshot delete、distance matrix keep
- circle source: snapshot and matrix delete
- event-day/all-event-days: snapshot and matrix delete

- [ ] **Step 5: ControllerのRED testを書く**

unknown detail parser、dialog model、busy/error、cancel、focus return、stopをfake Viewで検証する。

- [ ] **Step 6: REDを確認する**

```bash
npx vitest run --root . tests/event-day-selector-controller.test.ts \
  tests/delete-local-data.test.ts \
  tests/local-data-deletion-controller.test.ts
```

- [ ] **Step 7: loadersを明確なconcrete classへmoveする**

event registryとmap manifestのHTTP/runtime parser behaviorを変えない。Use CaseはURL resolutionまたは`fetch`を直接行わない。

- [ ] **Step 8: transition serviceをUse Caseへ置換する**

prepare、commit、rollbackを`SwitchEventDay`へ移し、generic service classを残さない。active session updateはdurable commit成功後だけ行う。

- [ ] **Step 9: deletion serviceをUse Caseへ置換する**

deletion scopeごとの依存をconstructorで明示し、`StorageDeletionService`のような広い名前を残さない。

- [ ] **Step 10: MapAreaCatalogへlast writerを移す**

event/day switch後にvalidated map areasを`MapAreaCatalog.replaceMapAreas()`へ渡す。UI/route codeが`Config.AREAS`を読まないことを確認する。

- [ ] **Step 11: legacy storage keysをownerへ移す**

`Config.STORAGE_KEYS`の各keyを使用するLocalStorage infrastructure fileへprivate constantとして移す。feature外へexportしない。

- [ ] **Step 12: `config.ts`を削除する**

```bash
rg 'Config|config\.(js|ts)' apps/webapp/js tests
```

remaining production/test callerを0にしてから削除する。`NewConfig`、`AppConfigManager`のような置換classを作らない。

- [ ] **Step 13: generic management model/event filesを削除する**

event-day/delete responsibilitiesをnew filesへ移し、Task 4/6ですでに移したresponsibilitiesが戻っていないことを確認してold filesを削除する。

- [ ] **Step 14: Controllersをproduction eventsへ接続する**

event-day select、delete scope select、delete confirm/cancel、settings open/close/Escapeを対応Controller/Viewへ接続する。legacy Appにfeature-specific reset branchを残さない。

- [ ] **Step 15: DataManager compatibility methodsをdelegationへ変更する**

open、switch、deleteのproduction callerを0にする。legacy testsだけが使うmethodはTask 9までnew Use Caseへ委譲する。

- [ ] **Step 16: allowlistを縮小する**

registry、manifest、transition、deletion、Config、generic management filesに関するviolationsを削除する。

- [ ] **Step 17: focused verificationを実行する**

```bash
npx vitest run --root . tests/event-day-selector-controller.test.ts \
  tests/delete-local-data.test.ts \
  tests/local-data-deletion-controller.test.ts \
  tests/event-day-transition-service.test.ts \
  tests/event-day-selector.test.ts tests/event-registry.test.ts \
  tests/storage-deletion-service.test.ts \
  tests/storage-deletion-app.test.ts \
  tests/storage-delete-dialog.test.ts
node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 18: regressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npx playwright test tests/e2e/navigation-resume.spec.ts \
  tests/e2e/navigation-keyboard.spec.ts
git diff --check
```

- [ ] **Step 19: commit**

```bash
git add -A apps/webapp/js/features/event-day \
  apps/webapp/js/features/local-data-deletion \
  apps/webapp/js/state/event-day-transition-service.ts \
  apps/webapp/js/state/storage-deletion-service.ts \
  apps/webapp/js/data/event-registry.ts \
  apps/webapp/js/map-manifest-loader.ts apps/webapp/js/config.ts \
  apps/webapp/js/ui/management-view-model.ts \
  apps/webapp/js/ui/management-events.ts \
  apps/webapp/js/app.js apps/webapp/js/data-manager.ts \
  apps/webapp/js/app apps/webapp/js/components tests \
  scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(event-day): extract switching and local data deletion"
```

## Acceptance criteria

実装結果: Event Day switch/deleteのfeature Use Case化、Configと旧generic serviceの削除、MapAreaCatalogへの移行、shared UI model/event移動を完了。`npm run test:webapp` (65 files / 481 tests)、architecture/typecheck、build、E2E (38 passed / 8 skipped) を確認済み。

- modify/delete対象が`config.ts`である。
- `config.ts`、generic management model/event filesが存在しない。
- Appがevent/day switchとdeletion business flowを持たない。
- prepare/commit/rollback、focus、busy、error semanticsが維持される。
- deletionによるsnapshot/matrix保持境界が変わらない。
- cross-feature collaborationがpublic API経由である。
