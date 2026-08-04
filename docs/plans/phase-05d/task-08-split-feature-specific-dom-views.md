# Phase 5D Task 8: Split Feature-Specific DOM Views

**Status:** IMPLEMENTED
**Depends on:** Task 7
**Commit candidate:** `refactor(ui): split feature specific dom views`

## Goal

`UIManager`、`MapRenderer`、`StatsRenderer`、`ModalManager`、`ui/navigation-view-model.ts`へ集まったDOM lookup、rendering、map layout、gallery、dialog、notification責務をfeature-specific DOM Viewsと小さなpure UI modulesへ分割する。見た目、DOM ID、ARIA、focus behaviorを変えない。

## Files

### Create

- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-current-location-form-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/features/route-guidance/ui/parse-current-location-form.ts`
- `apps/webapp/js/features/circle-data-source/ui/dom-circle-data-source-view.ts`
- `apps/webapp/js/features/event-day/ui/dom-event-day-selector-view.ts`
- `apps/webapp/js/features/local-data-deletion/ui/dom-local-data-deletion-view.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-progress-view.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/shared/ui/dom-user-notification-view.ts`
- `apps/webapp/js/shared/ui/dom-map-image-dialog-view.ts`
- `apps/webapp/js/shared/ui/contained-image-layout.ts`
- `apps/webapp/js/shared/browser/parse-safe-external-url.ts`
- `tests/feature-dom-views.test.ts`
- `tests/navigation-view-model-split.test.ts`

### Refactor and delete old implementation

- `apps/webapp/js/ui/navigation-view-model.ts`
  - target/distance/next/comparison formatting
    → existing `features/route-guidance/ui/route-guidance-screen-model.ts`
  - `buildSpaceFromLocation`
    → `features/route-guidance/ui/parse-current-location-form.ts`
  - map pin construction
    → `features/route-guidance/ui/route-map-pin-model.ts`
  - contained image size/scale calculation
    → `shared/ui/contained-image-layout.ts`
  - safe external URL parsing
    → `shared/browser/parse-safe-external-url.ts`
  - dev nearest-neighbor dependencyを削除
  - old fileを削除
- `apps/webapp/js/map-renderer.js`
  - route map rendering
    → `DomRouteMapView`
  - old fileを削除
- `apps/webapp/js/stats-renderer.js`
  - circle progress table
    → `DomCircleProgressView`
  - gallery open/hold reset callbackはfeature public actionへ変更
  - old fileを削除
- `apps/webapp/js/modal-manager.js`
  - circle gallery
    → `DomCircleGalleryView`
  - map image dialog
    → `DomMapImageDialogView`
  - old fileを削除
- `apps/webapp/js/ui-manager.js`
  - methodをcorresponding DOM Viewsへ移す
  - Task終了時はunmigrated compatibility delegationだけを残す
  - Task 9でfile自体を削除

### Modify

- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app.js`
- `apps/webapp/js/components/custom-select.js`
- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/js/components/event-day-selector.ts`
- `apps/webapp/js/components/source-manager.ts`
- `apps/webapp/js/components/source-diff-dialog.ts`
- `apps/webapp/js/components/outbox-panel.ts`
- `apps/webapp/js/components/storage-delete-dialog.ts`
- `apps/webapp/js/components/circle-detail-dialog.ts`
- `apps/webapp/js/components/navigation-resume-dialog.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/settings-component.test.ts`
- `tests/source-manager.test.ts`
- `tests/source-diff-dialog.test.ts`
- `tests/storage-delete-dialog.test.ts`
- `tests/e2e/navigation-mobile.spec.ts`
- `tests/e2e/navigation-keyboard.spec.ts`
- `tests/e2e/navigation-resume.spec.ts`
- `scripts/webapp-architecture-legacy-allowlist.json`

## Preflight

```bash
test -e apps/webapp/js/ui-manager.js
test -e apps/webapp/js/map-renderer.js
test -e apps/webapp/js/stats-renderer.js
test -e apps/webapp/js/modal-manager.js
test -e apps/webapp/js/ui/navigation-view-model.ts
test -e apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model.ts
test ! -e apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts
test ! -e apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts
```

`route-guidance-screen-model.ts`がTask 5で既に存在することを必須とする。同pathへのMove/Createを行わない。

## Interfaces

```ts
export interface RouteGuidanceView {
  showCalculatingRoute(): void;
  showRouteGuidance(model: RouteGuidanceScreenModel): void;
  showNoRouteGuidance(): void;
  showResumeDialog(model: ResumeRouteGuidanceDialogModel): void;
  closeResumeDialog(): void;
}
```

```ts
export interface CurrentLocationFormView {
  readCurrentLocation(): CurrentLocationFormInput;
  showCurrentLocationValidationError(message: string): void;
  updateMapAreaOptions(mapAreas: readonly MapArea[]): void;
  focusCurrentLocation(): void;
}
```

```ts
export interface RouteMapView {
  renderRouteMap(model: RouteMapScreenModel): void;
  clearRouteMap(): void;
  stop(): void;
}
```

```ts
export interface UserNotificationView {
  showNotification(
    message: string,
    severity?: "info" | "warning" | "error",
  ): void;
}
```

concrete DOM implementationはconstructorで必要なroot elementsを受け取る。render method内でglobal `document.getElementById`を繰り返さない。

## Exact old view-model split

| Old export/responsibility | Final file |
|---|---|
| `formatTargetViewModel` and route screen labels | `route-guidance-screen-model.ts` |
| `buildSpaceFromLocation` | `parse-current-location-form.ts` |
| `buildMapPins` and pin status | `route-map-pin-model.ts` |
| `calculateContainedImageBox` | `contained-image-layout.ts` |
| image scale and pin size calculations | `contained-image-layout.ts` |
| `normalizeExternalUrl` | `parse-safe-external-url.ts` |
| dev order dependency | removed from UI; Task 5 dev demo implementation only |

これによりTask 5とTask 8のtarget path重複を発生させない。

## TDD procedure

- [ ] **Step 1: DOM ViewのRED testを書く**

happy-dom fixtureで次を固定する。

- route loading、empty、current destination、selected destination、comparison
- current location input read/validation/focus
- source panel busy/error/preview
- event/day selector
- local data deletion dialog
- circle progress counts
- notification timer
- route map image、pins、route overlay
- gallery open/close/filter
- map image dialog

- [ ] **Step 2: old view-model splitのRED testを書く**

old exportsと同じinput/output behaviorをnew responsibility-specific filesで固定する。external URL、image layout、current location parseのedge casesを含める。

- [ ] **Step 3: listener ownershipのRED testを書く**

View/Controllerがbindしたlistenerは`stop()`後に解除され、再startで二重登録されないことを検証する。

- [ ] **Step 4: REDを確認する**

```bash
npx vitest run --root . tests/feature-dom-views.test.ts \
  tests/navigation-view-model-split.test.ts
