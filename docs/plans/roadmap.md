# ComiPath Roadmap

## Current order

```text
Phase 5A: Cloudflare Pages publication                  COMPLETE
  ↓
Phase 5B: C108 map bundle integration                  COMPLETE
  ↓
Phase 5C: Circle status, route guidance, ALNS          COMPLETE
  ↓
Phase 5D: apps/webapp production architecture refactor IN CORRECTION
  ↓
Phase 5E: tests and docs structure refactor             BLOCKED
  ↓
Phase 5F: broad visual polish                           FUTURE
```

Each Phase uses one Phase branch, Task-specific commits, independent Task review, and normally one Draft PR. Do not begin a later Phase before the current exit gate passes.

## Phase 5D: apps/webapp production architecture refactor

### Goal

Move responsibility from broad application/data/UI/config/type files into canonical feature Domain, Use Case, Infrastructure, Controller and View modules. Delete both original legacy paths and equivalent renamed facades.

### Canonical features

- Event Day
- Circle Status
- Route Guidance
- Circle Data Source
- Local Data Deletion

### Current status

The branch is CI-green and has feature modules, but the initial Task 10 handoff is BLOCKED. Task 9 removed original filenames while leaving equivalent responsibilities in renamed runtime/data/DOM and central contract/parser files.

Correction sequence:

```text
Task 9.1 → Task 9.2 → Task 9.3 → Task 9.4 → Task 10 rerun
```

Task 9.1 is NEXT. PR #7 remains Draft and should not merge before the final PASS handoff.

### Includes

- behavior characterization through the production assembly path;
- architecture/naming/semantic-facade checker;
- browser startup, composition, lifecycle and event-binding separation;
- one active event/day owner;
- Circle Status and pending GAS update ownership;
- production-connected Route Guidance;
- production-connected CSV/Google Sheet source workflows;
- production-connected event/day switching and local deletion;
- feature-specific DOM Views;
- deletion of original and renamed facades;
- distribution of central contracts/parsers by owner;
- clean verification and human handoff.

### Does not include

- tests/docs directory restructuring;
- broad visual changes;
- dependency addition;
- persistence, GAS, CSV, route, optimization or map contract changes.

### Canonical documents

- `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md`
- `docs/architecture/webapp-module-boundaries.md`
- `docs/architecture/webapp-naming-guidelines.md`
- `docs/plans/phase-05d/README.md`
- `docs/reviews/phase-5d-handoff.md`

## Phase 5E: tests and docs structure refactor

### Goal

After Phase 5D ownership is final, reorganize tests and docs for discoverability without changing application behavior.

### Planned scope

- place tests by feature ownership;
- normalize unit/integration/E2E names;
- organize fixtures, fakes and test helpers;
- improve package test-script readability;
- remove duplicate/obsolete tests only with preserved coverage;
- improve canonical/plan/handoff/archive navigation;
- audit stale terminology and paths;
- preserve all production public APIs and contracts.

Phase 5E may not finish missing production extraction from Phase 5D.

## Phase 5F: broad visual polish

Use the final feature-specific Views and stable tests to perform broad visual polish and UI redesign. Detailed Tasks are written after Phase 5E.

## Common gates

- implement only the selected Task;
- use TDD and focused verification;
- keep Task commits separate and independently reviewed;
- preserve private-map and sensitive-data boundaries;
- do not confuse passing regression tests with completion of an architecture goal;
- do not start the next Phase before the current handoff declares PASS.
