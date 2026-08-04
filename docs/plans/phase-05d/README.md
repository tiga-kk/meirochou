# Phase 5D Apps Internal Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` and complete one canonical Task document at a time. Do not start a later Task while an earlier Task is unreviewed or blocked.

**Goal:** Preserve user-visible behavior while moving `apps/webapp/` production ownership into feature-specific Domain, Use Case, Infrastructure, Controller, and View modules. Delete both the original legacy files and any renamed replacement facades.

**Architecture:** Each feature owns its state, operations, external capability interfaces, concrete infrastructure, and UI boundary. `app/assemble-comipath-application.ts` is the only composition root. `ComiPathApplication` owns lifecycle order only.

**Tech Stack:** TypeScript strict, Lit, Vite, LocalStorage, GAS Web App, Web Worker, Vitest, Playwright, Biome, Node.js architecture checker.

**Design:** `../../specs/2026-07-28-phase-05d-architecture-refactor-design.md`
**Architecture rules:** `../../architecture/webapp-module-boundaries.md`
**Naming rules:** `../../architecture/webapp-naming-guidelines.md`
**Current handoff:** `../../reviews/phase-5d-handoff.md`

## Current execution state

As of 2026-08-05, Tasks 1–10 have implementation commits and the current branch passes CI. However, the Task 10 review found that Task 9 removed legacy filenames without fully moving their responsibilities.

Current renamed facades:

- `comipath-browser-runtime.js`: cross-feature runtime/orchestration
- `event-day-data-store.ts`: cross-feature data/source/status coordination
- `comipath-dom-coordinator.js`: cross-feature DOM facade
- `features/event-day/domain/application-contract-types.ts`: central contracts owned by several features
- `features/event-day/infrastructure/application-boundary-parsers.ts`: central parsers owned by several boundaries

The Phase remains **BLOCKED**. Phase 5E must not start.

### Verified foundation that must be preserved

- EventDayRepository contract and LocalStorage implementation are separated.
- feature public APIs do not export concrete infrastructure.
- browser start before DOM readiness settles when stopped.
- startup failure is terminal for the same application instance.
- pending GAS updates remain in `LocalEventDayState.gasOutbox`.
- branch-tip GitHub Actions passes 487 normal tests, route/regression tests, architecture/typecheck/build, and 38 E2E tests with 8 expected C108 skips.

### Required correction sequence

- Task 9.1: **NEXT** — connect Event Day and Circle Data Source to production
- Task 9.2: blocked by 9.1 — connect Route Guidance and Local Data Deletion
- Task 9.3: blocked by 9.2 — replace DOM coordinator and bind browser events
- Task 9.4: blocked by 9.3 — delete renamed facades, distribute contracts/parsers, finalize assembly
- Task 10: rerun after independent review of 9.4

Tasks 9.1–9.4 are sequential because they edit the same renamed facade files. Do not implement them in parallel.

## Global constraints

- Do not change Phase 5C behavior, LocalStorage schema or keys, GAS contract, CSV contract, route-guidance state, snapshot, distance matrix, Dijkstra weights, ALNS objective, timing profile, or map assets.
- Do not add package dependencies.
- New production modules are TypeScript strict. Do not add `any`.
- Treat external input as `unknown` and validate it at the owning boundary.
- Keep one mutable owner for active event/day, pending GAS updates, route guidance, source preview/request generation, and each UI-only state.
- Cross-feature imports use the other feature's `public-api.ts` only.
- Feature public APIs must not export concrete `LocalStorage*`, `Http*`, `Browser*`, `WebWorker*`, or `Gas*Client` classes.
- Domain and Use Case code must not access DOM, LocalStorage, fetch, Worker, AbortController, or AbortSignal.
- Do not create names containing `Manager`, `Handler`, `Helper`, `Utils`, `Common`, or an unspecified `Service`.
- Do not create a renamed compatibility facade or a second central contract/parser file.
- Every new test must be registered in normal `npm run test:webapp` in the same Task.
- Every Task must leave the application buildable and major existing flows usable.
- Snapshot updates require a written visual-equivalence justification.

## Layer boundary

```text
components / feature UI
          ↓
feature Controller
          ↓
feature Use Case
          ↓
feature Domain

Use Case ── depends on capability interface
                         ↑ implemented by
Infrastructure ──────────┘
```

Placement rules:

- Repository/capability interfaces: `features/<feature>/use-cases/`
- LocalStorage/HTTP/GAS/Worker/browser implementations: `features/<feature>/infrastructure/`
- DOM Views and event-detail parsers: `features/<feature>/ui/` or `shared/ui/`
- concrete dependency creation: `app/assemble-comipath-application.ts` only
- cross-feature contracts: `features/<feature>/public-api.ts`
- browser readiness/pagehide: `app/run-comipath-in-browser.ts`
- lifecycle order: `app/comipath-application.ts`
- browser event routing: `app/bind-browser-events.ts`

## Target structure

