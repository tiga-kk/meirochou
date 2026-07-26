# Phase 4 Task 4: Add CSV/GAS Source Management

> **Depends on:** Tasks 1 and 3. **Scope:** Settings shell, source forms, sheet lookup, and preview requests. Diff confirmation is Task 5.

## Goal

Provide mutually exclusive CSV and GAS workflows for the active event/day without saving a source or applying fetched data before an explicit preview confirmation.

## Files

- Create: `apps/webapp/js/components/source-manager.ts`
- Create: `apps/webapp/js/ui/management-session.ts`
- Create: `tests/source-manager.test.ts`
- Create: `tests/source-manager-app.test.ts`
- Create: `tests/management-session.test.ts`
- Modify: `apps/webapp/js/components/comipath-settings.ts`
- Modify: `tests/settings-component.test.ts`
- Modify: `apps/webapp/js/app.js`
- Modify: `apps/webapp/js/data-manager.ts`
- Modify: `apps/webapp/js/data/gas-refresh-service.ts`
- Modify: `tests/gas-refresh-service.test.ts`
- Modify: `apps/webapp/js/ui/management-view-model.ts`
- Modify: `tests/management-view-model.test.ts`
- Modify: `apps/webapp/css/forms.css`
- Modify: `tests/e2e/webapp.spec.ts`
- Modify: `package.json`

## Interfaces: component properties

```ts
export interface SourceManagerModel {
  readonly activeRefLabel: string;
  readonly source: SourceSummaryViewModel;
  readonly sourceType: "csv" | "gas";
  readonly gasUrlInput: string;
  readonly selectedSheetName: string;
  readonly sheetNames: readonly string[];
  readonly pendingCount: number;
  readonly busy: boolean;
  readonly errorMessage: string;
}
```

`source-manager` receives one model property and emits only the shared management events. It never keeps a `File` after dispatch and never stores a URL outside the editable URL input. Full URL text may appear only in that user-editable input; summaries, errors, logs, attributes, and outbox rows use safe host-only models.

Task 8 extends this model with `canExportCsv`; Task 4 does not render or emit
the export action.

`configured` is false exactly when `source.type === "csv"`,
`source.fileName === "empty.csv"`, and `circles.length === 0`; otherwise it is
true. The existence of a LocalStorage state alone does not make a day
configured. After circles deletion, that sentinel with retained activity is
still shown as source-unconfigured.

## Management request session

Create a pure App-owned helper that imports no repository, API client, or
service:

```ts
export type ManagementBusyLane =
  | "transition"
  | "source-request"
  | "preview-apply"
  | "outbox"
  | "delete"
  | "export";

export type ActiveSourcePreview =
  | {
      readonly kind: "csv";
      readonly ref: EventDayRef;
      readonly previewId: string;
      readonly expectedSourceGeneration: string;
    }
  | {
      readonly kind: "gas";
      readonly ref: EventDayRef;
      readonly previewId: string;
      readonly mode: "initial" | "replacement" | "refresh";
      readonly expectedSourceGeneration: string;
    };
```

The session owns source-request sequence tokens, the current
`AbortController`, busy lanes, and at most one active preview descriptor. App
continues to own every service call. Starting a newer request, changing
event/day, or closing settings invalidates the prior token and aborts a GAS
request. A pending `File.text()` cannot be aborted, so its eventual result is
discarded by token/ref/generation checks.

Do not reuse one shell-wide `busy` flag for every lane. In particular, a source
GET must not disable the event/day selector because changing the selector is
one of the actions that cancels the request.

Pass optional abort signals through the existing preview boundary:

```ts
previewInitialGasImport(
  ref: EventDayRef,
  source: GasDataSource,
  signal?: AbortSignal,
): Promise<GasRefreshPreview>;

previewGasSourceReplacement(
  ref: EventDayRef,
  source: GasDataSource,
  signal?: AbortSignal,
): Promise<GasRefreshPreview>;

previewGasRefresh(
  ref: EventDayRef,
  signal?: AbortSignal,
): Promise<GasRefreshPreview>;
```

`GasRefreshService` passes the same signal to `GasApiClient.fetchCircles`.

Preserve structured CSV diagnostics across the App boundary:

```ts
export class CsvValidationError extends Error {
  readonly issues: readonly CsvIssue[];
}
```

`DataManager.previewCsvReplacement` throws this error when parsing fails
instead of collapsing row/column information into one unstructured string.
The UI maps only safe row, column, and known issue messages. It does not copy
CSV cell contents or the caught stack.

## UI flows

### CSV

1. User selects one `.csv` file.
2. Component emits `csv-preview-request` with the `File` and immediately clears the native input value so selecting the same file again works.
3. App checks the exact inclusive limit `5 * 1024 * 1024` bytes, reads
   `file.text()` with error handling, and calls
   `previewCsvReplacement(activeRef,file.name,text)` even for the empty
   sentinel.
4. App stores only the active preview descriptor and safe diff model for Task
   5. Task 4 does not apply the preview and does not require the Task 5 dialog
   to exist yet. No direct `importInitialCsv()` call is made from UI.

