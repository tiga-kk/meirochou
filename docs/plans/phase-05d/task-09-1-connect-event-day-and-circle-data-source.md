# Phase 5D Task 9.1: Connect Event Day and Circle Data Source to Production

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Implement only this Task. Do not start Task 9.2 in the same commit.

**Status:** NEXT
**Depends on:** current `feature/phase-05d` tip and review of Tasks 1–9
**Blocks:** Tasks 9.2, 9.3, 9.4, and Task 10 rerun
**Commit candidate:** `refactor(app): connect event day and circle data source`

## Goal

Move the production Event Day and Circle Data Source flows out of `ComiPathBrowserRuntime` and `EventDayDataStore`. The existing feature controllers and use cases must become the real owners used by `browser-entrypoint.ts`; creating unused feature files is not sufficient.

This Task preserves all user-visible behavior, LocalStorage keys and schema, GAS requests, CSV columns, error messages, and route invalidation behavior.

## Why this Task exists

Task 9 removed the old filenames, but the responsibilities remained in renamed files:

- `apps/webapp/js/comipath-browser-runtime.js`
- `apps/webapp/js/event-day-data-store.ts`

The current production composition root creates Circle Status objects, then creates `ComiPathBrowserRuntime`, which still owns event/day selection, CSV preview, Google Sheet loading, source apply/cancel, export, and source-related mutable UI state. This is a semantic rename, not completed extraction.

## Final ownership after this Task

| Responsibility | Owner after Task 9.1 |
|---|---|
| active event/day and active state | `ActiveEventDaySession` |
| event registry and initial open | Event Day use cases |
| event/day switch transaction | `SwitchEventDayUseCase` |
| event/day UI events and messages | `EventDaySelectorController` and its View |
| source draft, preview and request generation | `CircleDataSourceSession` |
| CSV preview/apply/cancel/export | Circle Data Source use cases |
| Google Sheet list/preview/cancel | `CircleDataSourceController` plus `GoogleSheetCircleClient` |
| browser request cancellation | concrete client behind `CancelableRequest<T>` |
| source-change route invalidation | a `RouteGuidanceInvalidation` capability interface |

`ComiPathBrowserRuntime` and `EventDayDataStore` may temporarily remain for responsibilities scheduled in Tasks 9.2–9.4, but they must not own the responsibilities listed above after this commit.

## Files

### Create

- `apps/webapp/js/features/circle-data-source/use-cases/preview-csv-import.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/load-google-sheet-names.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/preview-google-sheet-import.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/apply-circle-data-preview.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/cancel-circle-data-preview.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/export-circles-to-csv.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/route-guidance-invalidation.ts`
- `apps/webapp/js/features/circle-data-source/infrastructure/local-storage-circle-data-source-settings.ts`
- `tests/production-event-day-source-wiring.test.ts`

If an exact target already exists at the branch tip, modify it instead of creating a duplicate. Do not create `*-service.ts`, `*-manager.ts`, or an `index.ts` barrel.

### Modify

- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/features/event-day/ui/event-day-selector-controller.ts`
- `apps/webapp/js/features/event-day/ui/event-day-selector-view.ts`
- `apps/webapp/js/features/event-day/public-api.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-view.ts`
- `apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session.ts`
- `apps/webapp/js/features/circle-data-source/public-api.ts`
- `apps/webapp/js/comipath-browser-runtime.js`
- `apps/webapp/js/event-day-data-store.ts`
- source-related components and existing source/event-day tests
- `scripts/check-webapp-architecture.mjs`
- `tests/apps-behavior-characterization.test.ts`
- `package.json`

### Delete when no longer imported

- `apps/webapp/js/data/gas-refresh-service.ts`
- `apps/webapp/js/state/source-settings-service.ts`
- `apps/webapp/js/ui/management-session.ts`
- `apps/webapp/js/ui/csv-download.ts`

Delete only files whose complete production responsibility has moved. Do not add re-export shims.

### Forbidden

- new storage key or schema version
- new GAS action, request field, response field, or automatic network request
- source preview auto-apply
- `AbortController` or `AbortSignal` in Domain, Use Case, Session, or public API
- source state copied into both `CircleDataSourceSession` and the runtime
- direct construction of `GasApiClient` outside assembly/infrastructure
- handler-only tests that merely assert `handleX()` was called
- changes to route optimization, map assets, or visual design

## Preflight

```bash
git status --short --branch
git rev-parse HEAD

