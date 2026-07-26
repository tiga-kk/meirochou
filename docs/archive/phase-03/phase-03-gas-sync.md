# Phase 3: GAS Sync and Safety Implementation Plan

> **For agentic workers:** This file is the Phase 3 contract and execution index. Implement one linked Task document at a time with `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Do not combine Task commits.

**Goal:** GAS-backed event/dayだけを明示更新し、購入状態をLocalStorageへ確定してからsource-bound outboxで安全に一方向POSTする。

**Architecture:** `GasApiClient` owns transport and runtime response validation. `GasOutboxService` owns persistent delivery state, `SourceSettingsService` owns source-generation changes and destructive-operation locks, `GasRefreshService` owns short-lived GET previews, and `GasSyncCoordinator` owns startup/online retry scheduling. `DataManager` coordinates these services but does not call `fetch` or mutate LocalStorage directly.

**Tech Stack:** TypeScript 7 strict、Vitest 4、Fetch API、existing `EventDayRepository`、Google Apps Script V8、Playwright mobile Chromium。

## Entry gate

Do not start Phase 3 until all conditions are true:

- Phase 2 Task 8 is committed and `docs/status/progress.md` says Phase 2 complete.
- `npm ci`, `npm run verify`, `npx biome check`, and `npm run test:e2e` pass on the Phase 2 branch.
- The Phase 3 branch is created from the approved Phase 2 result, not from an older Task 6/7 commit.
- Existing unrelated changes are identified and excluded from every Task's stage/commit.

Recommended branch: `feature/gas-sync-safety`.

## Non-negotiable contracts

### Local authority and network direction

- LocalStorage remains the single-device authority.
- Opening cached state never performs GAS GET. GET occurs only for initial GAS import preview or explicit refresh preview.
- A purchase-state change and its outbox entry are written in one repository save. GAS POST begins only after that save succeeds.
- POST failure never rolls back purchase state. The entry remains in `gasOutbox` with attempts and a diagnostic error.
- Hold changes and hold history never create a GAS entry.
- Retry uses only the URL, sheet, event/day, and source generation captured by the entry.

### Source and preview safety

- `GasDataSource` is exactly `{ type: "gas"; gasUrl: string; sheetName: string }`. Do not add a parallel `url` property or separate source shape.
- Initial GAS import is a source replacement from the Phase 2 empty CSV sentinel. It is not a special write path that bypasses source locks.
- CSV replacement, GAS initial import, GAS refresh apply, source type/URL/sheet changes, and event/day deletion recheck the current state immediately before save.
- A preview is applied only by service-issued `previewId`; apply checks target ref, expected source generation, snapshot hash, expiry, and pending-outbox lock.
- `sourceGeneration` changes for initial GAS import and source replacement, but not for a refresh of the same GAS URL/sheet.

### Retry and concurrency

- Queue processing is FIFO per event/day.
- At most one `process(ref)` may run for a ref. A second call returns the same in-flight promise; it must not send a duplicate POST.
- Failure stops that ref at the first failed entry, but does not prevent other event/day queues from processing.
- Startup and `online` processing enumerate `repository.list()` and process every state with pending entries. They do not limit retry to the currently open event/day.
- Online bursts are coalesced by `GasSyncCoordinator`; event listeners are registered once and removed by `dispose()`.

### Idempotence and partial failure

- Sale POST is an idempotent desired-state assignment (`purchased: true/false` represented as `undo: false/true`), not a toggle.
- If remote POST succeeds but removing the queue entry from LocalStorage fails, the entry remains pending and may be sent again. This is safe because the GAS operation assigns the same desired state.
- Outbox coalescing may replace only a never-attempted tail entry for the same event/day/source generation/sheet/space. Attempted entries remain for diagnosis.

## Shared Phase 3 types

These types are introduced once and reused verbatim in Task documents:

```ts
export interface GasOutboxResult {
  readonly sent: number;
  readonly pending: number;
  readonly error: Error | null;
}

export interface PurchaseMutationResult {
  readonly state: LocalEventDayState;
  readonly pendingCount: number;
  readonly queuedEntryId: string | null;
}

export type ProtectedSourceOperation =
  | "csv-replacement"
  | "gas-initial-import"
  | "gas-refresh-apply"
  | "gas-url-change"
  | "sheet-name-change"
  | "source-type-change"
  | "circles-delete"
  | "activity-delete"
  | "event-day-delete";

