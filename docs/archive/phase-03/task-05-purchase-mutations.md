# Phase 3 Task 5: Make Purchase Mutations Local-First and Queue-Safe

> **Depends on:** Tasks 2 and 3. **Scope:** Local purchase-state transitions and outbox creation. Automatic startup/online retry is Task 6.

## Goal

Ensure every user-visible purchase change succeeds at the LocalStorage boundary first. For GAS sources, the desired remote state is included in the same repository save as the local mutation; POST is always later. CSV sources never enqueue.

## Files

- Create: `apps/webapp/js/state/purchase-mutation-service.ts`
- Create: `tests/purchase-mutation-service.test.ts`
- Create: `tests/purchase-flow.test.ts`
- Modify: `apps/webapp/js/data-manager.ts`
- Modify: `apps/webapp/js/app.js`
- Modify: `apps/webapp/js/types/domain.ts` if the shared result is not already present
- Modify: `package.json`

## Interfaces

```ts
export class PurchaseMutationService {
  constructor(repository: EventDayRepository, outbox: GasOutboxService);
  setPurchased(ref: EventDayRef, space: string, purchased: boolean, now: string): PurchaseMutationResult;
  undo(ref: EventDayRef, now: string): PurchaseMutationResult | null;
  redo(ref: EventDayRef, now: string): PurchaseMutationResult | null;
  resetActivity(ref: EventDayRef, now: string): PurchaseMutationResult;
}
```

`DataManager` exposes:

```ts
setPurchased(space: string, purchased: boolean): PurchaseMutationResult;
undoLastAction(): ActionHistoryEntry | null;
redoAction(): ActionHistoryEntry | null;
resetAll(): string[];
flushActiveOutbox(): Promise<GasOutboxResult>;
```

Existing App callers may keep `addPurchased()` as a temporary wrapper that calls `setPurchased(space, true)`, but new tests use `setPurchased`.

## Required state transitions

| Action | Local result | GAS desired state |
|---|---|---|
| purchase | add to `purchased`, append purchase history, clear redo | `true` |
| explicit cancel | remove from `purchased`, append `unpurchase`, clear redo | `false` |
| undo purchase | remove purchase, move original history entry to redo | `false` |
| redo purchase | restore purchase/history | `true` |
| hold / undo hold / redo hold | mutate hold/history only | no entry |
| reset all activity | clear purchased/hold/history/redo | one `false` desired state per previously purchased GAS space |

No-op transitions (purchase already true, cancel already false, empty undo/redo) perform no save and enqueue nothing.

## Atomicity rule

For a GAS source:

1. Load and validate current state/ref/space.
2. Build the local transition.
3. Call `outbox.append()` for the desired purchase state(s).
4. Call `repository.save()` exactly once with both changes.
5. Only after save succeeds, update `DataManager` memory and allow asynchronous processing.

If any step before save fails, memory, persisted state, and network calls remain unchanged.

## TDD steps

- [x] **Step 1: Write table-driven CSV/GAS mutation tests**

For each transition above, assert purchased/hold/history/redo, queue count, desired boolean, timestamps, source generation, and immutability. Test removed-from-source rows remain addressable for undo/reset history but cannot be newly selected through the active map list.

- [x] **Step 2: Write save-before-send integration test**

Use a repository adapter and fake client. At the moment `sendSaleUpdate` is called, assert the repository already contains both the new purchase state and queue entry. Reject POST; assert the purchase remains and the queue records the failure.

- [x] **Step 3: Write storage-failure tests**

Make the repository save throw. Assert:

- zero client calls;
- old serialized state remains;
- `DataManager.activeState`, `purchasedList`, history, and redo remain old;
- App reports a local-save diagnostic rather than a successful purchase toast.

- [x] **Step 4: Write undo/redo/reset queue tests**

Include mixed purchase/hold history, two purchased spaces, tail coalescing, and a prior attempted queue entry. Reset must not discard pre-existing entries and must not enqueue hold changes.

- [x] **Step 5: Verify RED**

```bash
npx vitest run --root . tests/purchase-mutation-service.test.ts tests/purchase-flow.test.ts
```

- [x] **Step 6: Implement the pure transition helpers and one-save boundary**

Keep mapping from `HistoryEntry` to legacy `ActionHistoryEntry` in `DataManager`. Do not modify `sourceGeneration` or `sourceUpdatedAt`; only `timestamps.updatedAt` changes.

- [x] **Step 7: Update App without awaiting remote completion**

`handleAction`, undo, redo, and reset update the UI after local save. After a successful GAS-backed mutation, call `void this.dm.flushActiveOutbox()` and show a pending diagnostic only if processing later reports failure. Do not roll back or block navigation on POST.

- [x] **Step 8: Verify**

```bash
npx vitest run --root . tests/purchase-mutation-service.test.ts tests/purchase-flow.test.ts tests/data-manager-event-day.test.ts
npm run verify
npx biome check
npm run test:e2e
```

Existing baseline snapshots must remain unchanged.

- [x] **Step 9: Present commit candidate**

Proposed message: `feat(sync): queue purchases after local commit`.

## Review checklist

- Local mutation and queue append cannot be separated by a failing save.
- Every purchase cancellation path queues `false`; every hold path queues nothing.
- POST is desired-state/idempotent, never a toggle.
- Storage failure cannot produce a success toast or network call.
- Existing map/navigation behavior and snapshots remain stable.
