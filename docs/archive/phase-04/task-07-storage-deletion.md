# Phase 4 Task 7: Implement Failure-Safe Scoped Local Data Deletion

> **Depends on:** Tasks 1, 2, 4, 5, and 6. **Scope:** Four documented scopes, service-side pending locks, confirmation dialog, and active-ref fallback.

## Goal

Let users delete exactly the intended LocalStorage scope without bypassing pending GAS work or leaving index/last-opened/display state inconsistent.

## Files

- Create: `apps/webapp/js/state/storage-deletion-service.ts`
- Create: `tests/storage-deletion-service.test.ts`
- Create: `apps/webapp/js/components/storage-delete-dialog.ts`
- Create: `tests/storage-delete-dialog.test.ts`
- Create: `tests/storage-deletion-app.test.ts`
- Modify: `apps/webapp/js/components/comipath-settings.ts`
- Modify: `apps/webapp/js/app.js`
- Modify: `apps/webapp/js/state/event-day-repository.ts`
- Modify: `tests/event-day-repository.test.ts`
- Modify: `apps/webapp/js/state/source-settings-service.ts`
- Modify: `tests/source-settings-service.test.ts`
- Modify: `apps/webapp/js/ui/management-view-model.ts`
- Modify: `tests/management-view-model.test.ts`
- Modify: `apps/webapp/css/modals.css`
- Modify: `package.json`

## Service interfaces

```ts
export interface StorageDeletionResult {
  readonly deletedRefs: readonly EventDayRef[];
  readonly activeRefDeleted: boolean;
}

export type StorageRollbackKey = "state" | "index" | "last-opened";

export interface StorageRollbackReport {
  readonly attempted: true;
  readonly failedKeys: readonly StorageRollbackKey[];
}

export class StorageDeletionService {
  constructor(
    repository: EventDayRepository,
    sourceSettings: SourceSettingsService,
    createSourceGeneration: () => string,
  );
  delete(scope: DeleteScope, now: string): StorageDeletionResult;
}

export class EventDayRepository {
  listForDeletionStrict(): readonly {
    readonly ref: EventDayRef;
    readonly state: LocalEventDayState;
  }[];
  deleteAllFailureSafe(
    expected: readonly {
      readonly ref: EventDayRef;
      readonly sourceGeneration: string;
    }[],
  ): void;
}
```

`listForDeletionStrict()` rejects malformed/non-array index JSON, duplicate or
invalid refs, missing state keys, and schema-invalid states. It must not filter
bad entries the way the normal recovery-oriented `list()` method does.
`deleteAllFailureSafe()` rechecks the exact ref/generation set before its first
write, snapshots every affected raw state plus index and last-opened, and
attempts rollback for every key after any failure.

Extend `StorageWriteError` with an optional frozen `rollbackReport`. It exposes
only the safe key categories above, never raw serialized values or storage
keys. An empty `failedKeys` means rollback completed; non-empty values require
the no-active-data diagnostic and must not be reported as successful deletion.

Update `DeleteOptionInput` to distinguish the selected ref from all refs:

```ts
export interface DeleteOptionInput {
  readonly selected: EventDayRef;
  readonly eventDayCount: number;
  readonly activeCircleCount: number;
  readonly activityCount: number;
  readonly selectedPendingCount: number;
  readonly totalPendingCount: number;
}
```

The first three scopes use `selectedPendingCount`; `all-events` uses
`totalPendingCount`.

## Exact state results

### `circles`

- Require matching state and no pending outbox.
- Save a new empty CSV sentinel `{type:"csv",fileName:"empty.csv"}`.
- Mint one new source generation.
- Clear `circles` and set `sourceUpdatedAt/updatedAt=now`.
- Preserve purchased, hold, history, and redo so users can delete/import source data independently from activity. The empty map list simply cannot display those spaces until a later source contains them.
- Treat `circles-delete` as a replacement operation in
  `SourceSettingsService`; it must require a new generation and a newer
  `updatedAt/sourceUpdatedAt`.

### `activity`

- Require no pending outbox.
- Preserve source, generation, circles, and `sourceUpdatedAt`.
- Clear purchased, hold, history, and redo; set only `updatedAt=now`.

### `event-day`

- Require no pending outbox and delete the state/index entry through the guarded repository method.
- If `last-opened` equals the deleted ref, clear it in the same
  rollback-protected repository operation. A later successful fallback commit
  writes the new ref; a failed fallback leaves `last-opened` absent rather
  than pointing at deleted data.

### `all-events`