```

- [ ] **Step 5: old navigation view modelをtableどおり分割する**

一つのlarge replacement fileを作らない。Task 5のscreen modelにはscreen formattingだけを追記する。

- [ ] **Step 6: MapRendererを`DomRouteMapView`へ置換する**

gesture、pin layer、route overlay、fit mode、image loading、cleanup behaviorを維持する。business state判断をViewへ追加しない。

- [ ] **Step 7: StatsRendererを`DomCircleProgressView`へ置換する**

countsは`ActiveEventDayReader`またはscreen modelから受け取り、DataManagerを参照しない。

- [ ] **Step 8: ModalManagerを二つの明確なViewへ分割する**

circle galleryとmap image dialogを別classにする。generic modal methodやmode flagで統合しない。

- [ ] **Step 9: UIManager methodをfeature Viewsへ移す**

- route guidance → `DomRouteGuidanceView`
- current location → `DomCurrentLocationFormView`
- circle data source → `DomCircleDataSourceView`
- event/day selector → `DomEventDaySelectorView`
- local data deletion → `DomLocalDataDeletionView`
- progress → `DomCircleProgressView`
- notification → `DomUserNotificationView`
- route map/gallery/dialog → corresponding Views

- [ ] **Step 10: dependency assemblyでViewsを生成する**

Controllerへ対応View interfaceを注入する。production ControllerがUIManagerを受け取らない状態にする。

- [ ] **Step 11: Lit component boundaryを確認する**

componentsはmodel propertyとcustom eventだけで接続する。Repository、GAS client、HTTP loader、Worker optimizerをimportしない。

- [ ] **Step 12: UIManagerをcompatibility delegatorへ縮小する**

production callerをnew Viewsへ切り替える。Task 8終了時にUIManagerへbusiness renderingを残さない。file削除はTask 9で行う。

- [ ] **Step 13: old renderer/model filesを削除する**

```bash
rg 'map-renderer|stats-renderer|modal-manager|ui/navigation-view-model' \
  apps/webapp/js tests
```

remaining importを0にしてから4 filesを削除する。

- [ ] **Step 14: allowlistを縮小する**

UIManager、old renderers、old view modelに関するviolationsを削除する。new concrete DOM ViewsがRepository/Client/Optimizerをimportしないことを確認する。

- [ ] **Step 15: focused verificationを実行する**

```bash
npx vitest run --root . tests/feature-dom-views.test.ts \
  tests/navigation-view-model-split.test.ts \
  tests/route-overlay-contract.test.ts \
  tests/settings-component.test.ts \
  tests/source-manager.test.ts tests/source-diff-dialog.test.ts \
  tests/storage-delete-dialog.test.ts
node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 16: E2Eとregressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run test:e2e
git diff --check
```

visual snapshot差分が出た場合は意図しない見た目変更として停止する。DOM restructuringが不可避でも、reviewerが同一表示を確認するまでsnapshotを更新しない。

- [ ] **Step 17: commit**

```bash
git add -A apps/webapp/js/features apps/webapp/js/shared \
  apps/webapp/js/ui-manager.js apps/webapp/js/map-renderer.js \
  apps/webapp/js/stats-renderer.js apps/webapp/js/modal-manager.js \
  apps/webapp/js/ui/navigation-view-model.ts \
  apps/webapp/js/app apps/webapp/js/app.js \
  apps/webapp/js/components tests \
  scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(ui): split feature specific dom views"
```

## Acceptance criteria

- Task 5/8のsame target path conflictがない。
- old navigation view modelが責務別fileへ分割される。
- production ControllerがUIManagerを受け取らない。
- UIManagerにbusiness renderingが残らない。
- old renderer/model filesが存在しない。
- DOM ViewがRepository、GAS、HTTP、Worker、storage keyを知らない。
- DOM ID、ARIA、44px target、200% zoom、safe-area、keyboard focus、visual outputが維持される。

## Implementation record

- Feature-specific DOM View and pure UI modules were added, and the legacy renderer,
  modal, stats, and navigation view-model files were removed.
- `UIManager` remains as the Task 9 compatibility boundary while its map, gallery,
  and progress responsibilities delegate to the new Views.
- Task-specific tests are registered in `test:webapp`.
- Verification: focused split tests 72/72, `npm run test:webapp`, architecture/typecheck,
  build, and full E2E (38 passed, 8 skipped).
