# Phase 5D Task 9.2: Connect Route Guidance and Local Data Deletion to Production

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Implement only this Task after Task 9.1 is reviewed.

**Status:** BLOCKED BY TASK 9.1
**Depends on:** Task 9.1 reviewed
**Blocks:** Tasks 9.3, 9.4, and Task 10 rerun
**Commit candidate:** `refactor(app): connect route guidance and local deletion`

## Goal

Make Route Guidance and Local Data Deletion feature controllers the actual production owners. Remove navigation, optimizer, snapshot, route-map, arrival, destination-change, and deletion orchestration from `ComiPathBrowserRuntime`.

Do not change route quality, Dijkstra weights, ALNS objective, timing profiles, snapshot schema, matrix cache schema, deletion semantics, or map rendering.

## Final ownership after this Task

| Responsibility | Owner after Task 9.2 |
|---|---|
| route target, selected candidate, route, generation | `RouteGuidanceSession` |
| route start/resume/change/finish/reset | Route Guidance use cases |
| map assets HTTP loading and cache | Route Guidance infrastructure |
| distance matrix persistence | Route Guidance repository interface + LocalStorage implementation |
| route snapshot persistence | Route Guidance repository interface + LocalStorage implementation |
| ALNS Worker lifecycle | `WebWorkerRouteOptimizer` |
| route UI events and stale-operation tokens | `RouteGuidanceController` |
| deletion option creation, confirmation and execution | `LocalDataDeletionController` and `DeleteLocalDataUseCase` |
| deletion storage operations | a Local Data Deletion repository implementation |

## Files

### Create or move into the feature

- `apps/webapp/js/features/route-guidance/infrastructure/local-storage-route-guidance-snapshot-repository.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/local-storage-distance-matrix-repository.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/web-worker-route-optimizer.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/grid-route-planner.ts`
- `apps/webapp/js/features/route-guidance/use-cases/distance-matrix-repository.ts`
- `apps/webapp/js/features/local-data-deletion/use-cases/local-data-repository.ts`
- `apps/webapp/js/features/local-data-deletion/infrastructure/local-storage-local-data-repository.ts`
- `tests/production-route-deletion-wiring.test.ts`

Use mechanical moves where possible. Do not duplicate the existing routing algorithm.

### Modify

- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- Route Guidance use cases and session
- `apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-controller.ts`
- `apps/webapp/js/features/local-data-deletion/use-cases/delete-local-data.ts`
- `apps/webapp/js/features/local-data-deletion/public-api.ts`
- `apps/webapp/js/comipath-browser-runtime.js`
- remaining route/deletion tests
- `scripts/check-webapp-architecture.mjs`
- `package.json`

### Delete when migration is complete

- `apps/webapp/js/state/navigation-snapshot-repository.ts`
- `apps/webapp/js/routing/distance-matrix-repository.ts`
- old route runtime/orchestration wrappers whose behavior is completely represented by the feature
- old local deletion wrappers

Do not delete pure algorithms until their new owner imports are established and the tests remain green.

### Forbidden

- change to `NavigationState` or snapshot JSON shape
- change to distance matrix key or matrix interpretation
- change to Dijkstra weights or diagonal movement
- change to ALNS objective, seed, time limit, warm start, or fixed-first-leg rules
- second route mutable state outside `RouteGuidanceSession`
- direct Worker construction outside Route Guidance infrastructure/assembly
- deletion before confirmation or while pending GAS updates block it
- route/deletion calls through `ComiPathBrowserRuntime` after this Task

## Preflight

```bash
git status --short --branch
git log -1 --oneline

test -e apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts
test -e apps/webapp/js/features/route-guidance/use-cases/route-guidance-session.ts
test -e apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts
test -e apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance.ts
test -e apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-controller.ts
test -e apps/webapp/js/features/local-data-deletion/use-cases/delete-local-data.ts

git show --stat --oneline HEAD
npm run verify:webapp
```

Verify that the reviewed Task 9.1 commit is HEAD or an ancestor. Stop if source/event-day work is mixed into the worktree.

## Required controller contract

```ts
export interface RouteGuidanceController {
  start(): void;
  stop(): void;
  startFromCurrentLocation(input: StartRouteGuidanceInput): Promise<void>;
  resumeSavedGuidance(eventDay: EventDayRef, circles: readonly Circle[]): Promise<boolean>;
  previewDestination(circleSpace: string): Promise<void>;
  confirmDestinationChange(): Promise<void>;
  cancelDestinationChange(): void;
  finishCurrentCircle(nextStatus: CircleStatus): Promise<void>;
  resetStart(): Promise<void>;
}
```

The exact export may be a class rather than an interface, but the public operations and ownership must be equivalent.

## TDD procedure