```text
apps/webapp/js/
├── app/
│   ├── browser-entrypoint.ts
│   ├── run-comipath-in-browser.ts
│   ├── assemble-comipath-application.ts
│   ├── comipath-application.ts
│   └── bind-browser-events.ts
├── features/
│   ├── event-day/
│   ├── circle-status/
│   ├── route-guidance/
│   ├── circle-data-source/
│   └── local-data-deletion/
├── shared/
│   ├── domain/
│   ├── browser/
│   └── ui/
└── components/
```

Direct children of `apps/webapp/js/` may contain small legacy-compatible pure algorithms during migration, but may not contain a cross-feature stateful runtime, data store, or DOM coordinator at Phase exit.

## Task table

| Task | Canonical document | State |
|---|---|---|
| 1 | `task-01-lock-current-behavior-and-architecture-rules.md` | implemented |
| 2 | `task-02-separate-browser-startup-and-dependency-assembly.md` | implemented |
| 3 | `task-03-centralize-active-event-day-state.md` | implemented |
| 3.1 | `task-03-1-correct-foundation-review-findings.md` | implementation conditions present; final evidence reviewed with corrections |
| 4 | `task-04-extract-circle-status-and-gas-update-queue.md` | implemented; production-connected |
| 5 | `task-05-extract-route-guidance.md` | modules exist; production ownership incomplete |
| 6 | `task-06-extract-circle-data-source-workflows.md` | modules exist; production ownership incomplete |
| 7 | `task-07-extract-event-day-switching-and-local-data-deletion.md` | modules exist; production ownership incomplete |
| 8 | `task-08-split-feature-specific-dom-views.md` | partial; cross-feature coordinator remains |
| 9 | `task-09-remove-legacy-app-data-ui-and-central-types.md` | implemented but semantically incomplete |
| 9.1 | `task-09-1-connect-event-day-and-circle-data-source.md` | **NEXT** |
| 9.2 | `task-09-2-connect-route-guidance-and-local-data-deletion.md` | blocked by 9.1 |
| 9.3 | `task-09-3-replace-dom-coordinator-and-bind-browser-events.md` | blocked by 9.2 |
| 9.4 | `task-09-4-delete-renamed-facades-and-finalize-assembly.md` | blocked by 9.3 |
| 10 | `task-10-verify-apps-refactor-and-write-handoff.md` | initial handoff recorded; rerun required |

## Required order

```text
Tasks 1–9 implemented
        ↓
Task 9.1
        ↓
Task 9.2
        ↓
Task 9.3
        ↓
Task 9.4
        ↓
Task 10 rerun
        ↓
Phase 5E planning
```

## Per-task execution rule

1. Read `AGENTS.md`, this README, the current handoff, architecture rules, and the exact Task document.
2. Run branch/worktree/source/target preflight.
3. Run the focused baseline.
4. Add a failing test that proves production ownership, not only class existence.
5. Verify RED for the intended reason.
6. Make the minimum responsibility move.
7. Verify focused GREEN.
8. Update architecture checker and fixtures in the same Task.
9. Register every new test in normal `test:webapp`.
10. Run full tests, architecture/typecheck, build, required E2E, and diff checks.
11. Confirm the renamed facades lost the responsibility assigned to the Task.
12. Commit one Task only.
13. Request independent review before starting the next Task.

Do not mark a Task complete because a new module exists. The production entry path must construct and call it, and the old owner must no longer own the same state/behavior.

## Phase boundary

Phase 5D completes production architecture. Phase 5E reorganizes tests/docs only after Phase 5D is accepted. Phase 5F performs broad visual polish.

## Exit gate

All conditions below are required:

- Tasks 9.1–9.4 and rerun Task 10 are independently reviewed.
- Original paths are absent: `app.js`, `data-manager.ts`, `ui-manager.js`, `config.ts`, `types/domain.ts`, `types/boundary-parsers.ts`.
- Renamed facade paths are absent: `comipath-browser-runtime.js`, `event-day-data-store.ts`, `comipath-dom-coordinator.js`.
- Central replacements are absent: `application-contract-types.ts`, `application-boundary-parsers.ts`.
- `assemble-comipath-application.ts` constructs every canonical feature controller and all concrete infrastructure.
- `comipath-application.ts` owns lifecycle only and is at most 200 physical lines.
- `bind-browser-events.ts` owns explicit browser event registration and cleanup.
- active event/day mutable state exists only in `ActiveEventDaySession`.
- route-guidance mutable state exists only in `RouteGuidanceSession`.
- source preview/request-generation mutable state exists only in `CircleDataSourceSession` and the current cancelable request owner.
- pending GAS updates persist only in `LocalEventDayState.gasOutbox`.
- no cross-feature stateful root runtime/data/DOM coordinator exists.
- no central type/parser god file exists.
- Use Cases have no concrete/browser dependencies.
- public APIs export no concrete infrastructure.
- feature deep imports, vague names, architecture allowlist, and semantic facade replacements are absent.
- characterization tests exercise production assembly and verify repository effects, Session state, and View calls.
- LocalStorage, GAS, CSV, route, resume, deletion, map, and optimizer contracts remain unchanged.
- clean `npm run verify`, full E2E, C108 desktop/mobile smoke, public audit, Biome, diff check, and human smoke pass.
- `docs/reviews/phase-5d-handoff.md` records final evidence and declares PASS before Phase 5E starts.
