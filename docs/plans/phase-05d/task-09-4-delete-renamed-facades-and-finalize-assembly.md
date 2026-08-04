# Phase 5D Task 9.4: Delete Renamed Facades and Finalize Assembly

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Implement only this final production-architecture Task, then request review before rerunning Task 10.

**Status:** BLOCKED BY TASK 9.3
**Depends on:** Tasks 9.1, 9.2, and 9.3 reviewed
**Blocks:** Task 10 rerun and Phase 5E
**Commit candidate:** `refactor(app): remove renamed facades and finalize assembly`

## Goal

Delete the remaining renamed legacy facades and central “god” contract/parser files. Make `assemble-comipath-application.ts` construct every feature controller, View, use case, repository, client, loader, optimizer, and background process. Make `ComiPathApplication` own only lifecycle order.

This Task is complete only when the production browser entrypoint reaches every feature without constructing `ComiPathBrowserRuntime`, `EventDayDataStore`, or another equivalent cross-feature facade.

## Files

### Delete

- `apps/webapp/js/comipath-browser-runtime.js`
- `apps/webapp/js/event-day-data-store.ts`
- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`

The DOM coordinator was deleted in Task 9.3. The original six legacy paths and the architecture allowlist must also remain absent.

### Create as needed for distributed ownership

- responsibility-specific domain type files under each feature
- responsibility-specific runtime parsers under the owning feature infrastructure/UI boundary
- `apps/webapp/js/shared/domain/` files only for types whose meaning is identical in at least two features
- `tests/no-renamed-legacy-facades.test.mjs`
- `tests/production-composition-root.test.ts`

Do not create `application-types.ts`, `common-types.ts`, `boundary-parsers.ts`, `shared-parser.ts`, or another central replacement.

### Modify

- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/comipath-application.ts`
- `apps/webapp/js/app/run-comipath-in-browser.ts`
- `apps/webapp/js/app/browser-entrypoint.ts`
- all feature `public-api.ts` files
- all production/test imports from deleted files
- `scripts/check-webapp-architecture.mjs`
- `tests/architecture-boundaries.test.mjs`
- `tests/apps-behavior-characterization.test.ts`
- `tests/application-assembly.test.ts`
- `tests/comipath-application.test.ts`
- `tests/webapp-contracts.test.mjs`
- `package.json`

### Forbidden

- any compatibility facade that owns more than one canonical feature
- a direct-child root module that imports multiple feature internals and owns mutable state
- central contract/parser file with types or parsers from multiple features
- `ComiPathApplication` business logic
- concrete infrastructure export from feature public APIs
- relaxing checker rules or adding an allowlist
- behavior, storage, GAS, CSV, route, map, or visual change

## Preflight

```bash
git status --short --branch

test -e apps/webapp/js/comipath-browser-runtime.js
test -e apps/webapp/js/event-day-data-store.ts
test ! -e apps/webapp/js/comipath-dom-coordinator.js
test -e apps/webapp/js/features/event-day/domain/application-contract-types.ts
test -e apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts
test -e apps/webapp/js/app/assemble-comipath-application.ts
test -e apps/webapp/js/app/comipath-application.ts

npm run verify:webapp
npm run test:e2e
```

Stop if any Task 9.1–9.3 review is unresolved.

## Final application interfaces

```ts
export interface ApplicationController {
  start(): Promise<void> | void;
  stop(): void;
}

export interface BackgroundProcess {
  start(): void;
  stop(): void;
}

export interface ComiPathApplicationDependencies {
  readonly controllers: readonly ApplicationController[];
  readonly backgroundProcesses: readonly BackgroundProcess[];
}

export function createComiPathApplication(
  dependencies: ComiPathApplicationDependencies,
): StartableApplication;
```

`ComiPathApplication` may only:

1. start controllers in documented order;
2. start background processes after initial state is ready;
3. stop started resources in reverse order;
4. make startup failure terminal;
5. propagate the original failure.

## TDD procedure

- [ ] **Step 1: Write RED absence tests for semantic facades**

Create `tests/no-renamed-legacy-facades.test.mjs`:

```js
for (const path of [
  "apps/webapp/js/comipath-browser-runtime.js",
  "apps/webapp/js/event-day-data-store.ts",
  "apps/webapp/js/comipath-dom-coordinator.js",
  "apps/webapp/js/features/event-day/domain/application-contract-types.ts",
  "apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts",
]) {
  expect(existsSync(path), path).toBe(false);
}
```

- [ ] **Step 2: Write a RED composition-root test**

Create `tests/production-composition-root.test.ts`. Assemble with injectable fakes and prove all six controllers and the pending-GAS background process are started/stopped through `ComiPathApplication`.

```ts
expect(startOrder).toEqual([
  "event-day",
  "circle-data-source",
  "circle-status",
  "pending-gas-updates",
  "route-guidance",
  "local-data-deletion",
  "pending-gas-background",
]);
expect(stopOrder).toEqual([...startOrder].reverse());
```

The exact documented order may differ only when the plan and test are updated together before implementation.

- [ ] **Step 3: Verify RED**

