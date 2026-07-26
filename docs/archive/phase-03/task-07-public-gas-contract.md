# Phase 3 Task 7: Align the Public GAS Server with the Client Contract

> **Depends on:** Task 1 response contracts. **Scope:** Public GAS source, generated `Code.gs`, and VM contract tests only. No deployed URL or live spreadsheet is used.

## Goal

Make GET return every validated source row, including `isSale=x`, and make POST assign one desired purchase state on one exact sheet. Invalid sheets must fail with useful sheet/row diagnostics instead of being skipped.

## Files

- Modify: `integrations/gas-spreadsheet/src/web-api.js`
- Modify: `integrations/gas-spreadsheet/src/post-router.js`
- Modify if helpers are needed: `integrations/gas-spreadsheet/src/response.js`
- Regenerate: `integrations/gas-spreadsheet/Code.gs`
- Modify: `tests/gas-contract.test.mjs`
- Modify: `tests/gas-build.test.mjs` only if generated ordering changes intentionally

## Final HTTP body contracts

```js
// GET ?action=getSheets
{ ok: true, status: "success", sheets: ["day1"], spreadsheetTitle: "Demo" }

// GET ?sheets=day1
{
  ok: true,
  status: "success",
  circles: [
    { space: "東A01a", priority: 1, isSale: "x", account: "circle_a", tweet: "https://example.test/menu.png", memo: "新刊" }
  ],
  spreadsheetTitle: "Demo"
}

// POST
{ action: "sale", sheetName: "day1", space: "東A01a", undo: false }
{ ok: true, status: "success" }

// Any contract failure
{ ok: false, status: "error", code: "stable-code", message: "safe diagnostic" }
```

GAS web apps commonly return application-level errors with HTTP 200, so `ok/status` are mandatory and Task 1 parses them. Do not depend on custom HTTP status support.

## Sheet rules

- Required header: exactly one `space`.
- Supported optional headers: at most one each of `priority`, `isSale`, `account`, `tweet`, `memo`.
- Header comparison may trim surrounding whitespace but is case-sensitive after trim; document this behavior and use it consistently.
- Empty rows may be ignored.
- Non-empty rows require a non-empty unique `space` within the selected sheet.
- `priority` is empty or a finite number.
- GET returns purchased and unpurchased rows. It never filters `isSale=x`; LocalStorage merge rules need that value.
- The legacy `imageUrl` alias and multi-sheet combined response are removed from the public contract.

## POST rules

- Require non-empty string `sheetName` and `space`, and boolean `undo`.
- Resolve only `getSheetByName(sheetName)`; never fall back to all sheets.
- Validate required headers and duplicate spaces before updating.
- Zero matches and multiple matches are errors; do not update any row.
- `undo:false` assigns `x`; `undo:true` assigns an empty cell. Repeating the same request is successful and idempotent.
- Remove the legacy batch `spaces` reset branch.

## TDD steps

- [x] **Step 1: Update VM fixtures to the final response shape**

Change existing success assertions from `wantToBuy` to `circles` and assert `ok/status`. Update fixture columns to the public `tweet` header; do not preserve `imageUrl` as an undocumented alias.

- [x] **Step 2: Add failing GET validation tests**

Cover missing `space`, duplicate `space` header, duplicate optional header, duplicate row space with exact row numbers, invalid priority row, unknown sheet, purchased row included, and optional empty fields.

- [x] **Step 3: Add failing POST validation/idempotence tests**

Cover missing sheet, missing space, non-boolean undo, missing/duplicate headers, duplicate matching rows, exact-sheet isolation when two sheets share a space, repeated purchase, repeated cancel, and removal of batch fallback.

- [x] **Step 4: Verify RED**

```bash
npx vitest run --root . tests/gas-contract.test.mjs
```

- [x] **Step 5: Implement focused helpers**

Keep source files split by responsibility. Add small functions for header indexing, row validation, and safe error creation rather than growing `doGet`/`doPostSale` into one large function. Never include row contents in errors; use sheet name, header name, and 1-based row number.

- [x] **Step 6: Regenerate deterministically**

```bash
npm run build:gas
npm run verify:gas
```

Expected: generated `Code.gs` matches source ordering and all VM tests pass. Never hand-edit only `Code.gs`.

- [x] **Step 7: Run integration verification**

```bash
npm run verify
npx biome check integrations/gas-spreadsheet/src tests/gas-contract.test.mjs tests/gas-build.test.mjs
git diff --check
```

- [x] **Step 8: Present commit candidate**

Proposed message: `fix(gas): enforce public sheet contract`.

## Review checklist

- GET includes `isSale=x` rather than hiding purchased rows.
- POST never scans or updates a fallback sheet.
- Duplicate headers/spaces cannot produce ambiguous writes.
- Errors identify location without leaking cell contents.
- Generated and source GAS remain reproducible and public-safe.
