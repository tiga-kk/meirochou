# Phase 5D Task 9.3: Replace the DOM Coordinator and Bind Browser Events

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Implement only this Task after Task 9.2 is reviewed.

**Status:** BLOCKED BY TASK 9.2
**Depends on:** Tasks 9.1 and 9.2 reviewed
**Blocks:** Task 9.4 and Task 10 rerun
**Commit candidate:** `refactor(ui): replace dom coordinator with feature views`

## Goal

Remove `ComiPathDomCoordinator` as a cross-feature UI facade. Connect components and DOM Views to feature controllers through one explicit browser event binding module. Each View owns only its feature's DOM rendering and transient UI state.

The visible layout, element IDs, custom-event names, keyboard behavior, touch target sizes, safe-area behavior, and snapshots must remain unchanged.

## Final ownership after this Task

| UI area | Owner |
|---|---|
| event/day selector | Event Day View |
| source settings and preview | Circle Data Source View |
| circle status progress and gallery | Circle Status Views |
| current location, route target and map | Route Guidance Views |
| local deletion dialog | Local Data Deletion View |
| toast/global fatal notification | `DomUserNotificationView` |
| cross-feature browser event registration | `app/bind-browser-events.ts` |

No object may hold the DOM nodes and callbacks for all five features.

## Files

### Create

- `apps/webapp/js/app/bind-browser-events.ts`
- `apps/webapp/js/features/circle-data-source/ui/dom-circle-data-source-view.ts` if the current file is incomplete
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-controls-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-target-view.ts`
- `tests/browser-event-binding.test.ts`
- `tests/no-cross-feature-dom-coordinator.test.mjs`

Create only responsibility-specific Views. Reuse existing Views where they already own the required DOM.

### Modify

- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/comipath-application.ts`
- all feature controllers and Views
- `apps/webapp/js/shared/ui/dom-user-notification-view.ts`
- components that emit or receive management/navigation events
- `apps/webapp/js/comipath-dom-coordinator.js`
- UI tests, E2E snapshots only when byte differences are an unavoidable result of equivalent rendering
- `scripts/check-webapp-architecture.mjs`
- `tests/architecture-boundaries.test.mjs`
- `package.json`

### Delete

- `apps/webapp/js/comipath-dom-coordinator.js`

Delete it in this Task. Do not rename it again and do not create `UiFacade`, `ViewCoordinator`, or another all-DOM class.

### Forbidden

- visual redesign
- element ID or custom-event rename
- generic event bus
- controller locating DOM nodes directly outside its View/event binder contract
- one View importing two or more feature internals
- callbacks stored in a global coordinator
- snapshot update to hide behavior changes

## Preflight

```bash
git status --short --branch
test -e apps/webapp/js/comipath-dom-coordinator.js
test -e apps/webapp/js/features/circle-status/ui/dom-circle-progress-view.ts
test -e apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts
test -e apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts
test -e apps/webapp/js/features/route-guidance/ui/dom-current-location-form-view.ts
test -e apps/webapp/js/features/local-data-deletion/ui/dom-local-data-deletion-view.ts
test -e apps/webapp/js/shared/ui/dom-user-notification-view.ts
npm run verify:webapp
npm run test:e2e
```

## Required event binding shape

```ts
export interface BrowserEventBinding {
  stop(): void;
}

export function bindBrowserEvents(input: {
  readonly document: Document;
  readonly eventDay: EventDaySelectorController;
  readonly circleStatus: CircleStatusController;
  readonly pendingGasUpdates: PendingGasUpdatesController;
  readonly routeGuidance: RouteGuidanceController;
  readonly circleDataSource: CircleDataSourceController;
  readonly localDataDeletion: LocalDataDeletionController;
}): BrowserEventBinding;
```

The binder validates only event routing details. Business branches, repository calls, message formatting, route logic, and source parsing remain in feature boundaries.

## TDD procedure

- [ ] **Step 1: Write a RED test for one-time event registration and cleanup**

Create `tests/browser-event-binding.test.ts`. Bind all public events, dispatch one event per feature, verify one controller call, call `stop()`, dispatch again, and verify no additional call.

```ts
expect(eventDay.selectEventDay).toHaveBeenCalledOnce();
expect(circleDataSource.previewCsv).toHaveBeenCalledOnce();
expect(routeGuidance.startFromCurrentLocation).toHaveBeenCalledOnce();
expect(localDataDeletion.requestDeletion).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Write a RED semantic-facade test**

Create `tests/no-cross-feature-dom-coordinator.test.mjs`:

```js
expect(existsSync("apps/webapp/js/comipath-dom-coordinator.js")).toBe(false);
```

Also scan direct children of `apps/webapp/js/` and fail when a class imports UI modules from more than one canonical feature and performs DOM queries.

- [ ] **Step 3: Verify RED**

```bash
npx vitest run --root . \
  tests/browser-event-binding.test.ts \
  tests/no-cross-feature-dom-coordinator.test.mjs
```

- [ ] **Step 4: Inventory coordinator methods by owner**

Before moving code, produce a temporary review checklist from:

```bash
rg '^  [A-Za-z_$][A-Za-z0-9_$]*\(' apps/webapp/js/comipath-dom-coordinator.js
rg 'document\.|getElementById|querySelector' apps/webapp/js/comipath-dom-coordinator.js
```

Assign every method/property to one named target View or to `bind-browser-events.ts`. Do not leave an “other” bucket.

- [ ] **Step 5: Move feature-specific DOM rendering**

Move code mechanically first, then adapt interfaces. Preserve DOM write ordering where snapshots or focus depend on it.

- [ ] **Step 6: Create and connect `bind-browser-events.ts`**

Register each event exactly once. Return cleanup closures. The application or assembly owns one binding and calls `stop()` during shutdown.

- [ ] **Step 7: Remove coordinator callbacks and delegates**

Views receive immutable models and emit typed events. Controllers call View methods. Views do not call repositories/use cases directly.

- [ ] **Step 8: Delete `comipath-dom-coordinator.js`**

Update all production and test imports. No compatibility export or same-class rename is permitted.

- [ ] **Step 9: Strengthen architecture enforcement**

Add a rule: a direct child of `apps/webapp/js/` outside `app/` must not combine DOM access with imports from multiple canonical feature UI modules. Add failing fixtures proving the rule.

- [ ] **Step 10: Focused verification**

```bash
npx vitest run --root . \
  tests/browser-event-binding.test.ts \
  tests/no-cross-feature-dom-coordinator.test.mjs \
  tests/feature-dom-views.test.ts \
  tests/navigation-view-model-split.test.ts \
  tests/settings-component.test.ts \
  tests/outbox-panel.test.ts \
  tests/storage-delete-dialog.test.ts
```

- [ ] **Step 11: Full verification**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npm run test:e2e
git diff --check
git status --short --branch
```

Compare screenshots before accepting any update. A changed screenshot requires a written explanation that the visible result remains equivalent.

- [ ] **Step 12: Commit**

```bash
git add -A apps/webapp/js package.json scripts tests
git commit -m "refactor(ui): replace dom coordinator with feature views"
```

## Acceptance criteria

- `comipath-dom-coordinator.js` is deleted with no renamed replacement;
- each feature View owns only its own DOM;
- all browser events are registered once and cleaned up;
- controllers, not Views, invoke use cases;
- no element ID, event name, keyboard behavior, touch target, or visible layout changes;
- architecture checker rejects a new cross-feature DOM coordinator;
- unit, build, and full E2E checks pass.