```bash
npx vitest run --root . \
  tests/no-renamed-legacy-facades.test.mjs \
  tests/production-composition-root.test.ts
```

- [ ] **Step 4: Inventory every export from the central contract file**

```bash
rg '^export (type |interface |class |const |function )' \
  apps/webapp/js/features/event-day/domain/application-contract-types.ts
```

Assign each export to exactly one owner:

- Event Day
- Circle Status
- Route Guidance
- Circle Data Source
- Local Data Deletion
- genuinely shared immutable primitive

A type used by multiple features is not automatically shared; its business meaning determines ownership. Other features import it through the owner’s `public-api.ts`.

- [ ] **Step 5: Move parsers to their input owners**

Inventory parser exports and move them:

- event registry/map manifest/storage ref → Event Day infrastructure
- GAS/source payload → Circle Data Source infrastructure
- route map/grid/points → Route Guidance infrastructure
- custom event detail → the owning feature UI
- local deletion event detail → Local Data Deletion UI

Parser functions accept `unknown`, return validated domain types, and redact sensitive values from errors.

- [ ] **Step 6: Finalize composition root**

`assemble-comipath-application.ts` directly creates all concrete dependencies. It may import feature infrastructure paths; no other app file may do so. It must not create a legacy runtime/data facade.

- [ ] **Step 7: Finalize application lifecycle**

Replace the single `browserRuntime` dependency with explicit controller/background-process arrays. Preserve idempotent stop, terminal startup failure, and settled browser-start Promise behavior.

- [ ] **Step 8: Delete renamed facades and update imports**

Delete the five target files. Resolve each compile error by importing from the owning feature public API or by injecting an interface. Do not restore broad root-level exports.

- [ ] **Step 9: Strengthen the architecture checker**

The checker must fail for:

1. any original or renamed legacy facade path;
2. a direct child of `apps/webapp/js/` that imports internals from multiple canonical features and owns state/DOM/lifecycle;
3. central type/parser filenames and declarations spanning multiple features;
4. production assembly that does not create all canonical controllers;
5. tests that instantiate deleted facades;
6. `ComiPathApplication` over 200 physical lines or importing feature internals.

Add fixture tests for each rule. Do not use a migration allowlist.

- [ ] **Step 10: Rewrite characterization tests through the real entry path**

The tests must call `assembleComiPathApplication`/`runComiPathInBrowser` with fake external boundaries. They must prove repository effects, Session state, and View calls. They must not instantiate deleted facades or mock the handler being tested.

- [ ] **Step 11: Focused verification**

```bash
npx vitest run --root . \
  tests/no-renamed-legacy-facades.test.mjs \
  tests/production-composition-root.test.ts \
  tests/architecture-boundaries.test.mjs \
  tests/application-assembly.test.ts \
  tests/comipath-application.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/apps-behavior-characterization.test.ts
node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 12: Exact absence and ownership audit**

```bash
test ! -e apps/webapp/js/app.js
test ! -e apps/webapp/js/data-manager.ts
test ! -e apps/webapp/js/ui-manager.js
test ! -e apps/webapp/js/config.ts
test ! -e apps/webapp/js/types/domain.ts
test ! -e apps/webapp/js/types/boundary-parsers.ts
test ! -e apps/webapp/js/comipath-browser-runtime.js
test ! -e apps/webapp/js/event-day-data-store.ts
test ! -e apps/webapp/js/comipath-dom-coordinator.js
test ! -e apps/webapp/js/features/event-day/domain/application-contract-types.ts
test ! -e apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts
test ! -e scripts/webapp-architecture-legacy-allowlist.json

wc -l apps/webapp/js/app/comipath-application.ts
rg 'ComiPathBrowserRuntime|EventDayDataStore|ComiPathDomCoordinator|application-contract-types|application-boundary-parsers' \
  apps/webapp/js tests scripts
```

Expected: all absence checks pass; line count is at most 200; `rg` returns no production/test references.

- [ ] **Step 13: Full clean verification**

```bash
rm -rf node_modules
npm ci
npm run verify
npm run test:e2e
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts \
  --project=chromium --project=mobile-chromium
node scripts/audit-public-tree.mjs
npx biome check
git diff --check
git status --short --branch
```

- [ ] **Step 14: Human smoke before commit**

Verify initial open, CSV/GAS preview and apply/cancel, route start/resume/change, purchase/hold/exclude/restore, pending GAS retry/discard, event/day switch, and all deletion scopes in the browser preview.

- [ ] **Step 15: Commit**

```bash
git add -A apps/webapp/js package.json scripts tests
git commit -m "refactor(app): remove renamed facades and finalize assembly"
```

## Acceptance criteria

- original and renamed legacy facades are absent;
- central contract/parser replacements are absent;
- production entrypoint uses explicit feature controllers assembled in one composition root;
- `ComiPathApplication` contains lifecycle only and is at most 200 lines;
- architecture checker prevents semantic facade reintroduction;
- characterization tests exercise production wiring and observable effects;
- no behavior or external contract changed;
- clean verify, full E2E, C108 smoke, public audit, Biome, and human smoke pass;
- Task 10 may be rerun only after an independent review approves this Task.
