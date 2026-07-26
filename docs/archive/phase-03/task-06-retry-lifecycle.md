# Phase 3 Task 6: Retry Every Pending Event/Day on Startup and Online Recovery

> **Depends on:** Tasks 2 and 5. **Scope:** Scheduling/orchestration only. Do not add Phase 4 outbox UI.

## Goal

Process every persisted queue after App has safely opened local state, and again when the browser returns online, without blocking startup or creating duplicate listeners/sends.

## Files

- Create: `apps/webapp/js/state/gas-sync-coordinator.ts`
- Create: `tests/gas-sync-coordinator.test.ts`
- Modify: `apps/webapp/js/data-manager.ts`
- Modify: `apps/webapp/js/app.js`
- Modify: `tests/purchase-flow.test.ts`
- Modify: `package.json`

## Interfaces

```ts
export interface GasSyncSummary {
  readonly processedRefs: number;
  readonly sent: number;
  readonly pending: number;
  readonly failures: readonly { ref: EventDayRef; category: string }[];
}

export interface OnlineEventTarget {
  addEventListener(type: "online", listener: () => void): void;
  removeEventListener(type: "online", listener: () => void): void;
}

export class GasSyncCoordinator {
  constructor(
    repository: EventDayRepository,
    outbox: GasOutboxService,
    onlineTarget: OnlineEventTarget,
  );
  start(): void;
  processAll(): Promise<GasSyncSummary>;
  dispose(): void;
}
```

`start()` registers once and schedules (does not await) one `processAll()`. The coordinator has a single in-flight `processAll` promise so startup, online bursts, and manual retry share work rather than duplicate it.

## Processing rules

- Enumerate `repository.list()` on each new processing run; do not cache refs.
- Load each ref and skip missing/empty/CSV queues.
- Process refs in deterministic eventId/dayId order.
- A failure for one ref is recorded and processing continues with the next ref.
- Return only safe categories, never URLs/sheets/error bodies.
- `dispose()` removes the exact registered listener. It does not cancel an already-sent POST or discard queue state.

## TDD steps

- [x] **Step 1: Write lifecycle tests with a fake event target**

Cover start-once, listener registration, initial deferred processing, online processing, online burst coalescing, dispose, and no processing after dispose.

- [x] **Step 2: Write multi-ref tests**

Create pending states for `C108/day1`, `C108/day2`, and `C109/day1`, with a failure in the middle. Assert deterministic order, later-ref continuation, aggregate counts, and isolation.

- [x] **Step 3: Write App startup ordering test**

Assert:

1. event registry/map bootstrap completes;
2. local event/day opens and UI initializes;
3. `coordinator.start()` is called;
4. App init resolves without waiting for network.

Opening cached GAS state still performs zero GET calls; only pending POST processing may start.

- [x] **Step 4: Verify RED**

```bash
npx vitest run --root . tests/gas-sync-coordinator.test.ts tests/purchase-flow.test.ts
```

- [x] **Step 5: Implement coordinator and dependency injection**

App constructs or receives the coordinator once. Add an App cleanup hook for tests/page lifecycle that calls `dispose()`. Do not attach anonymous `online` callbacks that cannot be removed.

- [x] **Step 6: Expose manual retry without UI assumptions**

`DataManager` or App exposes a typed `retryAllPending(): Promise<GasSyncSummary>` for Phase 4. It must delegate to the same coordinator, not create a parallel loop.

- [x] **Step 7: Verify**

```bash
npx vitest run --root . tests/gas-sync-coordinator.test.ts tests/gas-outbox-service.test.ts tests/purchase-flow.test.ts
npm run verify
npx biome check
npm run test:e2e
```

- [x] **Step 8: Present commit candidate**

Proposed message: `feat(sync): retry pending GAS updates on reconnect`.

## Review checklist

- Every repository ref, not only the active ref, is processed.
- One failing ref does not starve other refs.
- Startup is local-first and non-blocking.
- Listener and in-flight promise lifetimes are deterministic.
- Manual retry and automatic retry use one coordinator.
