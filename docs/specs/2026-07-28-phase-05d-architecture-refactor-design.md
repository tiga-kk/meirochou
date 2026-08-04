# Phase 5D Apps Internal Refactor Design

**Status:** APPROVED, corrected after implementation review
**Original date:** 2026-07-28
**Correction date:** 2026-08-05
**Scope:** Internal `apps/webapp/` architecture only. Do not change external behavior, persistence, GAS/CSV contracts, optimization, or map artifacts.

## Problem

The original application concentrated unrelated responsibilities in `App`, `DataManager`, and `UIManager`. Phase 5D created feature modules, but the first implementation review found that the old filenames had largely been replaced by renamed cross-feature facades:

- `ComiPathBrowserRuntime`
- `EventDayDataStore`
- `ComiPathDomCoordinator`
- central application contract and parser files

This does not satisfy the design. The problem is responsibility concentration, not a particular filename or line count.

## Decision

Use a feature-oriented modular monolith. Each canonical feature contains Domain, Use Cases, Infrastructure, Controller/View, and one explicit `public-api.ts` boundary.

Canonical features:

- Event Day
- Circle Status
- Route Guidance
- Circle Data Source
- Local Data Deletion

Dependency direction:

```text
UI / Component
      ↓
Controller
      ↓
Use Case
      ↓
Domain

Use Case → capability interface ← Infrastructure
```

`app/assemble-comipath-application.ts` is the only composition root. `ComiPathApplication` owns lifecycle order only. `bind-browser-events.ts` owns explicit browser event registration and cleanup only.

## Canonical ownership

### Event Day

Owns event registry, active event/day, initial open, last-opened value, map manifest selection, switch prepare/commit/rollback, and event/day selector UI.

### Circle Status

Owns pending/held/purchased/excluded transitions, short-lived undo, purchase-to-GAS update conversion, pending GAS update delivery/retry/discard, progress and gallery models.

### Route Guidance

Owns current location, map-area catalog, route-map assets, grid route, distance matrix, ALNS Worker, current/selected destination, route comparison, arrival, snapshot, resume and reset.

### Circle Data Source

Owns CSV validation/preview/apply/cancel/export, Google Sheet list/preview/cancel, source diff, source settings, request cancellation, and route invalidation after durable source replacement.

### Local Data Deletion

Owns deletion options, confirmation, pending-update blocking, circles/activity/event-day/all-events deletion, route cache/snapshot cleanup, and active event/day fallback.

## State ownership

- active event/day and active persisted state: `ActiveEventDaySession`;
- derived circles/status lists: `ActiveEventDayReader`;
- route mutable runtime: `RouteGuidanceSession`;
- source draft/preview/request generation: `CircleDataSourceSession`;
- current cancelable source request: one Circle Data Source controller owner;
- pending GAS persistence: active state's `gasOutbox` only;
- UI-only state: corresponding feature View;
- persisted data: owning repository implementation.

No root runtime/data/UI facade keeps duplicate mutable state.

## Application shell

```ts
export interface ApplicationController {
  start(): Promise<void> | void;
  stop(): void;
}

export interface BackgroundProcess {
  start(): void;
  stop(): void;
}

export interface ComiPathApplicationDependencies {
  readonly controllers: readonly ApplicationController[];
  readonly backgroundProcesses: readonly BackgroundProcess[];
}
```

Allowed responsibilities:

- controller start order;
- background-process start order;
- reverse stop order;
- terminal startup failure and original error propagation.

Forbidden responsibilities:

- DOM query;
- repository/storage call;
- routing/optimization;
- CSV/GAS logic;
- status transition;
- deletion branching;
- user-facing message formatting.

`comipath-application.ts` remains at most 200 physical lines through responsibility movement, not compression.

## Semantic facade rule

The following is prohibited even under a new name:

- one class/file owns two or more canonical feature states;
- one class/file binds and handles unrelated feature events;
- one class/file creates multi-feature concrete infrastructure outside assembly;
- one DOM object renders multiple canonical feature areas;
- one central type/parser file aggregates several feature owners.

Final correction deletes:

- `comipath-browser-runtime.js`;
- `event-day-data-store.ts`;
- `comipath-dom-coordinator.js`;
- `application-contract-types.ts`;
- `application-boundary-parsers.ts`.

The architecture checker must reject equivalent replacements, not only exact old names.

## Migration strategy

Preserve behavior and keep the branch buildable after every Task.

1. preserve and review foundation fixes;
2. connect Event Day and Circle Data Source to production and remove those responsibilities from renamed facades;
3. connect Route Guidance and Local Data Deletion and remove those responsibilities;
4. replace the cross-feature DOM coordinator with feature Views and explicit browser-event binding;
5. distribute central contracts/parsers, finalize composition/lifecycle, and delete renamed facades;
6. run clean final verification and human smoke;
7. begin Phase 5E only after a PASS handoff.

Tasks editing the renamed facades are sequential and independently reviewed.

## Non-goals

- test/docs directory reorganization;
- broad visual redesign;
- package dependency addition;
- LocalStorage schema/key changes;
- GAS or CSV contract changes;
- ALNS objective/time/profile/seed changes;
- Dijkstra/map changes;
- PWA/server/multi-device features.

Tests/docs structure is Phase 5E. Broad visual polish is Phase 5F.

## Completion criteria

- original legacy files and architecture allowlist are absent;
- renamed runtime/data/DOM facades and central contract/parser replacements are absent;
- every canonical feature controller is created by assembly and owns its production flow;
- browser entrypoint reaches features without a compatibility runtime/data facade;
- application shell and event binder contain only their allowed responsibilities;
- single mutable state owners are enforced;
- Use Cases have no browser/concrete dependencies;
- public APIs export no concrete infrastructure;
- cross-feature deep imports and semantic facades are rejected by tests/checker;
- characterization tests run through real assembly and verify effects;
- storage/GAS/CSV/status/route/resume/delete/map/optimizer behavior is preserved;
- clean verify, full E2E, C108 smoke, public audit, Biome and human smoke pass;
- final handoff declares PASS before Phase 5E starts.
