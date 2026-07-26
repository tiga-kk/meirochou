# Phase 4 Task 6: Add Safe Outbox Recovery

> **Depends on:** Tasks 1 and 4. **Scope:** Safe display, retry, and explicit discard. Source changes remain handled by Task 4/service locks.

## Goal

Let users see pending counts and safe failure categories for all event/day queues, retry through the Phase 3 coordinator, and explicitly discard selected entries after a strong confirmation.

## Files

- Create: `apps/webapp/js/components/outbox-panel.ts`
- Create: `tests/outbox-panel.test.ts`
- Create: `tests/outbox-panel-app.test.ts`
- Modify: `apps/webapp/js/components/comipath-settings.ts`
- Modify: `apps/webapp/js/app.js`
- Modify: `apps/webapp/js/state/gas-sync-coordinator.ts`
- Modify: `tests/gas-sync-coordinator.test.ts`
- Modify: `apps/webapp/js/state/gas-outbox-service.ts`
- Modify: `tests/gas-outbox-service.test.ts`
- Modify: `apps/webapp/css/sheets.css`
- Modify: `package.json`

## Component contract

```ts
export interface OutboxPanelModel {
  readonly groups: readonly {
    readonly ref: EventDayRef;
    readonly label: string;
    readonly entries: readonly OutboxEntryViewModel[];
  }[];
  readonly totalPending: number;
  readonly processing: boolean;
  readonly resultMessage: string;
  readonly errorMessage: string;
}
```

The component receives only safe view models from Task 1, never `GasOutboxEntry`. It emits retry for one ref or all refs and discard for selected IDs with confirmation text.

## Retry and in-flight safety API

Add an explicit coordinator entry point for manual retry:

```ts
retry(ref: EventDayRef | null): Promise<GasSyncSummary>;
```

`null` processes all indexed refs in deterministic order. A ref processes only
that queue and maps the one `GasOutboxResult` into a one-ref
`GasSyncSummary`. Startup and online continue to call the existing all-ref
path. If all-ref work already reached that ref, `GasOutboxService.process`
returns its same in-flight promise; if it has not, the later all-ref pass sees
the updated queue. Thus concurrent startup, online, all-ref, and one-ref calls
never POST the same entry twice.

`GasOutboxService.discard` must reject an ID currently being POSTed. This is a
service rule, not merely a disabled checkbox. Discarding another non-processing
ID is allowed only if the service reloads the latest state immediately before
save and preserves an entry appended while the POST is in flight.

## Discard flow

1. User selects entries within one event/day group. Do not combine IDs from different refs in one discard event.
2. Show desired-state and consequence summary: local purchase truth remains; only unsent remote copies are abandoned.
3. Require exact text `未送信を破棄`.
4. Emit IDs/ref/confirmation.
5. App reloads state, verifies the text, and calls `GasOutboxService.discard`.
6. On failure, keep selections/panel open and show a safe error. On success, rebuild every settings model and clear selection.

Discard does not change source generation, purchase/hold/history, or remote spreadsheet. It merely removes selected pending entries.

## TDD steps

- [ ] **Step 1: Write safe rendering tests**

Cover empty state, grouping/order, total/per-group counts, desired true/false labels, attempts, known/unknown safe error categories, and processing live status. Serialize DOM and assert no raw URL/deployment path.

- [ ] **Step 2: Write retry tests**

Assert exact `gas-retry-request` details for one/all, disabled while processing, and App delegation to the single coordinator. Success/failure summaries are safe and retain failed groups.

- [ ] **Step 3: Write discard tests**

Cover selection, cross-group prevention, exact confirmation without trimming
or normalization, cancel, unknown/duplicate/processing IDs, service failure,
and successful refresh. UI text must explain that discard can leave GAS
different from LocalStorage.

- [ ] **Step 4: Write coordinator/discard race tests**

Cover one-ref/all-ref retry, manual retry during startup/online processing,
same-ref promise coalescing, different-ref independence, discard of the
processing ID on remote success and failure, discard of a different ID while a
POST is in flight, concurrent append, and quota/save failure during discard.
Expect no duplicate POST, no lost new/unchecked entry, and an unchanged queue
when discard fails.

- [ ] **Step 5: Write App model-coherence tests**

After purchase append, retry success/failure, background recovery, and discard,
assert that the panel total, selector pending label, source controls, and
deletion locks all come from the same reloaded repository snapshot. A stale
completion after settings close may not reopen or overwrite a newer status.

- [ ] **Step 6: Verify RED**

```bash
npx vitest run --root . tests/outbox-panel.test.ts tests/outbox-panel-app.test.ts tests/gas-sync-coordinator.test.ts tests/gas-outbox-service.test.ts
```

- [ ] **Step 7: Implement service safety before UI wiring**

Implement coordinator retry and processing-ID discard rejection first. Keep
the existing idempotent desired-state POST contract and safe failure
categories.

- [ ] **Step 8: Implement without endpoint formatting in the component**

All redaction/labels come from view models. Do not call `new URL(entry.gasUrl)` in the component because raw entries never arrive there.

- [ ] **Step 9: Verify**

```bash
npx vitest run --root . tests/outbox-panel.test.ts tests/outbox-panel-app.test.ts tests/gas-outbox-service.test.ts tests/gas-sync-coordinator.test.ts tests/management-view-model.test.ts
npm run verify
npx biome check
npm run test:e2e
```

- [ ] **Step 10: Present commit candidate**

Proposed message: `feat(ui): expose GAS outbox recovery`.

## Review checklist

- All-event and one-ref retry share the Phase 3 coordinator.
- A processing entry cannot be discarded underneath an active POST.
- Discard/save races do not lose an unselected or newly appended entry.
- Discard cannot mix refs or bypass exact confirmation.
- Local truth is untouched by discard and clearly explained.
- Raw queue/domain values do not reach the component.
- Failed recovery stays diagnosable and non-destructive.