test -e apps/webapp/js/comipath-browser-runtime.js
test -e apps/webapp/js/event-day-data-store.ts
test -e apps/webapp/js/features/event-day/ui/event-day-selector-controller.ts
test -e apps/webapp/js/features/event-day/use-cases/switch-event-day.ts
test -e apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts
test -e apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session.ts
test -e apps/webapp/js/features/circle-data-source/infrastructure/gas-google-sheet-circle-client.ts

npm run test:webapp
npm run check:webapp
npm run build:webapp
```

Stop before editing production code if the worktree is dirty, the baseline fails, or Task 9.2 files are already partially implemented.

## Required interfaces

### Source cancellation

```ts
export interface CancelableRequest<T> {
  readonly result: Promise<T>;
  cancel(): void;
}
```

The GAS infrastructure creates and owns its `AbortController`. Controllers only call `cancel()`.

### Route invalidation capability

```ts
export interface RouteGuidanceInvalidation {
  invalidateAfterCircleSourceChange(eventDay: EventDayRef): Promise<void> | void;
}
```

Circle Data Source must not import Route Guidance internals. Assembly supplies an implementation through the Route Guidance public API.

### Controller lifecycle

```ts
export interface FeatureController {
  start(): Promise<void> | void;
  stop(): void;
}
```

`start()` binds its own component/View events exactly once. `stop()` removes listeners and cancels the current source request.

## TDD procedure

- [ ] **Step 1: Write a production wiring test that fails on the current tree**

Create `tests/production-event-day-source-wiring.test.ts`. Assemble the application with fake repository, fake Event Day View, fake Circle Data Source View, and fake Google Sheet client. Trigger the public View methods/events, not private runtime methods.

The test must prove all of the following:

```ts
expect(eventDayRepository.getLastOpenedEventDay).toHaveBeenCalled();
expect(eventDayView.render).toHaveBeenCalled();
expect(circleDataSourceView.showPreview).toHaveBeenCalledWith(
  expect.objectContaining({ previewId: expect.any(String) }),
);
expect(routeGuidanceInvalidation.invalidateAfterCircleSourceChange)
  .toHaveBeenCalledWith(REF);
```

The current tree should fail because assembly does not accept or connect these feature dependencies.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run --root . tests/production-event-day-source-wiring.test.ts
```

Expected: FAIL because the feature controller is not created/wired by production assembly or because the public event does not reach the use case.

- [ ] **Step 3: Complete Event Day controller production wiring**

`EventDaySelectorController` must:

1. load and render the registry during `start()`;
2. open the initial event/day through `OpenInitialEventDayUseCase`;
3. validate event/day selection at the UI boundary;
4. call `SwitchEventDayUseCase`;
5. show busy/error/success state through `EventDaySelectorView`;
6. ignore stale completion after `stop()` or a newer selection;
7. remove all listeners in `stop()`.

Do not call `ComiPathBrowserRuntime.handleEventDaySelect()`.

- [ ] **Step 4: Write focused Event Day controller tests**

Cover success, invalid detail, switch failure rollback display, stale completion, double start, and stop cleanup.

```bash
npx vitest run --root . \
  tests/event-day-selector-controller.test.ts \
  tests/event-day-transition-service.test.ts
```

- [ ] **Step 5: Implement the CSV use cases**

Each use case performs one operation only:

- `PreviewCsvImportUseCase.execute({ eventDay, fileName, text })`
- `ApplyCircleDataPreviewUseCase.execute({ previewId })`
- `CancelCircleDataPreviewUseCase.execute({ previewId })`
- `ExportCirclesToCsvUseCase.execute({ eventDay })`

