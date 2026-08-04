# Phase 5D Task 10: Re-verify Apps Refactor and Write Final Handoff

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:verification-before-completion`. This Task is verification and documentation only. Do not repair production code inside Task 10.

**Status:** BLOCKED — RERUN AFTER TASK 9.4 REVIEW
**Depends on:** Tasks 1–9.4 independently reviewed
**Previous result:** initial handoff recorded at `e22eadca`; Phase exit gate BLOCKED
**Commit candidate:** `docs(phase-5d): complete apps architecture handoff`

## Goal

From a clean environment, prove that the production browser entry path uses feature-specific controllers and no original or renamed legacy facade remains. Re-run architecture, unit/integration, build, GAS, E2E, C108 smoke, public audit, and human smoke. Update the handoff and progress only from observed evidence.

This Task must not add production behavior or fix a failed gate. A failure returns work to the owning Task 9.1–9.4.

## Required files to update

- `docs/reviews/phase-5d-handoff.md`
- `docs/plans/phase-05d/README.md`
- `docs/status/progress.md`
- `docs/plans/roadmap.md`
- exact Task status/implementation-record sections whose evidence changed

## Forbidden

- production code changes
- skip, retry, threshold, or snapshot changes to force green
- architecture allowlist
- changing acceptance criteria after seeing a failure
- beginning Phase 5E work

## Verification procedure

- [ ] **Step 1: Confirm branch and Task history**

```bash
git status --short --branch
git rev-parse HEAD
git log --oneline --decorate -40
git diff main...HEAD --stat
```

The worktree must be clean. Record exact commits and independent review results for Tasks 9.1, 9.2, 9.3, and 9.4.

- [ ] **Step 2: Clean install**

```bash
rm -rf node_modules
npm ci
node --version
npm --version
npx playwright --version
```

Record the exact versions. Do not substitute a different environment and call it equivalent.

- [ ] **Step 3: Exact original and renamed facade absence**

```bash
for path in \
  apps/webapp/js/app.js \
  apps/webapp/js/data-manager.ts \
  apps/webapp/js/ui-manager.js \
  apps/webapp/js/config.ts \
  apps/webapp/js/types/domain.ts \
  apps/webapp/js/types/boundary-parsers.ts \
  apps/webapp/js/comipath-browser-runtime.js \
  apps/webapp/js/event-day-data-store.ts \
  apps/webapp/js/comipath-dom-coordinator.js \
  apps/webapp/js/features/event-day/domain/application-contract-types.ts \
  apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts \
  scripts/webapp-architecture-legacy-allowlist.json
  do test ! -e "$path" || exit 1
done

rg 'ComiPathBrowserRuntime|EventDayDataStore|ComiPathDomCoordinator|application-contract-types|application-boundary-parsers' \
  apps/webapp/js tests scripts
```

Expected: all `test ! -e` checks pass and `rg` has no production/test references.

- [ ] **Step 4: Composition-root ownership audit**

Inspect `assemble-comipath-application.ts` and record the concrete class/factory used for:

- Event Day controller/View/repository/loaders
- Circle Data Source controller/View/client/downloader/settings
- Circle Status controller and pending-update controller/delivery/background process
- Route Guidance controller/View/session/map loader/optimizer/snapshot/matrix repositories
- Local Data Deletion controller/View/repository
- global notification View
- browser event binding

Run:

```bash
npx vitest run --root . \
  tests/production-composition-root.test.ts \
  tests/production-event-day-source-wiring.test.ts \
  tests/production-route-deletion-wiring.test.ts \
  tests/browser-event-binding.test.ts
```

Every canonical controller must be production-connected. An unused class file does not pass this gate.

- [ ] **Step 5: Architecture and semantic-facade enforcement**

```bash
node scripts/check-webapp-architecture.mjs
npx vitest run --root . \
  tests/architecture-boundaries.test.mjs \
  tests/event-day-layer-boundaries.test.mjs \
  tests/no-renamed-legacy-facades.test.mjs \
  tests/no-cross-feature-dom-coordinator.test.mjs \
  tests/comipath-application-responsibility.test.mjs