- Preflight every indexed state before deleting any. If any state is unreadable or has pending entries, delete nothing.
- After strict service preflight, call
  `EventDayRepository.deleteAllFailureSafe(expectedRefs)`. The repository,
  which owns the storage keys, rechecks the exact refs/generations, snapshots
  all affected serialized state/index/last-opened values, and then deletes.
  On a write failure it attempts rollback and throws a `StorageWriteError`
  whose safe metadata states whether rollback also failed.
- This is the only scope requiring the exact phrase `全イベントを削除`.
- On success, App activates the registry default through the atomic transition
  path, creating a new empty sentinel state/index/last-opened. Thus
  `all-events` deletes every pre-existing event/day; it does not promise that
  storage remains permanently empty while the app is running.

## Dialog contract

- Present the chosen scope, event/day display names, what is preserved, and pending-state guidance.
- `circles`, `activity`, and `event-day` require a checked acknowledgement plus an explicit delete button.
- `all-events` additionally requires exact text `全イベントを削除`.
- Emit only `storage-delete-request`; never call the service.
- Reuse Task 5 focus/inert helper. Failure keeps the dialog open and focuses the alert.
- Pending guidance links the user to the Task 6 retry/discard surface; the
  dialog itself cannot discard or override pending work.

## TDD steps

- [ ] **Step 1: Write service state-transition tests**

Cover every resulting field for all four scopes, unrelated-ref isolation, generation/timestamp rules, missing ref, active-ref flag, and immutable inputs.

Add repository tests for strict listing and `deleteAllFailureSafe`: success,
malformed index JSON, invalid/duplicate ref, missing state, invalid state
schema, changed generation after preflight, failure on each state removal,
index removal, active-ref last-opened clearing, unrelated last-opened
preservation, last-opened removal failure, and rollback failure reporting.
`StorageDeletionService` must not access `StorageService` or construct
repository key strings itself.

- [ ] **Step 2: Write pending/preflight/rollback tests**

Assert selected scopes use the selected ref pending count, all-events uses every
strictly loaded ref, and unrelated-ref pending entries do not block a selected
scope. Assert all-events blocks if any ref is pending/unreadable and a failure
on the second deletion restores the first state/index/last-opened. No partial
success is reported. Add `SourceSettingsService` tests proving
`circles-delete` requires a new generation/newer timestamps while
`activity-delete` preserves source and generation.

- [ ] **Step 3: Write dialog render/focus/event tests**

Cover exact event/day labels, preservation explanations, acknowledgement, strong phrase, cancel/Escape, focus trap/return, busy state, and failure alert.

- [ ] **Step 4: Write active-ref fallback tests**

After successful active event-day/all deletion, App selects the registry
default through Task 2 transition. Cover a registry whose first ref is not
`demo-v1/day1`, deleting the default itself, and all-events reinitializing one
empty default state. The deletion activation path must bypass ordinary
same-active-ref suppression. If fallback prepare, commit, or render fails, App
renders a safe no-active-data diagnostic, disables stale map actions, and does
not pair the deleted state with the old map.

- [ ] **Step 5: Verify RED**

```bash
npx vitest run --root . tests/storage-deletion-service.test.ts tests/storage-delete-dialog.test.ts tests/storage-deletion-app.test.ts tests/event-day-repository.test.ts tests/source-settings-service.test.ts tests/management-view-model.test.ts
```

- [ ] **Step 6: Implement service first, then component/App wiring**

Do not encode delete semantics in the component. Use source safety operations
`circles-delete`, `activity-delete`, and `event-day-delete`; all-events
performs strict enumeration and the same checks for every ref before writes.

- [ ] **Step 7: Verify**

```bash
npx vitest run --root . tests/storage-deletion-service.test.ts tests/storage-delete-dialog.test.ts tests/storage-deletion-app.test.ts tests/source-settings-service.test.ts tests/event-day-repository.test.ts tests/event-day-transition-service.test.ts tests/management-view-model.test.ts
npm run verify
npx biome check
npm run test:e2e
```

- [ ] **Step 8: Present commit candidate**

Proposed message: `feat(ui): add safe local data deletion`.

## Review checklist

- Activity deletion is blocked while outbox exists.
- All-events preflight occurs before the first deletion.
- Corrupt/missing indexed data and a changed generation fail before deletion.
- Circle deletion preserves activity intentionally and documents the consequence.
- Circle deletion mints a generation through an explicit replacement rule.
- Active deletion uses atomic transition fallback and all-events recreates only
  a new empty registry-default state.
- Dialog confirmation cannot bypass service checks.
