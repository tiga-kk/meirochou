# GAS Sync and Safety Contract

This document defines the exact data synchronization, outbox queueing, error recovery, and persistence contracts implemented for Google Apps Script (GAS) integration in Phase 3.

## 1. Data Ownership and Direction

- **Local Primary**: LocalStorage is the primary source of truth for user activity (purchases, holds, history).
- **GAS Source**: Google Apps Script is a remote source for circle lists and the one-way destination for purchase state.
- **One-Way Active Flow**: User actions update LocalStorage immediately and asynchronously enqueue desired state mutations (`action: "sale"`) to the GAS outbox queue (`gasOutbox`).

## 2. GET and POST Request/Response Contracts

### GET Request (Sheet List)
- **URL**: User's deployed GAS WebApp URL with `?action=getSheets`.
- **Response Format**:
  ```json
  {
    "ok": true,
    "status": "success",
    "spreadsheetTitle": "C108 チェックリスト",
    "sheets": ["1日目・東", "2日目・東"]
  }
  ```

### GET Request (Circle Sync)
- **URL**: User's deployed GAS WebApp URL with `?sheets=<url-encoded-sheetName>` parameter.
- **Response Format**:
  ```json
  {
    "ok": true,
    "status": "success",
    "spreadsheetTitle": "C108 チェックリスト",
    "circles": [
      { "space": "東ア23a", "sheetName": "1日目・東", "priority": 10 }
    ]
  }
  ```

### POST Request (Sale Update)
- **Content-Type**: `text/plain;charset=utf-8` (to avoid CORS preflight options where possible).
- **Payload**:
  ```json
  {
    "action": "sale",
    "sheetName": "1日目・東",
    "space": "東ア23a",
    "undo": false
  }
  ```
- **Response Format**:
  ```json
  {
    "ok": true,
    "status": "success"
  }
  ```

## 3. Initial Import vs Explicit Refresh

- **Cached Startup**: Opening an existing cached event/day state performs zero network calls (no GET, no POST) upon page load.
- **Initial Import**: When importing a new GAS source for the first time, a single GET request fetches circles and initializes local state.
- **Explicit Refresh**: Subsequent synchronization requires an explicit refresh request. Automatic implicit background GET fetching is prohibited to prevent unexpected network usage.

## 4. Preview Lifetime, Fingerprinting, and Apply Failures

- **Preview Lifetime**: GAS refresh previews are held strictly in memory and are discarded on page reload or when cancelled.
- **Fingerprinting**: `sourceGeneration` identifies the source version. When previewing replacement, fingerprint matching ensures that source modifications are detected and stale previews cannot be applied.
- **Apply Failures**: If source generation or structural integrity checks fail during apply, local state remains unchanged and the preview is invalidated.

## 5. Atomic Local Mutation and Outbox Append

- **Atomic Writes**: When a purchase or cancellation is performed locally, the state mutation (updating `purchased` list, `history`, and appending to `gasOutbox`) is serialized as one repository save of the complete event/day state.
- **Local-First Reliability**: Network failures during or after the local write do not roll back local state. The outbox entry remains persisted in `gasOutbox` until successfully sent.

## 6. Outbox Processing: FIFO, Coalescing, Concurrency, and Retry

- **FIFO Queue**: `gasOutbox` entries are processed in strict First-In-First-Out order per event/day.
- **Coalescing**: Sequential pending actions on the same circle space with `attempts === 0` within the same source generation are coalesced into a single entry representing the latest desired state.
- **Concurrency Control**: Outbox processing for a given event/day is serialized using in-flight promise locks to prevent duplicate concurrent network requests.
- **Startup and Online Retry**: `GasSyncCoordinator` triggers outbox processing on application startup and whenever a browser `online` event is received.

## 7. Pending Locks and Discard Safety

- **Source Modification Guard**: `SourceSettingsService` prevents changing GAS source URLs or sheet names, or deleting an event/day, while un-synced entries exist in `gasOutbox`.
- **Discard Consequence**: Discarding pending outbox entries permanently drops unsent remote mutations while retaining local LocalStorage state.

## 8. Idempotence and Failure Diagnostics

- **Idempotent Remote Operations**: GAS POST updates set explicit desired state (`purchased: true/false` via `undo: false/true`), ensuring idempotent execution even if retried multiple times.
- **Remote Success / Local Save Failure**: An outbox entry is removed only after the POST succeeds and the subsequent repository save succeeds. If that local save fails after a remote success, the entry remains pending and may be retried; the desired-state POST is safe to repeat.
- **Safe Diagnostics**: Remote errors are classified and redacted into safe error categories (`http-<status>`, `network`, `timeout`, `server-contract`) stored in `lastError`.

## 9. Diagnostics and Sensitive Data Handling

- **No Secret Leakage**: Raw error tracebacks, URLs containing credentials, or sensitive user headers are redacted before storing or displaying diagnostic logs.
- **LocalStorage Boundaries**: All state is stored under key prefixes `comipath:v1:<eventId>:<dayId>:state` and indexed in `comipath:v1:index:event-days`.

## 10. Non-UI Service Interfaces for Phase 4

Phase 3 implements the complete background sync engine via service classes:
- `GasApiClient`: Low-level HTTP transport and contract parsing.
- `GasOutboxService`: Persistent queue append, coalescing, and FIFO processing.
- `GasRefreshService`: Memory-bound preview generation and replacement.
- `PurchaseMutationService`: Local-first purchase, hold, undo/redo, and outbox atomic mutations.
- `SourceSettingsService`: Source generation guards and deletion locks.
- `GasOutboxService`: FIFO processing, retry bookkeeping, and explicit discard of selected pending entries.
- `GasSyncCoordinator`: Startup and online event retry management.

Phase 4 will attach management UI forms and outbox status indicators to these underlying service methods.
