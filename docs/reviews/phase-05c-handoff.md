# Phase 5C Handoff

## Integrated commit range

- Base commit: `b731e8e0a14cb80d27551630f79d4a8cadff046c` (main)
- Feature branch: `feature/phase5c`
- Implemented/reviewed tasks: Phase 5C Tasks 1-10; Task 11 partial implementation reviewed and blocked
- Task 9 CI snapshot correction: CI browser container generated the mobile snapshots in this handoff diff.

## Storage schema version and migration

- Schema version: `v2` (circle states: `pending`, `purchased`, `held`, `excluded`)
- Key format: `comipath:v2:event-day:<eventId>:<dayId>`
- Backward compatibility: Preserved legacy `v1` reading & auto-migration.

## Circle state contract

- Allowed states: `pending`, `purchased`, `held`, `excluded`
- State transition actions:
  - `purchase`: mark circle as `purchased`
  - `hold`: mark circle as `held`
  - `exclude`: mark circle as `excluded`
  - `unpurchase` / `unhold` / `unexclude`: revert to `pending`
- Single-level undo service supported with TTL (`CircleStateUndoService`).

## Navigation state contract

- `NavigationStage`: `idle` | `navigating` | `atTarget`
- `LockedLeg`: `{ from: RouteEndpointId, toSpace: string }`
- `ConfirmedPosition`: `{ areaId, gridIndex, svgX, svgY, source }`
- Initial selection: Nearest walkable cell from start tap location within snap distance.

## Worker message contract

- Job stage: `time-decayed-alns` (superseded `top-tw`)
- Messages:
  - `{ type: "progress", jobId, elapsedMs, searchTimeLimitMs, best }`
  - `{ type: "complete", jobId, best }`
  - `{ type: "cancelled", jobId, best }`
  - `{ type: "error", jobId, code }`
- Stale `jobId` responses are ignored by the controller.

## Distance matrix cache key and storage contract

- Key format: `buildDistanceMatrixCacheKey` (content-addressable, grid/endpoints/version driven; independent of eventId/dayId)
- Storage key: `comipath:matrix:<cacheKey>`
- Reference key: `comipath:matrix-ref:<eventId>:<dayId>`
- `QuotaExceededError` safe fallback to in-memory computation.

## Time-Decayed ALNS adapter contract

- Profile version: `v1.0.0`
- Half-lives: `[1800, 3600, 7200]` seconds (equal weights: `1/3`, `1/3`, `1/3`)
- Travel time: `travelTimeSec = weightedDistance * secondsPerWeightedDistance[areaId]`
  - Coefficients: `e456`: 0.13184, `e7`: 0.11288, `s12`: 0.15066, `w12`: 0.12425
- Service time: normal circles `30s`, wall circles `200s`, default fallback `30s`
- Value: `max(0, priority ?? 0)`

## Optimization time settings

- Search time limit: `5000ms`, `10000ms`, `15000ms`
- Default: `10000ms` (10 seconds)

## Arrival and hold behavior

- `Arrival`: Moves `currentPosition` to target circle location
- `Purchase then next`: Marks current target as `purchased` and proceeds to next candidate immediately
- `Before-arrival hold`: Moves target to next candidate while preserving `currentPosition` at last confirmed position
- `Manual target selection`: Updates target without invalidating or regenerating distance matrix

## Per-map behavior

- Independent session per area (`MapSession`)
- Navigation clears on area switch; distance matrix & best order cache retained when returning to previously visited area.

## Reload recovery

- Storage key: `comipath:nav-snapshot:<eventId>:<dayId>`
- Snapshot contains: `eventId`, `dayId`, `areaId`, `bundleVersion`, `matrixRef`, `navState`, `optimizationTimeLimitMs`, `savedAt`
- Excludes: Worker process, pending Promises, transient timer states, Undo tokens
- Validation: Safe resume rejected if bundle mismatches or target circle becomes `purchased`/`excluded`.
- Runtime status: **BLOCKER**. `App` currently passes the repository to `StorageDeletionService`, but does not load snapshots on startup, show a resume dialog, rebuild route geometry, or start warm-start navigation from a validated snapshot.

## Deletion scopes

- `Reset activity`: Clears circle states and navigation snapshot; **retains** distance matrix
- `Delete event-day`: Clears circle states, navigation snapshot, and **deletes** distance matrix
- `Delete all events`: Clears all event states, navigation snapshots, and **deletes** all distance matrices
- GAS outbox is preserved safely without unconfirmed entry data loss.

## GAS safety verification

- Outbox entry lock during sync
- Failure-safe rollback on network or timeout errors
- Offline queueing supported.

## Unit/integration/E2E results

- Webapp unit & integration test suite: 46 files, 454 tests **PASS**
- Full Playwright E2E: 34 passed, 8 skipped (C108 smoke is opt-in)
- C108 browser smoke: 4 desktop + 4 mobile tests **PASS**
- Verification script (`audit-public-tree.mjs`): **PASS**
- TypeScript check (`check:webapp`): **PASS**
- Vite build (`build:webapp`): **PASS**

## C108 smoke results

- C108 real browser smoke passed for all four areas on desktop Chromium and mobile Chromium (8 tests total).

## Accessibility results

- Interactive elements maintain touch targets >= 44px
- Keyboard navigation (Tab, Escape close) verified
- No horizontal scroll overflow in portrait view

## Public boundary result

- Clean separation between public assets and private repository data verified via `audit-public-tree.mjs`.

## Known limitations

- Host-side E2E execution may require a writable Vite/test-results directory; CI snapshots were generated in the CI Playwright container to avoid browser/font/layout drift.
- **BLOCKER:** App runtime does not yet connect validated navigation snapshots to reload/resume, route geometry reconstruction, or warm-start.
- **Task 11 review:** The added controller/dialog tests pass in isolation, but `App` does not import or instantiate them, and the added E2E does not seed or assert a snapshot. The Task 11 acceptance criteria therefore remain unmet.

## Deferred work

- Phase 5D: Multi-map routing optimization and global event scheduling.