export interface GasRefreshPreview {
  readonly previewId: string;
  readonly ref: EventDayRef;
  readonly mode: "initial" | "replacement" | "refresh";
  readonly replacementOperation:
    | "gas-initial-import"
    | "gas-url-change"
    | "sheet-name-change"
    | "source-type-change"
    | null;
  readonly expectedSourceGeneration: string;
  readonly expectedSnapshotHash: string;
  readonly source: GasDataSource;
  readonly spreadsheetTitle: string;
  readonly diff: SourceDiff;
  readonly fetchedAt: string;
  readonly expiresAt: string;
}
```

Do not add `refreshedAt` to `LocalEventDayState` in Phase 3. `timestamps.sourceUpdatedAt` is the successful apply timestamp. Adding another persisted field requires a separately planned schema version migration.

## Task order

| Task | Plan | Deliverable | Depends on |
|---|---|---|---|
| 1 | [Typed GAS transport](phase-03/task-01-gas-api-client.md) | injected fetch, timeout, response/error parsers | Phase 2 |
| 2 | [Persistent outbox](phase-03/task-02-gas-outbox.md) | FIFO source-bound queue and per-ref mutex | Task 1 |
| 3 | [Source safety boundary](phase-03/task-03-source-settings.md) | locks and guarded source/delete operations | Task 2 |
| 4 | [GAS refresh previews](phase-03/task-04-gas-refresh.md) | initial/refresh GET preview and stale-safe apply | Tasks 1, 3 |
| 5 | [Local-first mutations](phase-03/task-05-purchase-mutations.md) | purchase/cancel/undo/redo/reset with atomic outbox save | Tasks 2, 3 |
| 6 | [Retry lifecycle](phase-03/task-06-retry-lifecycle.md) | startup/online processing for every event/day | Tasks 2, 5 |
| 7 | [Public GAS contract](phase-03/task-07-public-gas-contract.md) | exact sheet validation and idempotent POST | Task 1 |
| 8 | [Browser integration](phase-03/task-08-browser-integration.md) | persistence/retry/safety E2E without Phase 4 UI | Tasks 4–7 |
| 9 | [Documentation and exit gate](phase-03/task-09-documentation.md) | public sync docs, audits, fresh verification | Tasks 1–8 |

Tasks are sequential unless the user explicitly approves otherwise. Task 7 may be developed after Task 1, but it must be integrated and verified with Tasks 2–6 before Task 8.

## Target module ownership

```text
apps/webapp/js/api/gas-api-client.ts          transport only
apps/webapp/js/data/gas-refresh-service.ts    GET preview/apply only
apps/webapp/js/state/gas-outbox-service.ts    queue persistence/delivery only
apps/webapp/js/state/source-settings-service.ts source/delete safety only
apps/webapp/js/state/gas-sync-coordinator.ts  lifecycle scheduling only
apps/webapp/js/data-manager.ts                 application orchestration
apps/webapp/js/app.js                          browser lifecycle hookup
integrations/gas-spreadsheet/src/*.js          public server contract
```

`apps/webapp/js/state/sync-queue.ts` is a Phase 1 legacy utility. Phase 3 either removes it in the Task that proves it has no consumers or leaves it unused; it must not become a second source of queue truth beside `LocalEventDayState.gasOutbox`.

## Per-Task verification baseline

Every Task runs its focused RED/GREEN commands plus:

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npx biome check
git diff --check
git status --short --branch
```

Tasks 5, 6, 7, and 8 also run `npm run verify`. Tasks that affect purchase, settings, network lifecycle, or browser integration run `npm run test:e2e`. A Task must not update existing image snapshots unless its plan explicitly names the new visual behavior; Phase 3 has no visual redesign.

## Phase 3 exit gate

- Opening cached CSV or GAS state causes zero GET requests.
- Initial GAS import, GAS source replacement, and explicit refresh all require preview confirmation.
- Every preview apply rejects stale generation, stale snapshot, expiry, target mismatch, and pending outbox without changing state.
- Purchase, cancellation, purchase undo/redo, and purchase reset preserve local truth and enqueue the correct desired GAS state.
- Holds never enqueue.
- Reload and `online` retry every pending event/day without duplicate concurrent sends.
- URL, sheet, type, replacement, activity deletion, circle deletion, and event/day deletion are blocked while affected outbox entries exist.
- Public GAS rejects missing/duplicate required headers, duplicate spaces, missing sheet, and ambiguous update requests with row/sheet-aware errors.
- `Code.gs` is deterministic and matches its source.
- `npm ci`, `npm run verify`, `npx biome check`, `npm run test:e2e`, public-tree audit, and credential audit pass with recorded results.

## Review focus for the whole phase

- No service bypasses `EventDayRepository` for persisted state.
- No UI-disabled state is treated as the security/safety boundary.
- No log or error includes full GAS URLs, request bodies, or spreadsheet content.
- No `any`, unparsed `response.json()`, fabricated `SourceRef`, or second outbox store is introduced.
- Every error path states which local data remains unchanged.