The preview is immutable and contains the expected source generation. Apply must:

1. reload current persisted state;
2. reject stale generation or expired preview;
3. preserve circle status only under the existing source-diff rules;
4. save the complete next event/day state once;
5. update `ActiveEventDaySession` only after save succeeds;
6. invalidate Route Guidance only after durable save;
7. remove the preview only after successful completion.

- [ ] **Step 6: Implement Google Sheet list and preview use cases**

`LoadGoogleSheetNamesUseCase` and `PreviewGoogleSheetImportUseCase` depend on `GoogleSheetCircleClient`, not `GasApiClient`.

The controller owns one `CancelableRequest` at a time. Starting a new request, closing settings, switching event/day, and `stop()` must cancel the old request. A cancelled or stale request must not update Session or View.

- [ ] **Step 7: Move source settings and CSV download infrastructure**

Move persisted source settings to `local-storage-circle-data-source-settings.ts`. Move browser download creation to `BrowserCircleCsvDownloader`. Keep the existing key names and filename format.

- [ ] **Step 8: Remove Event Day and source state from the renamed facades**

After feature tests pass, remove these categories from `ComiPathBrowserRuntime` and `EventDayDataStore`:

- event/day selector listeners and handlers
- event/day transition tokens owned by the new controller
- draft GAS URL, selected sheet, fetched sheet names
- source preview maps and source request cancellation
- CSV/GAS preview/apply/cancel/export orchestration
- source-related user message formatting

Use this audit:

```bash
rg 'handleEventDaySelect|handleCsv|handleGas|SourcePreview|draftGasUrl|selectedSheetName|fetchedSheetNames' \
  apps/webapp/js/comipath-browser-runtime.js apps/webapp/js/event-day-data-store.ts
```

Expected after the Task: no production ownership remains. A narrowly named compatibility call is not acceptable.

- [ ] **Step 9: Rewrite characterization tests through public boundaries**

`apps-behavior-characterization.test.ts` must assemble the real controllers with fake external boundaries. Do not spy on or mock `handleEventDaySelect`, `handleCsvPreviewRequest`, or other methods under test.

- [ ] **Step 10: Register all new tests**

Add every new test file to the normal `test:webapp` command. A focused-only test does not satisfy this Task.

- [ ] **Step 11: Focused verification**

```bash
npx vitest run --root . \
  tests/production-event-day-source-wiring.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/event-day-selector-controller.test.ts \
  tests/circle-data-source-use-cases.test.ts \
  tests/circle-data-source-cancellation.test.ts \
  tests/source-manager-app.test.ts \
  tests/source-diff-app.test.ts \
  tests/csv-download-app.test.ts
```

- [ ] **Step 12: Full verification**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npx playwright test tests/e2e/management.spec.ts --project=mobile-chromium
git diff --check
git status --short --branch
```

- [ ] **Step 13: Self-review**

Confirm:

- production assembly creates both controllers;
- public events reach feature use cases;
- no duplicate mutable source/event-day state remains;
- no concrete infrastructure is exported from `public-api.ts`;
- no raw CSV cell, GAS URL, sheet content, or credential appears in logs/errors;
- the renamed facades no longer own Event Day or Circle Data Source behavior.

- [ ] **Step 14: Commit**

```bash
git add apps/webapp/js package.json scripts tests
git commit -m "refactor(app): connect event day and circle data source"
```

## Acceptance criteria

- Event Day and Circle Data Source production flows run through their feature controllers/use cases.
- `assemble-comipath-application.ts` creates and connects these dependencies.
- `ComiPathBrowserRuntime` and `EventDayDataStore` no longer own event/day/source orchestration or mutable source state.
- source request cancellation is abstract outside infrastructure.
- repository save precedes active-session update and route invalidation.
- the existing LocalStorage/GAS/CSV contracts are unchanged.
- new tests are part of `npm run test:webapp`.
- focused, full, build, and management E2E checks pass.
