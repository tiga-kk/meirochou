# Phase 3 Task 3: Enforce the Source Safety Boundary

> **Depends on:** Task 2. **Scope:** Guard source-generation changes and destructive repository operations. UI controls are Phase 4.

## Goal

Create one service boundary that prevents stale previews and pending outbox entries from being bypassed by CSV replacement, GAS import/refresh, source changes, or event/day deletion.

## Files

- Create: `apps/webapp/js/state/source-settings-service.ts`
- Create: `tests/source-settings-service.test.ts`
- Modify: `apps/webapp/js/data-manager.ts` to route CSV apply through the guard
- Modify: `package.json`

## Interfaces

```ts
export class PendingOutboxError extends Error {
  readonly operation: ProtectedSourceOperation;
  readonly pendingCount: number;
  readonly entryIds: readonly string[];
}

export class StaleSourceStateError extends Error {}

export interface GuardedStateUpdate {
  readonly ref: EventDayRef;
  readonly operation: ProtectedSourceOperation;
  readonly expectedSourceGeneration: string;
  readonly nextState: LocalEventDayState;
}

export class SourceSettingsService {
  constructor(repository: EventDayRepository);
  assertCanMutate(ref: EventDayRef, operation: ProtectedSourceOperation): LocalEventDayState;
  saveGuarded(update: GuardedStateUpdate): LocalEventDayState;
  deleteEventDay(ref: EventDayRef, expectedSourceGeneration: string): void;
}
```

`saveGuarded()` must reload immediately before save and reject when:

- state is missing;
- current generation differs from `expectedSourceGeneration`;
- `nextState.sourceGeneration` is inconsistent with the operation;
- any pending outbox entry exists for a protected operation;
- `nextState` fails the runtime schema parser.

It also enforces field-level invariants rather than trusting the caller's full state object:

- every source replacement preserves `purchased`, `hold`, `history`, and `redo`, and starts with an empty outbox because pending entries are blocked;
- same-source GAS refresh preserves `source`, `sourceGeneration`, `purchased`, `hold`, `history`, `redo`, and `gasOutbox` exactly, changing only circles and source/update timestamps;
- `createdAt` never changes;
- `updatedAt` and `sourceUpdatedAt` are valid new timestamps for a successful source apply.

Generation rule:

- `csv-replacement`, `gas-initial-import`, `gas-url-change`, `sheet-name-change`, and `source-type-change` require a new generation.
- `gas-refresh-apply`, circle/activity mutation, and deletion checks do not mint a generation.

## TDD steps

- [x] **Step 1: Write a table-driven pending-lock test**

Test every `ProtectedSourceOperation`. All operations listed in the Phase overview are blocked when the current state contains an entry. Assert the error exposes count/IDs but not URL/sheet.

- [x] **Step 2: Write generation and save-failure tests**

Cover stale generation, missing state, replacement without a new generation, refresh that incorrectly changes generation, replacement/refresh that alters local activity, changed `createdAt`, schema-invalid next state, repository write failure, and successful guarded save. Every failure preserves the previous serialized state exactly.

- [x] **Step 3: Write guarded deletion tests**

Deletion succeeds only with matching generation and no pending entry. Pending/stale/storage failures leave the state and repository index intact.

- [x] **Step 4: Verify RED**

```bash
npx vitest run --root . tests/source-settings-service.test.ts
```

- [x] **Step 5: Implement the service**

Do not accept a caller-provided `SourceRef` without loading the state. The service derives source context from the validated persisted state. UI disabled state is never consulted.

- [x] **Step 6: Route Phase 2 CSV apply through `saveGuarded()`**

`DataManager.applyCsvReplacement(previewId)` continues to validate preview existence, expiry, hash, type, and expected generation. Immediately before save it calls:

```ts
sourceSettings.saveGuarded({
  ref: preview.ref,
  operation:
    current.source.type === "gas" ? "source-type-change" : "csv-replacement",
  expectedSourceGeneration: preview.expectedSourceGeneration,
  nextState,
});
```

Remove the Phase 2 restriction that apply requires the current source to be CSV. A confirmed GAS→CSV preview is a `source-type-change`, mints a new generation, clears no local activity, and is allowed only when there is no pending outbox. Add regression tests for GAS→CSV replacement and for a pending entry inserted after preview; the pending case throws `PendingOutboxError`, consumes no preview, and changes no state.

- [x] **Step 7: Verify**

```bash
npx vitest run --root . tests/source-settings-service.test.ts tests/data-manager-event-day.test.ts
npm run test:webapp
npm run check:webapp
npx biome check apps/webapp/js/state/source-settings-service.ts apps/webapp/js/data-manager.ts tests/source-settings-service.test.ts tests/data-manager-event-day.test.ts
```

- [x] **Step 8: Present commit candidate**

Proposed message: `feat(settings): guard source and deletion changes`.

## Review checklist

- Every protected operation is present in one exhaustive table.
- CSV apply cannot bypass the Phase 3 lock.
- Generation rules distinguish replacement from same-source refresh.
- Failed save/delete preserves both state value and index.
- Errors expose no sensitive source settings.
