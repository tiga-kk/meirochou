# Phase 5D Task 3.1: Correct Foundation Review Findings

**Status:** IMPLEMENTED; FOUNDATION REVIEWED, FOLLOW-UP MOVED TO TASKS 9.1–9.4
**Original purpose:** correct architecture/lifecycle defects found after Tasks 1–3
**Do not implement this Task again.**

## Original findings

1. LocalStorage Event Day implementation was placed in the Use Case file.
2. Event Day public API exported concrete LocalStorage infrastructure.
3. Architecture checks missed legacy concrete imports.
4. Stop before DOM readiness could leave the browser-start Promise pending.
5. start-failure retry behavior differed between tests and production.
6. dispose did not fully invalidate in-flight work.
7. characterization tests could pass while mocking the handler under test.
8. new tests were not part of normal `test:webapp`.
9. architecture checks were not part of normal `check:webapp`.

## Confirmed resolved at branch tip `e22eadca`

- `EventDayRepository` is an interface under `features/event-day/use-cases/`.
- `LocalStorageEventDayRepository` is under `features/event-day/infrastructure/`.
- Event Day `public-api.ts` does not export the LocalStorage implementation.
- `assemble-comipath-application.ts` imports the concrete repository from the infrastructure path.
- `run-comipath-in-browser.ts` resolves the pending DOM-readiness Promise when stopped.
- `ComiPathApplication` treats start failure as terminal for the same instance and stops once.
- architecture checker runs before typecheck in `npm run check:webapp`.
- Task 1–3 foundation tests are registered in normal `npm run test:webapp`.
- GitHub Actions passes the lifecycle, repository-layer, architecture, typecheck and build checks.

## Follow-up findings not owned by Task 3.1

The later full-tree review found broader semantic-completion problems:

- `ComiPathBrowserRuntime` remains a multi-feature runtime facade.
- `EventDayDataStore` remains a multi-feature data/source coordinator.
- `ComiPathDomCoordinator` remains a cross-feature DOM facade.
- central application contract/parser files remain.
- some characterization tests still prove method invocation or lower-level behavior rather than real production composition effects.
- several feature controllers/use cases exist without owning the production flow.

These are not reasons to re-run the old Task 3.1 procedure. They are corrected by:

1. `task-09-1-connect-event-day-and-circle-data-source.md`
2. `task-09-2-connect-route-guidance-and-local-data-deletion.md`
3. `task-09-3-replace-dom-coordinator-and-bind-browser-events.md`
4. `task-09-4-delete-renamed-facades-and-finalize-assembly.md`
5. Task 10 rerun

## Preserved contracts

Correction Tasks must preserve:

- Event Day repository interface/concrete separation;
- no concrete infrastructure export from public APIs;
- idempotent stop and settled DOM-before-ready Promise;
- terminal same-instance start failure;
- cancellation/stale-result rejection after stop;
- architecture checker in normal `check:webapp`;
- all foundation tests in normal `test:webapp`;
- unchanged LocalStorage/GAS/CSV/route/map behavior.

## Review evidence required at final Task 10

Task 10 must re-run and inspect:

```bash
npx vitest run --root . \
  tests/event-day-layer-boundaries.test.mjs \
  tests/architecture-boundaries.test.mjs \
  tests/browser-application-lifecycle.test.ts \
  tests/comipath-application.test.ts \
  tests/application-assembly.test.ts
npm run check:webapp
```

It must also prove that production characterization no longer depends on the renamed facades. Final completion evidence belongs in `docs/reviews/phase-5d-handoff.md`.