npm run check:webapp
npx biome check
git diff --check
```

The checker must reject fixture examples of a renamed runtime/data/DOM facade, a central type/parser file, concrete public export, Use Case browser import, and feature deep import.

- [ ] **Step 6: State ownership audit**

Use source inspection and tests to prove:

- active event/day mutable state: `ActiveEventDaySession` only;
- derived circle lists: `ActiveEventDayReader` only;
- pending GAS persisted state: `LocalEventDayState.gasOutbox` only;
- route runtime state: `RouteGuidanceSession` only;
- source preview/request generation: `CircleDataSourceSession` only;
- current cancelable source request: one controller/coordinator only;
- no duplicate mutable arrays/maps/tokens in root app files.

Run:

```bash
rg 'gasOutbox' apps/webapp/js
rg 'currentTarget|selectedTarget|routeAssetsCache|navigationState|csvPreviews|draftGasUrl|fetchedSheetNames' \
  apps/webapp/js/app apps/webapp/js/features
```

Review every result; raw result count alone is not the gate.

- [ ] **Step 7: Lifecycle and cancellation contracts**

```bash
npx vitest run --root . \
  tests/browser-application-lifecycle.test.ts \
  tests/comipath-application.test.ts \
  tests/application-assembly.test.ts \
  tests/circle-data-source-cancellation.test.ts \
  tests/pending-gas-update-background-process.test.ts
```

Prove DOM-before-ready stop settles, start failure is terminal, start/stop are idempotent, stop order is reverse ownership order, requests/workers/timers/listeners are cancelled, and stale completions do not update state/View.

- [ ] **Step 8: Characterization through production wiring**

```bash
npx vitest run --root . tests/apps-behavior-characterization.test.ts
```

Inspect the test source. It must use real assembly/controllers/use cases with fake external boundaries. It must not instantiate deleted facades or mock the handler being tested. It must verify repository effects, Session state, and View calls.

- [ ] **Step 9: Full unit/integration/build/GAS**

```bash
npm run verify
```

Record test-file and test counts, architecture file count, TypeScript result, Vite output, map-build verification, GAS build and contract results.

- [ ] **Step 10: Full E2E**

```bash
npm run test:e2e
```

Record passed/skipped counts and explain every skip. No new skip is allowed.

- [ ] **Step 11: C108 real-map smoke**

```bash
RUN_C108_SMOKE=1 npx playwright test \
  tests/c108-map-browser-smoke.spec.ts \
  --project=chromium --project=mobile-chromium
```

Expected: 4 map areas × desktop/mobile pass.

- [ ] **Step 12: Public-tree and secret audit**

```bash
node scripts/audit-public-tree.mjs
git ls-files
```

Confirm no raw CSV, GAS URLs, sheet data, external post body, credential, original map source, local absolute path, or private `/maps/` file is present.

- [ ] **Step 13: Application shell audit**

```bash
wc -l apps/webapp/js/app/comipath-application.ts
sed -n '1,240p' apps/webapp/js/app/comipath-application.ts
```

It must be at most 200 physical lines and contain lifecycle order only. It must not contain DOM query, repository call, routing, CSV/GAS logic, status transitions, deletion branches, or message formatting.

- [ ] **Step 14: Human browser smoke**

Perform and record:

1. initial event/day open;
2. CSV preview/apply/cancel/export;
3. Google Sheet list/preview/cancel;
4. route start/resume/reset;
5. candidate preview/confirm/cancel;
6. purchase/hold/exclude/restore;
7. pending GAS retry/discard;
8. event/day switch;
9. all deletion scopes;
10. settings close/event-day switch/pagehide during an in-flight request;
11. reload after persisted state;
12. mobile and keyboard operation.

- [ ] **Step 15: Update handoff and status from evidence**

The handoff must include:

- final Task commits and review results;
- old and renamed facade deletion evidence;
- final directory/ownership map;
- public APIs and concrete assembly list;
- state/lifecycle/cancellation contracts;
- test/build/E2E/C108/public-audit/human-smoke evidence;
- warnings and unresolved risks;
- rollback point;
- exact Phase 5E allowed scope.

Set Phase 5D to PASS only if every required gate passed. Otherwise keep BLOCKED and identify the owning correction Task.

- [ ] **Step 16: Final docs-only diff and commit**

```bash
git diff --check
git status --short --branch
git diff --stat
git add docs
git commit -m "docs(phase-5d): complete apps architecture handoff"
```

## Acceptance criteria

- all correction Tasks are independently reviewed;
- original and renamed legacy facades are absent;
- every feature controller is production-connected through assembly;
- semantic architecture rules pass without allowlist;
- production characterization tests prove effects through the real entry path;
- all state and lifecycle owners are singular and documented;
- clean verify, E2E, C108 smoke, public audit, Biome, and human smoke pass;
- final handoff is evidence-based and explicitly declares PASS or BLOCKED;
- Phase 5E starts only after a PASS handoff.
