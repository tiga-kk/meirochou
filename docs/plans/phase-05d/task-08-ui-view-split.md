# Phase 5D Task 8: UI View Split

**Status:** PLANNED
**Depends on:** Task 7
**Commit candidate:** `refactor(ui): split feature views`

## Goal

`UIManager`が保持するDOM lookup、navigation、location、management、statistics、toast、map、modal責務をfeature Viewへ分割する。見た目とDOM idは原則変更しない。

## Files

### Create

- `apps/webapp/js/features/navigation/presentation/navigation-view.ts`
- `apps/webapp/js/features/navigation/presentation/location-input-view.ts`
- `apps/webapp/js/features/source-management/presentation/source-management-view.ts`
- `apps/webapp/js/features/event-day/presentation/event-day-view.ts`
- `apps/webapp/js/features/storage-management/presentation/storage-management-view.ts`
- `apps/webapp/js/shared/presentation/toast-view.ts`
- `apps/webapp/js/shared/presentation/index.ts`
- `tests/feature-views.test.ts`

### Move

- `apps/webapp/js/map-renderer.js` → `apps/webapp/js/shared/presentation/map-view.ts`
- `apps/webapp/js/stats-renderer.js` → `apps/webapp/js/shared/presentation/statistics-view.ts`
- `apps/webapp/js/modal-manager.js` → `apps/webapp/js/shared/presentation/modal-view.ts`
- `apps/webapp/js/ui/navigation-view-model.ts` → `apps/webapp/js/features/navigation/presentation/navigation-view-model.ts`

### Modify

- `apps/webapp/js/ui-manager.js`
- `apps/webapp/js/app/composition-root.ts`
- `apps/webapp/js/components/*.ts`
- relevant UI/unit/E2E tests
- `scripts/webapp-architecture-legacy-allowlist.json`

## Interfaces

```ts
export interface NavigationView {
  readLocation(): CurrentLocationInput | null;
  showLoading(): void;
  render(model: NavigationViewModel): void;
  showResume(model: ResumeDialogViewModel): void;
  closeResume(): void;
}
```

```ts
export interface SourceManagementView {
  render(model: SourceManagementViewModel): void;
  showPreview(model: SourceDiffViewModel): void;
  closePreview(): void;
}
```

```ts
export interface ToastView {
  show(message: string, tone?: "info" | "warning" | "error"): void;
}
```

Viewは対応DOM rootをconstructorで受け取る。global `document.getElementById`を各render callで繰り返さない。

## TDD Procedure

- [ ] **Step 1: View contractのRED testを書く**

happy-dom上でexisting DOM fixtureを使い、navigation/loading/complete/comparison、settings busy/error、statistics、toast、map renderingを固定する。

- [ ] **Step 2: listener ownership testを書く**

ViewまたはControllerがbindしたlistenerは`dispose()`後に解除され、再initで二重登録されないことを検証する。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/feature-views.test.ts
```

- [ ] **Step 4: rendering methodをUIManagerからViewへ移す**

methodごとに対応Viewへ移し、UIManagerから新Viewへ委譲する。DOM id、class、aria text、focus behaviorを変更しない。

- [ ] **Step 5: map/statistics/modal implementationをmoveする**

既存gesture、pin、route overlay、gallery、hold reset、modal callbackの意味を維持する。TypeScript strictへ変換し、`any`を追加しない。

- [ ] **Step 6: composition rootでViewを生成する**

各Viewは必要なroot elementだけを受け取る。Controllerへ対応Viewを注入する。feature ControllerがUIManagerを受け取らない状態にする。

- [ ] **Step 7: component boundaryを整理する**

Lit componentはmodel propertyとcustom eventだけでController/Viewへ接続する。repositoryやfeature infrastructure importがないことをcheckerで検証する。

- [ ] **Step 8: UIManager compatibility methodを削減する**

production callerが0になったmethodを削除する。Task終了時点でUIManagerは未移行legacy modalまたはdev demo adapterだけに限定する。

- [ ] **Step 9: allowlistを縮小する**

UIManager、MapRenderer、StatsRenderer、ModalManagerに関する違反を削除する。

- [ ] **Step 10: focused testを実行する**

```bash
npx vitest run --root . tests/feature-views.test.ts \
  tests/route-overlay-contract.test.ts tests/settings-component.test.ts \
  tests/source-manager.test.ts tests/source-diff-dialog.test.ts \
  tests/storage-delete-dialog.test.ts
```

- [ ] **Step 11: E2Eとregressionを実行する**

```bash
node scripts/check-webapp-architecture.mjs
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run test:e2e
git diff --check
```

visual snapshot差分が出た場合は、意図しない見た目変更としてTaskを完了扱いにしない。

- [ ] **Step 12: commit**

```bash
git add apps/webapp/js/features apps/webapp/js/shared/presentation \
  apps/webapp/js/ui-manager.js apps/webapp/js/map-renderer.js \
  apps/webapp/js/stats-renderer.js apps/webapp/js/modal-manager.js \
  apps/webapp/js/components tests \
  scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(ui): split feature views"
```

## Acceptance Criteria

- production ControllerがUIManagerを受け取らない。
- UIManagerにnavigation、settings、statistics、toast、map business renderingが残らない。
- Viewはrepository、GAS、Worker、storage keyを知らない。
- DOM id、aria、44px target、200% zoom、safe-area、keyboard focusが維持される。
- full E2Eで意図しないvisual差分がない。
