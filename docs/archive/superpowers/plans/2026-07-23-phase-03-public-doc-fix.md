# Phase 3 Public Documentation Boundary Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phase 3 public documentation contract reproducible from a fresh GitHub checkout while keeping local plans and agent instructions untracked.

**Architecture:** Keep `/docs/` as local-only project planning. Track only concise public contracts under top-level `guides/`; point contract tests there. Keep the root `README.md` empty and keep the local `AGENTS.md` file on disk while removing it from the Git index.

**Tech Stack:** Markdown, Vitest, Git, GitHub Actions.

## Global Constraints

- Do not change Phase 3 runtime behavior.
- Keep `README.md` as a tracked zero-byte file.
- Keep `/docs/` ignored.
- Preserve `AGENTS.md` locally but do not track it.
- Do not force-push.
- Merge with a merge commit so Phase task commits remain visible.

---

### Task 1: Correct the public documentation boundary

**Files:**
- Create: `guides/data-contracts.md`
- Create: `guides/gas-sync.md`
- Modify: `tests/webapp-contracts.test.mjs`
- Modify: `README.md`
- Modify: `.gitignore`
- Remove from tracking only: `AGENTS.md`

**Interfaces:**
- Consumes: the implemented Phase 3 data and GAS synchronization contracts.
- Produces: tracked public documentation readable by a fresh checkout and CI.

- [x] **Step 1: Point the documentation contract test at `guides/`**

Replace the ignored `docs/gas-sync-contract.md` input with tracked `guides/data-contracts.md` and `guides/gas-sync.md`. Also assert that `README.md` remains empty.

- [x] **Step 2: Verify RED**

Run:

```bash
npx vitest run --root . tests/webapp-contracts.test.mjs
```

Expected: failure because the two `guides/` files do not exist and the current README is not empty.

- [x] **Step 3: Create concise tracked public guides**

Extract only the implemented public data contract and Phase 3 GAS synchronization behavior. Do not copy planning status, commit IDs, local paths, real endpoints, spreadsheet identifiers, or Phase 4 implementation claims.

- [x] **Step 4: Restore the empty README and remove AGENTS tracking**

Keep `AGENTS.md` in `.gitignore`, remove it only from the index, and verify the local file still exists.

- [x] **Step 5: Verify GREEN and the full exit gate**

Run:

```bash
npm run verify
npx biome check
npm run test:e2e
node scripts/audit-public-tree.mjs
git diff --check
```

Expected: all commands succeed from the tracked public tree.

- [x] **Step 6: Commit and push the Phase 3 fix**

Proposed commit:

```text
fix(docs): track public Phase 3 contracts
```

Push `feature/gas-sync-safety`, wait for PR CI success, and verify the PR is mergeable.

- [x] **Step 7: Integrate Phase 3 and prepare Phase 4**

Mark PR `#1` ready, merge with a merge commit, update local `main` with `--ff-only`, create `feature/management-ui`, and push the new branch only if required by the approved workflow. Do not implement Phase 4.