- [ ] **Step 1: Write a failing production wiring test**

Create `tests/production-route-deletion-wiring.test.ts`. Assemble the application with fake map loader, fake optimizer, fake snapshot/matrix repositories, fake Route Guidance View, and fake Local Data Deletion View.

Prove that public UI events call the feature controllers and that state is owned by `RouteGuidanceSession`:

```ts
expect(routeOptimizer.optimize).toHaveBeenCalledOnce();
expect(routeGuidanceSession.getSnapshot().currentTarget?.space).toBe("E1-01");
expect(localDataRepository.deleteEventDay).toHaveBeenCalledWith(REF);
```

The current tree must fail because production assembly delegates to `ComiPathBrowserRuntime`.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run --root . tests/production-route-deletion-wiring.test.ts
```

- [ ] **Step 3: Move snapshot and matrix repository implementations**

Keep repository interfaces under `use-cases/` and concrete LocalStorage implementations under `infrastructure/`. Preserve exact keys, parsing, expiry, event/day scoping, and rollback behavior.

- [ ] **Step 4: Wrap the existing Worker protocol**

`WebWorkerRouteOptimizer` owns Worker creation, progress subscription, cancellation, generation checks, and termination. It implements the existing `RouteOptimizer` interface. `RouteGuidanceController` and use cases must not access `Worker` directly.

- [ ] **Step 5: Move route-map asset loading and grid planning**

Use the existing HTTP loader and routing algorithms. The controller/use cases depend on `RouteMapAssetsLoader` and a pure route planner capability. Do not copy algorithms or create a second cache.

- [ ] **Step 6: Expand Route Guidance controller to own browser events and stale work**

The controller must bind current-location, route-start, resume, reset, destination-preview, confirm, cancel, purchased, held, excluded, and restore interactions. It owns one operation generation counter and cancels/ignores stale callbacks after event/day change or `stop()`.

- [ ] **Step 7: Connect Local Data Deletion**

`LocalDataDeletionController` builds the dialog model, validates confirmation, calls `DeleteLocalDataUseCase`, renders errors, and closes only after success. The use case owns the ordering of storage deletion, active-session fallback, route snapshot/matrix cleanup, and pending-GAS-update blocking.

- [ ] **Step 8: Remove route and deletion responsibility from the runtime**

Remove the following categories from `ComiPathBrowserRuntime`:

- current/next/selected target and route properties
- selection state/message and selection token
- route assets cache and current manifest
- navigation state, matrix ref and resume snapshot
- owned ALNS workers and optimizer lifecycle
- route start/resume/change/arrival/action orchestration
- deletion scope, confirmation and deletion messages

Audit:

```bash
rg 'currentTarget|currentRoute|selectedTarget|selectedRoute|selectionToken|routeAssetsCache|navigationState|navigationMatrixRef|activeResumeSnapshot|activeDeleteScope' \
  apps/webapp/js/comipath-browser-runtime.js
```

Expected: no mutable ownership remains.

- [ ] **Step 9: Rewrite route/deletion integration tests through assembly**

Do not instantiate `NavigationOrchestrationService` as a substitute for production wiring. Use fake external boundaries and real feature use cases/controllers.

- [ ] **Step 10: Register tests and run focused verification**

```bash
npx vitest run --root . \
  tests/production-route-deletion-wiring.test.ts \
  tests/start-route-guidance.test.ts \
  tests/resume-route-guidance.test.ts \
  tests/route-guidance-session.test.ts \
  tests/route-guidance-controller.test.ts \
  tests/navigation-recovery.test.ts \
  tests/delete-local-data.test.ts \
  tests/local-data-deletion-controller.test.ts \
  tests/storage-deletion-app.test.ts
```

- [ ] **Step 11: Full verification**

```bash
npm run test:webapp
npm run test:route-guidance
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npm run test:e2e
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts \
  --project=chromium --project=mobile-chromium
git diff --check
git status --short --branch
```

- [ ] **Step 12: Self-review and commit**

Confirm one route mutable state owner, one Worker owner, durable state ordering, and no route/deletion methods left in the runtime.

```bash
git add apps/webapp/js package.json scripts tests
git commit -m "refactor(app): connect route guidance and local deletion"
```

## Acceptance criteria

- production Route Guidance runs through `RouteGuidanceController`, its use cases, and `RouteGuidanceSession`;
- production Local Data Deletion runs through its controller/use case;
- assembly creates all concrete route/deletion dependencies;
- `ComiPathBrowserRuntime` no longer owns route or deletion state/orchestration;
- Worker, snapshot, matrix, route-map and deletion infrastructure are behind interfaces;
- all storage/optimization/map contracts are unchanged;
- full unit, build, E2E, and C108 smoke checks pass.