### GAS sheet lookup

1. User enters an HTTPS GAS URL and requests sheets.
2. Component emits `gas-sheets-request`; App calls the shared `parseGasWebAppUrl` from Phase 3 and then `GasApiClient.fetchSheetList` without persisting the URL. A generic HTTPS URL is not sufficient.
3. Returned names populate the selector. A failed/aborted request leaves current persisted source unchanged.

### GAS preview

- Empty sentinel + chosen source: `mode:"initial"` → `previewInitialGasImport`.
- Different source type/URL/sheet: `mode:"replacement"` → `previewGasSourceReplacement`.
- Same persisted GAS source: `mode:"refresh"` → `previewGasRefresh`.
- App derives/validates the mode from persisted state. It does not trust a component-supplied mode that contradicts current source.

## Pending and busy behavior

- Any pending entry disables CSV replacement, GAS URL, sheet, and type controls, and shows retry/discard guidance.
- Task 8's later export control remains read-only and will not inherit this
  lock; no export control exists yet in Task 4.
- UI disabling is advisory. If outbox appears after the form rendered, preview apply still fails in Phase 3 services.
- One in-flight sheet or preview request is identified by a request token/AbortController. A newer request aborts/invalidates the older result.
- A request captures active ref and source generation at dispatch. Completion
  is ignored if either changed, even when the selected ref itself did not.
- Editing the GAS URL clears sheet names selected for the previous URL.
  Closing settings clears draft sheets/errors and cancels in-flight work.

## TDD steps

- [ ] **Step 1: Write mutually exclusive form and boundary tests**

Cover CSV/GAS mode, exact labels, current source, empty/unconfigured state,
empty sentinel with retained activity, sheet list, no selected sheet, invalid
URL, 5 MiB exactly accepted, 5 MiB + 1 byte rejected before `file.text()`,
case-insensitive `/\.csv$/i` acceptance, and disabled source controls with pending entries.
Export is not rendered until Task 8 and is not part of this Task's model.

- [ ] **Step 2: Write event tests**

Assert exact bubbling/composed details for CSV file, sheet lookup, and GAS
initial/replacement/refresh preview. Assert the native file input is cleared so
the same `File` can be selected again. Assert no event when source-request
busy, pending, invalid URL/path/query/fragment, missing sheet, wrong extension,
or oversized file. Assert a full draft URL exists only as the editable input
value and not in text, non-input attributes, error nodes, or serialized logs.

- [ ] **Step 3: Write App orchestration tests**

Cover File read rejection, CSV parse issues with row/column display, sheet GET
failure, A→B requests completing B→A, stale response after event/day switch,
stale response after same-ref generation change, settings close, each GAS
mode, forged component mode, no persistence before preview apply, and safe
error mapping without File/URL/CSV/body/stack leakage. Verify request abort
where the API supports it and token invalidation for `File.text()`.

- [ ] **Step 4: Write management-session lifecycle tests**

Cover independent busy lanes, monotonically newer request tokens, abort on
replacement/ref change/settings close, one active preview, immutable copied
refs, and clearing a preview without importing services.

- [ ] **Step 5: Verify RED**

```bash
npx vitest run --root . tests/source-manager.test.ts tests/source-manager-app.test.ts tests/management-session.test.ts tests/settings-component.test.ts tests/management-view-model.test.ts
```

- [ ] **Step 6: Refactor `comipath-settings` into a shell**

Keep its existing open/class/focus behavior. It hosts `event-day-selector`, `source-manager`, and later panels; it no longer owns legacy multi-sheet checkbox logic. Remove the obsolete `selectedSheets[]` UI and events because one event/day uses one sheet.

- [ ] **Step 7: Implement App request session and service calls**

On event/day change, abort outstanding sheet/preview requests, clear draft sheet names and errors, and rebuild the model. Never log `File`, CSV text, full GAS URL, or caught server body.

- [ ] **Step 8: Replace obsolete Phase 2 browser assertion**

Update the old E2E that says management GAS is unavailable. Its replacement
opens settings/reloads a cached source and asserts that no GAS GET occurs
without an explicit sheet lookup or refresh. Do not update baseline snapshots.

- [ ] **Step 9: Verify**

```bash
npx vitest run --root . tests/source-manager.test.ts tests/source-manager-app.test.ts tests/management-session.test.ts tests/settings-component.test.ts tests/management-view-model.test.ts tests/gas-refresh-service.test.ts tests/data-manager-event-day.test.ts tests/event-registry.test.ts
npm run verify
npx biome check
npm run test:e2e
```

No snapshots are updated. Add `tests/event-registry.test.ts` and every new
Task 4 Vitest file to `npm run test:webapp`.

- [ ] **Step 10: Present commit candidate**

Proposed message: `feat(ui): add event day source management`.

## Review checklist

- First CSV import also uses preview/apply.
- Multi-sheet legacy UI is removed.
- Request results cannot cross event/day selection.
- Request results cannot cross a same-ref source-generation change.
- Source-request busy does not prevent the selector action that cancels it.
- Only the editable input contains the full draft URL.
- Pending/busy UI cannot bypass service locks.
