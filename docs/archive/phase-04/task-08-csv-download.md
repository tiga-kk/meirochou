# Phase 4 Task 8: Export the Active Event/Day as CSV

> **Depends on:** Task 4. **Scope:** Read-only export, deterministic filename, browser download adapter, and URL cleanup.

## Goal

Download a public-contract CSV whose `isSale` values reflect LocalStorage purchase truth, without mutating state or leaking object URLs.

## Files

- Create: `apps/webapp/js/ui/csv-download.ts`
- Create: `tests/csv-download.test.ts`
- Modify: `apps/webapp/js/components/source-manager.ts`
- Modify: `tests/source-manager.test.ts`
- Modify: `apps/webapp/js/data-manager.ts`
- Modify: `apps/webapp/js/app.js`
- Modify: `package.json`

## Interfaces

```ts
export interface DownloadAdapter {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  click(url: string, filename: string): void;
}

export function formatCsvExportFilename(ref: EventDayRef, now: Date): string;
export function downloadCsv(
  csv: string,
  filename: string,
  adapter: DownloadAdapter,
): void;
```

Task 8 extends the Task 4 `SourceManagerModel` with
`readonly canExportCsv: boolean` and begins rendering/emitting
`csv-export-request`. Earlier Tasks do not show a non-functional export action.

Filename uses validated IDs and local device date/time:

```text
comipath-<eventId>-<dayId>-YYYYMMDD-HHmmss.csv
```

Pad every numeric field to two digits. Do not include event display name, sheet name, source filename, or spreadsheet title.

Reject an invalid `Date` and invalid IDs before creating a Blob or object URL.
Tests cover ID lengths 1 and 64, length 65, path/key delimiter characters,
local time components, and two refs at the same instant.

## Export content decision

Before download, update `DataManager.exportCsv(ref)` to export only circles where `removedFromSource !== true`. Retained removed rows exist for local history integrity but are no longer part of the current source; exporting them would silently reactivate them on re-import. Keep a regression test documenting this deliberate Phase 4 behavior change.

The codec still emits the exact header and CRLF/trailing newline. `isSale` is derived from the current `purchased` set, regardless of the original source cell.

Formula-like text policy is intentionally lossless: ComiPath does not execute
CSV cells and does not silently prefix or rewrite fields beginning with `=`,
`+`, `-`, or `@`. Add a regression test for exact round-trip and document that
externally sourced CSV should be treated as untrusted when opened in a
spreadsheet application. Spreadsheet-specific neutralization would change the
public CSV round-trip contract and requires a separate approved migration.

## TDD steps

- [ ] **Step 1: Write filename tests**

Cover padding, validated IDs at 1/64 characters, rejected 65-character and
delimiter values, invalid Date, local date components, and two different
event/day refs. Invalid input throws before filename/Blob creation.

- [ ] **Step 2: Write Blob/cleanup tests**

Assert MIME `text/csv;charset=utf-8`, exact UTF-8 text, one click, and
`revokeObjectURL` exactly once in `finally` even if click throws. Cover
`createObjectURL` throwing before a URL exists and `revokeObjectURL` throwing
after click without a second click. Do not prepend a BOM unless an approved
compatibility requirement and test is added.

- [ ] **Step 3: Write DataManager export regression tests**

Assert active rows only, removed rows omitted, deterministic order from current
state, escaping, CRLF, trailing newline, LocalStorage purchase truth, and exact
preservation of formula-like text. Compare source generation, circles,
purchase, hold, history, redo, outbox, and timestamps before/after export.

- [ ] **Step 4: Write component/App event tests**

Export is enabled only when a committed active state has at least one active
circle, remains available with pending outbox, emits the committed ref rather
than an in-progress selector draft, and maps create/click/revoke failures to a
safe UI error without changing state or generation.

- [ ] **Step 5: Verify RED**

```bash
npx vitest run --root . tests/csv-download.test.ts tests/source-manager.test.ts tests/data-manager-event-day.test.ts
```

- [ ] **Step 6: Implement adapter injection and cleanup**

App owns the real anchor adapter. The component neither creates Blob/object URLs nor reads repository state.

- [ ] **Step 7: Verify**

```bash
npx vitest run --root . tests/csv-download.test.ts tests/source-manager.test.ts tests/data-manager-event-day.test.ts tests/csv-circle-codec.test.ts
npm run verify
npx biome check
npm run test:e2e
```

- [ ] **Step 8: Present commit candidate**

Proposed message: `feat(ui): export event day CSV`.

## Review checklist

- Removed source rows do not reappear in export.
- Pending outbox does not block read-only export.
- Filename contains no source/private labels.
- Object URL is revoked on success and failure.
- Export causes no repository or in-memory mutation.
- Formula-like source text is preserved and its external spreadsheet risk is
  documented rather than silently changing the round-trip contract.
