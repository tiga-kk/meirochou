# Phase 5D Task 9: Remove Legacy App, Data, UI, and Central Types

**Status:** IMPLEMENTED BUT INCOMPLETE
**Depends on:** Task 8
**Original commit:** `65a505b`
**Correction Tasks:** 9.1, 9.2, 9.3, 9.4

## Original goal

Move all production flows to feature-specific APIs, delete the legacy application/data/UI/config/type files, and leave `ComiPathApplication` as a small lifecycle shell.

## Review result

The original filenames were removed, but the core responsibilities were moved into renamed cross-feature facades:

| Deleted path | Renamed/current replacement | Review finding |
|---|---|---|
| `apps/webapp/js/app.js` | `apps/webapp/js/comipath-browser-runtime.js` | still owns event/day, source, route, deletion, Worker, timers, mutable UI state and orchestration |
| `apps/webapp/js/data-manager.ts` | `apps/webapp/js/event-day-data-store.ts` | still owns CSV/GAS/source, legacy import, repository, status and active-state coordination |
| `apps/webapp/js/ui-manager.js` | `apps/webapp/js/comipath-dom-coordinator.js` | still owns DOM references and callbacks across multiple features |
| `apps/webapp/js/types/domain.ts` | `features/event-day/domain/application-contract-types.ts` | still aggregates contracts owned by several features |
| `apps/webapp/js/types/boundary-parsers.ts` | `features/event-day/infrastructure/application-boundary-parsers.ts` | still aggregates parsers for several input boundaries |

The old-name absence tests and the line limit on `app/comipath-application.ts` passed, but they did not detect semantic renaming. New feature modules exist, yet several controllers/use cases are not the production owners created by the composition root.

Therefore the original Acceptance Criteria are not satisfied. Do not mark this Task complete based only on deleted filenames or passing architecture checks.

## Corrective sequence

1. `task-09-1-connect-event-day-and-circle-data-source.md`
2. `task-09-2-connect-route-guidance-and-local-data-deletion.md`
3. `task-09-3-replace-dom-coordinator-and-bind-browser-events.md`
4. `task-09-4-delete-renamed-facades-and-finalize-assembly.md`
5. rerun `task-10-verify-apps-refactor-and-write-handoff.md`

These Tasks are sequential because they edit the same renamed facades. Do not implement them in parallel.

## Preserved evidence

The following improvements from the original Task remain valid and must not be reverted:

- original six legacy paths and `config.ts` are absent;
- the architecture allowlist is absent;
- `ComiPathApplication` is a small lifecycle wrapper;
- EventDayRepository interface and LocalStorage implementation are separated;
- feature public APIs do not export concrete LocalStorage/HTTP/Worker/GAS clients;
- normal tests, typecheck, build, and E2E pass at branch tip `e22eadca`;
- DOM-before-ready stop settles the browser start Promise;
- pending GAS updates use the existing `gasOutbox` persisted field.

## Final acceptance criteria

Task 9 is complete only after Tasks 9.1–9.4 are reviewed and all of the following are true:

- original and renamed legacy facades are deleted;
- every canonical feature controller is constructed by `assemble-comipath-application.ts` and owns the production flow;
- no root-level cross-feature runtime/data/DOM coordinator remains;
- central type/parser files are distributed by business owner;
- architecture checker rejects equivalent semantic facades;
- production characterization tests prove repository effects, Session state, and View calls through the real assembly path;
- full clean verification, E2E, C108 smoke, public audit, and human smoke pass.
