# CI Trigger Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Webapp CI once for pull requests into `main`, once after changes reach `main`, and on explicit manual dispatch.

**Architecture:** Keep the existing single `Webapp CI` workflow and verification job. Narrow `push` to `main`, narrow `pull_request` to `main`, and add `workflow_dispatch` without changing build or test steps.

**Tech Stack:** GitHub Actions YAML, Node.js 22.14.0, Playwright 1.61.1, Vitest, TypeScript, Vite, Biome.

## Global Constraints

- Keep the root `README.md` intentionally empty.
- Do not add deployment or Cloudflare steps.
- Do not change application behavior or Phase 3 Task code.
- Preserve Task-level commits by merging branches without squash or rebase.
- Never force-push.

---

### Task 1: Define and integrate the CI triggers

**Files:**
- Modify: `.github/workflows/webapp-ci.yml`
- Verify: `tests/webapp-contracts.test.mjs`
- Record locally: `docs/status/progress.md`

**Interfaces:**
- Consumes: GitHub `push`, `pull_request`, and `workflow_dispatch` events.
- Produces: one `verify` job for `main` pushes, `main` pull requests, and manual runs.

- [x] **Step 1: Create a CI maintenance branch from synchronized `main`**

Run:

```bash
git switch main
git switch -c bugfix/ci-triggers
```

Expected: the current branch is `bugfix/ci-triggers`, based on `origin/main`.

- [x] **Step 2: Update the event filters**

Set the workflow trigger to:

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:
```

Expected: job steps, permissions, container, and timeout are unchanged.

- [x] **Step 3: Verify the workflow contract and repository**

Run:

```bash
npm run verify
npx biome check
git diff --check
```

Expected: every command exits zero.

- [x] **Step 4: Review and commit the isolated change**

Run:

```bash
git diff --cached
git commit -m "ci(actions): refine verification triggers"
```

Expected: the commit contains only `.github/workflows/webapp-ci.yml`.

- [x] **Step 5: Merge and publish `main`**

Run:

```bash
git switch main
git merge --no-ff bugfix/ci-triggers -m "merge: refine CI triggers"
git push origin main
```

Expected: local `main` and `origin/main` point to the same merge commit, and a `push` workflow run is created.

- [x] **Step 6: Synchronize the Phase 3 branch**

Run:

```bash
git switch feature/gas-sync-safety
git merge main -m "merge: sync Phase 3 CI triggers"
git push origin feature/gas-sync-safety
```

Expected: local and remote Phase 3 heads match. The existing Draft PR targets `main`, and its `pull_request` run is created without a duplicate feature-branch `push` run.

- [x] **Step 7: Verify manual dispatch and record the result**

Run:

```bash
gh workflow run "Webapp CI" --ref feature/gas-sync-safety
gh run list --workflow "Webapp CI" --limit 10
```

Expected: the manual run is accepted. Record the main, pull-request, and manual-run results in `docs/status/progress.md`.
