# Phase 3 Task 9: Document GAS Sync and Close the Phase

> **Depends on:** Tasks 1–8. **Scope:** Documentation, documentation-contract tests, audits, and final verification only.

## Goal

Explain the implemented explicit-refresh/local-first/outbox behavior without implying Phase 4 UI exists, and record enough verification evidence to permit a separate Phase 4 branch.

## Files

- Modify: `README.md`
- Create: `docs/gas-sync-contract.md`
- Modify: `docs/data-contracts.md`
- Modify: `integrations/gas-spreadsheet/README.md`
- Modify: `tests/webapp-contracts.test.mjs`
- Update after approved commit: local-only `docs/status/progress.md` and `docs/plans/roadmap.md`

## Documentation contract

### Public README

- CSV-only users do not need GAS.
- GAS users deploy their own generated `Code.gs`.
- Current Phase 3 provides service/browser synchronization behavior; management forms arrive in Phase 4.
- Opening cached state performs no GET.
- Purchase/cancel writes LocalStorage first and may remain pending after a network failure.

### `docs/gas-sync-contract.md`

Write these sections:

1. Ownership and one-way data flow.
2. Exact GET/POST request/response contracts.
3. Initial import versus explicit refresh.
4. Preview lifetime, generation/fingerprint checks, and apply failures.
5. Atomic local mutation plus outbox append.
6. FIFO, coalescing, concurrency, startup/online retry.
7. Pending locks and explicit discard consequences.
8. Idempotence and remote-success/local-save-failure behavior.
9. Safe diagnostics and sensitive-data rules.
10. Current non-UI service interfaces for Phase 4.

### GAS README

Document exact columns, one event/day sheet selection, deployment steps, deterministic regeneration, the accepted `https://script.google.com/macros/s/<deployment-id>/exec` URL shape, and the fact that deployed URLs belong only in the user's local settings. Do not state that the repository contains a usable deployed endpoint.

## TDD steps

- [x] **Step 1: Add failing documentation assertions**

Extend `tests/webapp-contracts.test.mjs` to assert the three documents contain the stable terms `explicit refresh`, `LocalStorage`, `gasOutbox`, `sourceGeneration`, `sheetName`, and `npm run build:gas`, and do not contain a deployed `/macros/s/<id>/exec` URL or claim that Phase 4 management UI exists.

- [x] **Step 2: Verify RED**

```bash
npx vitest run --root . tests/webapp-contracts.test.mjs
```

- [x] **Step 3: Write the documents from actual interfaces**

Check signatures in the committed Task 1–6 files rather than copying planned names blindly. If implementation differs from this plan, resolve the discrepancy before documenting it; do not hide it with vague prose.

- [x] **Step 4: Verify documentation tests and public boundary**

```bash
npx vitest run --root . tests/webapp-contracts.test.mjs tests/public-boundary.test.mjs
npm run verify
node scripts/audit-public-tree.mjs
git diff --check
```

- [x] **Step 5: Run the fresh Phase 3 exit gate**

```bash
npm ci
npm run verify
npx biome check
npm run test:e2e
git diff --check
git status --short --branch
git remote -v
git ls-files
```

Also run the credential grep from `docs/plans/roadmap.md`. Expected: every command succeeds, remote output is empty, existing visual snapshots are unchanged, and no private/excluded path or credential is tracked.

- [x] **Step 6: Self-review against the Phase 3 exit gate**

Map every exit-gate bullet in `phase-03-gas-sync.md` to a test name or documentation section. Fix missing evidence before staging. Search all Phase 3 plans and docs for `TBD`, `TODO`, undefined type names, `wantToBuy` GAS response claims, and multi-sheet source claims.

- [x] **Step 7: Present commit candidate**

Stage only the public docs/tests named above. Proposed message:

```text
docs(gas): document local-first synchronization
```

Wait for explicit approval. After the approved commit, update local-only progress and roadmap with the commit ID and actual command counts; do not begin Phase 4 or create/push a remote without separate approval.

## Review checklist

- Documentation distinguishes implemented service behavior from future management UI.
- GET, POST, preview, queue, lock, and failure semantics match tests.
- No full endpoint, spreadsheet ID, private map, or user data appears.
- Fresh-install verification and audit evidence is complete.
- Phase 4 entry gate is explicit and not assumed.
