# Phase 2 Task 8: Verification and Data Contract Documentation

> **For agentic workers:** Implement only this task. Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`, follow the repository approval protocol, and do not begin Phase 3 in the same change.

**Status:** Complete. Commit `335f04f`. Phase 2 exit gate passed.

**Goal:** Document the event/day LocalStorage and CSV behavior that actually exists after Task 7, protect the public README with contract tests, and close Phase 2 with fresh verification evidence.

**Deliverable:** This task changes documentation and documentation-contract tests only. It does not add GAS synchronization, management UI, event switching UI, or a new storage schema.

## Preconditions and boundaries

- Start from `feature/event-day-local-data` with Task 7 commit `1b95c5f` present.
- Preserve the user's existing uncommitted `AGENTS.md` change. Do not stage it with this task unless the user separately asks.
- Read `docs/architecture/data-contracts.md`, `docs/workflows/review-readiness.md`, `apps/webapp/js/data-manager.ts`, and `apps/webapp/js/types/domain.ts` before editing public documentation.
- Describe the current service API, not planned Phase 3 or Phase 4 behavior.
- State explicitly that GAS import, GAS refresh, GAS POST, outbox retry, source-management UI, and event/day selector UI are not available yet.
- Do not claim Service Worker or general offline guarantees. Phase 2 guarantees only LocalStorage-backed state after the application assets have loaded.
- Do not include real event data, deployed GAS URLs, spreadsheet IDs, tokens, private map paths, or screenshots made from private maps.

## Files

- Modify: `tests/webapp-contracts.test.mjs`
- Modify: `README.md`
- Create: `docs/data-contracts.md`
- Update after approval: local-only `docs/status/progress.md`

## Public facts that the documents must match

```ts
type DataSource =
  | { readonly type: "csv"; readonly fileName: string }
  | { readonly type: "gas"; readonly gasUrl: string; readonly sheetName: string };

interface EventDayRef {
  readonly eventId: string;
  readonly dayId: string;
}

