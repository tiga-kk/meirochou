# Phase 5D Task 7: Event Day and Storage Controllers

**Status:** PLANNED
**Depends on:** Task 6
**Commit candidate:** `refactor(management): extract event and storage workflows`

## Goal

event/day open・switch・rollback、settings lifecycle、delete option、circles/activity/event-day/all-events削除をEvent DayとStorage Management featureへ移す。

## Files

### Create

- `apps/webapp/js/features/event-day/application/open-event-day.ts`
- `apps/webapp/js/features/event-day/application/switch-event-day.ts`
- `apps/webapp/js/features/event-day/application/event-day-controller-contract.ts`
- `apps/webapp/js/features/event-day/presentation/event-day-controller.ts`
- `apps/webapp/js/features/event-day/presentation/event-day-view-model.ts`
- `apps/webapp/js/features/storage-management/domain/delete-scope.ts`
- `apps/webapp/js/features/storage-management/application/delete-local-data.ts`
- `apps/webapp/js/features/storage-management/presentation/storage-management-controller.ts`
- `apps/webapp/js/features/storage-management/presentation/storage-management-view-model.ts`
- `apps/webapp/js/features/storage-management/index.ts`
- `tests/event-day-controller.test.ts`
- `tests/storage-management-controller.test.ts`

### Move

- `apps/webapp/js/state/event-day-transition-service.ts` → `apps/webapp/js/features/event-day/application/event-day-transition-service.ts`
- `apps/webapp/js/state/storage-deletion-service.ts` → `apps/webapp/js/features/storage-management/application/storage-deletion-service.ts`
- `apps/webapp/js/data/event-registry.ts` → `apps/webapp/js/features/event-day/infrastructure/event-registry-loader.ts`
- `apps/webapp/js/map-manifest-loader.ts` → `apps/webapp/js/features/event-day/infrastructure/map-manifest-loader.ts`

### Modify

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/app/composition-root.ts`
- `apps/webapp/js/config.js`
- event-day/storage/settings tests
- `scripts/webapp-architecture-legacy-allowlist.json`

## Interfaces

```ts
export interface EventDayController {
  initialize(initialRef?: EventDayRef): Promise<void>;
  select(detail: unknown): Promise<void>;
  dispose(): void;
}

export interface StorageManagementController {
  selectDeleteScope(detail: unknown): void;
  confirmDelete(detail: unknown): Promise<void>;
  cancelDelete(): void;
  dispose(): void;
}
```

```ts
export interface EventDayTransitionHooks {
  beforeSwitch(ref: EventDayRef): Promise<void>;
  afterSwitch(ref: EventDayRef): Promise<void>;
  onSwitchFailure(ref: EventDayRef, error: unknown): void;
}
```

HooksはSource preview cancel、Navigation snapshot save/reset、View refreshをfeature public contractで接続する。Controller間でconcrete classを参照しない。

## TDD Procedure

- [ ] **Step 1: Event Day ControllerのRED testを書く**

registry外ref拒否、二重transition拒否、prepare失敗時の旧表示維持、commit後のsession activate、focus returnを検証する。

- [ ] **Step 2: Storage ControllerのRED testを書く**

confirmation text、pending outbox保護、activity削除時matrix保持、event-day/all-events削除時matrix/snapshot削除、active ref再選択を検証する。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/event-day-controller.test.ts \
  tests/storage-management-controller.test.ts
```

- [ ] **Step 4: existing serviceをfeatureへmoveする**

transitionのprepare/commit atomicity、deletion boundary、error classを変更しない。

- [ ] **Step 5: Event Day Controllerを実装する**

ActiveEventDaySession、registry loader、transition service、hooks、Viewを注入する。Config area replacementはinfrastructure resultをControllerがView/Map公開contractへ渡す形にする。

- [ ] **Step 6: Storage Management Controllerを実装する**

delete scope parser、delete options view model、busy/error、active event/day fallbackを移す。Navigation concrete repositoryを直接importせず、`NavigationStorageInvalidation` public contractを使う。

- [ ] **Step 7: settings lifecycleをControllerへ分配する**

settings open/close、Escape、preview cancel、delete dialogは対応feature controllerへ通知する。Appにfeature-specific state resetを残さない。

- [ ] **Step 8: production event bindingを切り替える**

`event-day-select`、`delete-option-select`、`storage-delete-request`、`storage-delete-cancel`を各Controllerへ接続する。

- [ ] **Step 9: DataManager compatibility methodを委譲する**

open、activate、transition service、storage deleteのproduction callerを0にする。

- [ ] **Step 10: allowlistを縮小する**

App/DataManagerのregistry、manifest、transition、storage deletion依存を削除する。

- [ ] **Step 11: focused testを実行する**

```bash
npx vitest run --root . tests/event-day-controller.test.ts \
  tests/storage-management-controller.test.ts \
  tests/event-day-transition-service.test.ts tests/event-day-selector.test.ts \
  tests/event-registry.test.ts tests/storage-deletion-service.test.ts \
  tests/storage-deletion-app.test.ts tests/storage-delete-dialog.test.ts
```

- [ ] **Step 12: regressionを実行する**

```bash
node scripts/check-webapp-architecture.mjs
npm run test:webapp
npm run check:webapp
npm run build:webapp
npx playwright test tests/e2e/navigation-resume.spec.ts \
  tests/e2e/navigation-keyboard.spec.ts
git diff --check
```

- [ ] **Step 13: commit**

```bash
git add apps/webapp/js/features/event-day \
  apps/webapp/js/features/storage-management apps/webapp/js/app.js \
  apps/webapp/js/data-manager.ts apps/webapp/js/app/composition-root.ts \
  apps/webapp/js/config.js apps/webapp/js/data \
  apps/webapp/js/map-manifest-loader.ts tests \
  scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(management): extract event and storage workflows"
```

## Acceptance Criteria

- Appがevent/day transitionとdelete business flowを持たない。
- prepare/commit rollback、active state、focus、busy stateが維持される。
- deletionによるsnapshot/matrix保持境界が変わらない。
- Controller間連携がpublic contract経由である。
- registry/map manifest loaderがapplication/domainへbrowser detailを漏らさない。
