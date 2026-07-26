# Phase 3 Task 2: Implement the Persistent Source-Bound Outbox

> **Depends on:** Task 1. **Scope:** Queue persistence and delivery only; do not yet change App purchase/undo behavior or register `online` listeners.

## Goal

Provide a single queue implementation backed by `LocalEventDayState.gasOutbox`, with deterministic FIFO delivery, per-ref concurrency control, safe tail coalescing, and diagnosable failures.

## Files

- Create: `apps/webapp/js/state/gas-outbox-service.ts`
- Create: `tests/gas-outbox-service.test.ts`
- Modify: `apps/webapp/js/state/storage-schema.ts` only if stricter existing-entry validation is required
- Modify: `apps/webapp/js/types/domain.ts` only for shared result types
- Modify: `package.json`
- Remove only if proven unused: `apps/webapp/js/state/sync-queue.ts`
- Modify only if the legacy file is removed: `tests/sync-queue.test.ts` and the test script

## Interfaces

```ts
export interface GasOutboxServiceOptions {
  readonly createId?: () => string;
}

export interface AppendedOutboxState {
  readonly state: LocalEventDayState;
  readonly entry: GasOutboxEntry;
}

export class GasOutboxService {
  constructor(
    repository: EventDayRepository,
    client: GasApiClient,
    options?: GasOutboxServiceOptions,
  );

  append(
    state: LocalEventDayState,
    ref: EventDayRef,
    space: string,
    purchased: boolean,
    now: string,
  ): AppendedOutboxState;

  process(ref: EventDayRef): Promise<GasOutboxResult>;
  list(ref: EventDayRef): readonly GasOutboxEntry[];
  pendingCount(ref: EventDayRef): number;
  discard(ref: EventDayRef, ids: readonly string[], now: string): LocalEventDayState;
}
```

`append()` is pure with respect to storage: it returns a new state so Task 5 can save purchase state and queue entry together. It must reject CSV sources and a ref that differs from the entry state context.

## Delivery algorithm

1. `process(ref)` returns the existing in-flight promise when that ref is already processing.
2. Load the latest state before each entry.
3. Take the first FIFO entry and send its captured URL/sheet/space/desired state.
4. On success, reload current state and remove only the same entry ID. Preserve entries appended while the request was in flight.
5. On failure, reload and update only that entry's `attempts` and redacted `lastError`, then stop this ref.
6. Continue until empty. Return `{sent,pending,error}`.
7. Clear the in-flight map in `finally`.

If saving success/failure metadata fails, reject with the storage error and leave the last persisted queue untouched.

## TDD steps

- [ ] **Step 1: Write pure append/coalescing tests**

Cover exact source capture, immutable input, unique ID injection, FIFO order, and CSV rejection. Coalesce only when the tail entry has `attempts === 0` and all of `eventId/dayId/sourceGeneration/gasUrl/sheetName/space` match. A coalesced tail keeps its original ID and `createdAt`, and replaces only `purchased`.

- [ ] **Step 2: Write process tests**

Use an in-memory repository and fake client. Cover:

- two successful FIFO sends;
- first failure increments attempts and stops before the second;
- next call retries the failed first entry;
- a newly appended entry during an awaited send is preserved;
- two concurrent calls for one ref share one promise/send sequence;
- two different refs process independently;
- captured URL/sheet are used even if another state is active;
- remote success plus queue-removal save failure leaves the entry retriable.

- [ ] **Step 3: Write discard tests**

Reject unknown/duplicate requested IDs rather than silently discarding a partial selection. An empty ID list is a no-op. Preserve source, circles, purchase, hold, history, and timestamps other than `updatedAt`.

- [ ] **Step 4: Verify RED**

```bash
npx vitest run --root . tests/gas-outbox-service.test.ts
```

- [ ] **Step 5: Implement without a second storage key**

Use `EventDayRepository.load/save`; do not use `StorageService`, `localStorage`, or the legacy generic `SyncQueue`. Store only redacted error categories such as `network`, `timeout`, `http-429`, `server-contract`, or `storage`; never `error.stack`, response body, or endpoint URL.

- [ ] **Step 6: Decide the legacy queue file from evidence**

Run:

```bash
rg -n "SyncQueue|sync-queue" apps tests package.json
```

If Task 2 leaves no consumer outside its own legacy test, remove the file/test and update `package.json` in this Task. Otherwise leave it unchanged and record the remaining consumer; do not maintain two active outbox paths.

- [ ] **Step 7: Verify**

```bash
npx vitest run --root . tests/gas-outbox-service.test.ts tests/storage-schema.test.ts tests/event-day-repository.test.ts
npm run test:webapp
npm run check:webapp
npx biome check apps/webapp/js/state/gas-outbox-service.ts tests/gas-outbox-service.test.ts
```

- [ ] **Step 8: Present commit candidate**

Proposed message: `feat(sync): persist source-bound GAS outbox`.

## Review checklist

- `append()` and a purchase mutation can be saved atomically in one repository write.
- Processing does not drop entries added during network await.
- Per-ref duplicate processing is impossible.
- Redacted diagnostics remain useful without leaking endpoint data.
- Queue truth exists only in `LocalEventDayState.gasOutbox`.