interface SourceRef extends EventDayRef {
  readonly sourceGeneration: string;
}
```

- IDs match `/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/`; whitespace and separators are rejected rather than trimmed.
- LocalStorage is the single-device authority. Keys and state are isolated by validated `eventId + dayId`; source replacement is distinguished by `sourceGeneration`.
- `sourceGeneration` changes only after initial source creation or an applied source replacement. Purchase, hold, undo, redo, reset, preview, and export do not change it.
- CSV header is exactly `space,priority,isSale,account,tweet,memo` on export. Import requires `space`, rejects duplicate spaces, and reports row/column issues.
- A replacement requires a short-lived preview ID. Apply rechecks expiry, input hash, current source generation, and source type.
- Source refresh preserves local purchase, hold, history, and redo state. `isSale=x` may add purchase state; an empty source cell never clears local purchase state.
- Source rows removed by a later import remain in storage with `removedFromSource: true` for state/history integrity and are hidden from the active map list.
- Legacy data is read only through explicit preview/import. Successful import does not delete legacy keys.

## Interfaces consumed by later phases

Document these exact current entry points from `DataManager`:

```ts
openEventDay(ref: EventDayRef): Promise<LocalEventDayState>;
importInitialCsv(ref: EventDayRef, fileName: string, text: string): Promise<LocalEventDayState>;
previewCsvReplacement(ref: EventDayRef, fileName: string, text: string): Promise<CsvReplacementPreview>;
applyCsvReplacement(previewId: string): LocalEventDayState;
exportCsv(ref: EventDayRef): string;
previewLegacyImport(target: EventDayRef): LegacyImportPreview;
applyLegacyImport(target: EventDayRef, previewId: string): LocalEventDayState;
```

Do not document `importCsv` as the preferred API; it is only a backward-compatible alias for initial import.

## TDD execution

- [x] **Step 1: Add failing documentation contract tests**

Add one focused test to `tests/webapp-contracts.test.mjs`. Reuse the file's existing `read()` helper.

```js
test("public data documentation matches the Phase 2 boundary", () => {
  const readme = read("README.md");
  const contract = read("docs/data-contracts.md");

  assert.match(readme, /LocalStorage/);
  assert.match(readme, /CSV/);
  assert.match(readme, /GAS同期は未実装/);
  assert.doesNotMatch(readme, /Service Worker/);

  for (const required of [
    "eventId + dayId",
    "sourceGeneration",
    "space,priority,isSale,account,tweet,memo",
    "removedFromSource",
    "previewId",
  ]) {
    assert.match(contract, new RegExp(required.replace(/[+]/g, "\\+")));
  }
});
```

If the existing test file needs escaping adjustments, preserve the same assertions and make only syntax-level corrections.

- [x] **Step 2: Verify RED for the intended reason**

Run:

```bash
npx vitest run --root . tests/webapp-contracts.test.mjs
```

Expected: FAIL because `docs/data-contracts.md` does not exist and/or the README still contains the Service Worker claim. A syntax error or unrelated failing assertion is not an acceptable RED state.

- [x] **Step 3: Create `docs/data-contracts.md`**

Write the following sections in this order:

1. Supported scope and current limitations.
2. Event/day/source-generation identity rules.
3. `LocalEventDayState` field table, including `schemaVersion: 1`.
4. CSV import contract and exact error behavior.
5. Initial import versus replacement preview/apply sequence.
6. Purchase, hold, history, redo, and removed-source-row preservation.
7. Legacy preview/import safety.
8. Current TypeScript service API.
9. Phase 3 boundary: GAS behavior is unavailable until the next phase.

For every failure path, state both the thrown/returned diagnostic and what remains unchanged. In particular, expired/stale/tampered previews and storage write failures must leave the previous persisted state intact.

- [x] **Step 4: Correct the public README**

Keep the existing map/navigation overview, then add concise sections for:

- current support matrix (`Map/navigation: yes`, `CSV service API: yes`, `management UI: no`, `GAS sync: no`);
- CSV columns and validation;
- LocalStorage ownership and single-device limitation;
- the exact verification commands;
- a link to `docs/data-contracts.md`.

Remove or rewrite statements that imply current Service Worker support, automatic spreadsheet loading, or a usable GAS settings workflow.

- [x] **Step 5: Verify GREEN and formatting**

Run:

```bash
npx vitest run --root . tests/webapp-contracts.test.mjs
npm run test:webapp
npm run check:webapp
git diff --check
```

Expected: all commands exit 0. `test:webapp` must include the new documentation assertion.

- [x] **Step 6: Run the Phase 2 exit gate from a fresh install**

Run in the repository root:

```bash
npm ci
npm run verify
npx biome check
npm run test:e2e
git diff --check
git status --short --branch
git remote -v
```

Expected:

- `npm run verify`: PASS, including Webapp and deterministic GAS checks.
- `npx biome check`: exit 0 with no warnings.
- `npm run test:e2e`: all mobile Chromium tests pass; no snapshot is updated.
- `git remote -v`: empty.
- only `README.md`, `docs/data-contracts.md`, and `tests/webapp-contracts.test.mjs` belong to this task's commit candidate. Existing unrelated changes remain unstaged.

If the sandbox rejects localhost binding, rerun only `npm run test:e2e` outside the sandbox as allowed by `docs/workflows/review-readiness.md`; do not replace it with a different command.

- [x] **Step 7: Self-review the documentation**

Check all of the following before staging:

- every documented method exists with the same name and parameter order;
- no Phase 3/4 feature is written in present tense;
- no `TBD`, `TODO`, deployed URL, private identifier, or private map reference exists;
- README and `docs/data-contracts.md` agree about `isSale=x`, stale previews, and LocalStorage authority;
- the README no longer claims Service Worker support;
- `git diff --check` is clean.

- [x] **Step 8: Present the commit candidate and wait for approval**

Stage only:

```bash
git add README.md docs/data-contracts.md tests/webapp-contracts.test.mjs
```

Present `git diff --cached --stat`, the meaningful diff, every verification result, and this proposed message:

```text
docs(data): document event day and CSV contracts
```

Do not commit until the user explicitly approves. After an approved commit, update local-only `docs/status/progress.md` with the commit ID and mark Phase 2 complete; do not begin Phase 3 in the same task.

## Review checklist

- [x] Documentation describes committed behavior rather than future plans.
- [x] Storage and preview failure behavior is explicit.
- [x] Phase 3 and Phase 4 remain clearly out of scope.
- [x] Public boundary and credential audit still pass.
- [x] Phase 2 exit commands are recorded with actual results.
