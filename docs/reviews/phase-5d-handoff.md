# Phase 5D Handoff: Apps Internal Refactor Verification

**Last updated:** 2026-08-05
**Branch:** `feature/phase-05d`
**Reviewed tip:** `e22eadca73e9b3ece0dc5ae4d5d0fda4b0946066`
**Decision:** BLOCKED — correction Tasks 9.1–9.4 required

## Summary

The current branch is operational and CI-green, but Phase 5D is not complete. The first Task 10 verification correctly recorded a BLOCKED handoff. A subsequent source review confirmed that the main problem is not an unverified filename deletion: the former broad responsibilities remain in renamed production facades.

The branch must not merge and Phase 5E must not start until Tasks 9.1–9.4 are implemented, independently reviewed, and Task 10 is rerun.

## Confirmed working foundation

At reviewed tip `e22eadca`:

- GitHub Actions run 76 succeeded.
- normal Vitest suite: 69 files / 487 tests passed;
- Route Guidance focused suite: 5 files / 8 tests passed;
- Phase 5D regression suite: 2 files / 4 tests passed;
- architecture check passed for 134 production source files;
- TypeScript check, Vite build and map build verification passed;
- Playwright: 38 passed / 8 expected C108 skips in the normal run;
- the dedicated C108 desktop/mobile smoke had previously passed 8 tests;
- Cloudflare Pages preview deployed successfully;
- EventDayRepository interface and LocalStorage implementation are separated;
- event-day public API does not export the LocalStorage implementation;
- stop before DOM readiness settles the pending browser-start Promise;
- same-instance startup failure is terminal;
- pending GAS updates persist in the existing `gasOutbox` field.

These improvements must be preserved by all correction Tasks.

## Blocking architecture findings

### BLOCKER 1: renamed application facade

`apps/webapp/js/comipath-browser-runtime.js` remains a multi-feature runtime. It owns or coordinates event/day, source import, route state, route assets, optimizer/Worker, deletion, timers/listeners, and user-facing messages.

### BLOCKER 2: renamed data facade

`apps/webapp/js/event-day-data-store.ts` remains a broad data/source/status coordinator. It contains CSV/GAS/source preview and apply logic, legacy import, repository access, active state, and status/pending-update collaborators.

### BLOCKER 3: renamed DOM facade

`apps/webapp/js/comipath-dom-coordinator.js` retains DOM nodes and callbacks for multiple canonical features.

### BLOCKER 4: feature modules are not consistently production owners

Several feature modules and controllers exist and have unit tests, but production assembly still creates a `ComiPathBrowserRuntime`. Circle Status is connected more fully than Event Day, Circle Data Source, Route Guidance, and Local Data Deletion.

### HIGH: central contract/parser replacements

`application-contract-types.ts` and `application-boundary-parsers.ts` remain central files under Event Day although their exports belong to several features and boundaries.

### HIGH: architecture checker proves names and selected imports, not semantic completion

The checker passes because the original paths are absent and `comipath-application.ts` is small. It does not yet reject an equivalent renamed cross-feature runtime/data/DOM facade or prove all canonical controllers are production-connected.

### HIGH: characterization tests do not fully prove production effects

Some tests verify that a runtime method is invoked or directly test an old lower-level service rather than proving the real composition root reaches the feature use case and causes repository, Session, and View effects.

## Corrective Task sequence

| Task | Purpose | State |
|---|---|---|
| 9.1 | connect Event Day and Circle Data Source; remove those responsibilities from renamed facades | NEXT |
| 9.2 | connect Route Guidance and Local Data Deletion; remove route/deletion ownership from runtime | blocked by 9.1 |
| 9.3 | delete cross-feature DOM coordinator and add explicit event binding | blocked by 9.2 |
| 9.4 | distribute central contracts/parsers, delete renamed runtime/data facades, finalize assembly/checker | blocked by 9.3 |
| 10 rerun | clean verification, C108/human smoke and final handoff | blocked by 9.4 review |

Do not combine Tasks 9.1–9.4 into one commit and do not implement them in parallel.

## Final files that must be absent

Original paths:

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/ui-manager.js`
- `apps/webapp/js/config.ts`
- `apps/webapp/js/types/domain.ts`
- `apps/webapp/js/types/boundary-parsers.ts`
- `scripts/webapp-architecture-legacy-allowlist.json`

Renamed semantic replacements:

- `apps/webapp/js/comipath-browser-runtime.js`
- `apps/webapp/js/event-day-data-store.ts`
- `apps/webapp/js/comipath-dom-coordinator.js`
- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`

## Final production ownership required

- `assemble-comipath-application.ts` creates every canonical controller, View, repository, client, loader, optimizer, and background process.
- `comipath-application.ts` owns lifecycle order only.
- `bind-browser-events.ts` owns explicit event registration and cleanup only.
- feature controllers own public UI operations and stale-operation/cancellation logic.
- feature use cases own operation ordering and durable-state timing.
- feature Sessions are the only runtime mutable owners.
- concrete infrastructure is hidden behind interfaces and created only by assembly.

## Contract preservation

The correction must not change:

- LocalStorage key/schema/migration;
- GAS action/request/response and local-first save ordering;
- CSV columns, preview/apply/cancel/export behavior;
- route snapshot and distance matrix schemas;
- Dijkstra weights and map interpretation;
- ALNS objective, seed, time profile, warm start and fixed-first-leg rules;
- map assets or public artifact tree;
- visible layout, element IDs, custom-event names, keyboard/mobile behavior.

## Phase 5E boundary

Phase 5E remains planned but blocked. After a PASS Phase 5D handoff, Phase 5E may reorganize:

- test locations by feature ownership;
- unit/integration/E2E naming;
- fixtures/fakes/test helpers;
- package test scripts;
- duplicate/obsolete tests;
- docs canonical/current/archive navigation;
- stale terminology and path references.

Phase 5E must not become a place to finish production responsibility migration.

## Next action

Implement and review:

```text
docs/plans/phase-05d/task-09-1-connect-event-day-and-circle-data-source.md
```

Do not start Task 9.2 or Phase 5E until Task 9.1 has a separate commit and independent review.