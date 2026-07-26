# Phase 3 Task 8: Verify Browser Persistence, Retry, and Locks

> **Depends on:** Tasks 4–7. **Scope:** Browser integration without adding Phase 4 management UI or changing visual snapshots.

## Goal

Prove that the real App/browser wiring keeps local purchase state through POST failure and reload, retries persisted entries, avoids implicit GET, and enforces service locks. Inspect LocalStorage and network calls directly because pending diagnostics UI belongs to Phase 4.

## Files

- Create: `tests/e2e/gas-sync.spec.ts`
- Modify: `playwright.config.ts` only if required to include the new spec; retain one mobile Chromium project
- Modify: `package.json` only if an explicit E2E subcommand is useful; `npm run test:e2e` must still run all specs

## Test fixture contract

Add local helper functions inside the E2E spec to seed/read only public demo state:

```text
state key:       comipath:v1:demo-v1:day1:state
index key:       comipath:v1:index:event-days
last-opened key: comipath:v1:last-opened
```

Seed a runtime-valid `schemaVersion: 1` GAS state using the demo event/day and fictional circles. Do not import production TypeScript into `page.addInitScript`; serialize a small literal fixture and validate the fixture in a Vitest schema test if it changes.

Route a fictional but production-shaped endpoint such as `https://script.google.com/macros/s/example-e2e-deployment/exec`. Playwright intercepts it before network access. Abort CDN/Twitter requests as the existing E2E suite does.

## Test-first rule

Add one browser case at a time and run it before making integration corrections. If an earlier Task already satisfies the case and it passes on the first run, keep that result as characterization evidence; do not introduce an artificial regression to manufacture RED. When it fails, confirm the failure is the intended persistence/network-order gap before changing production wiring.

## Required E2E cases

- [x] **Case 1: Cached GAS startup performs no GET**

Seed a GAS state with no queue, open `/`, and route the fake endpoint. Assert zero GET and zero POST requests during startup. Verify the cached circle is rendered/available through the existing navigation flow.

- [x] **Case 2: Purchase is local before failed POST**

Return `{ok:false,status:"error"}` for the first POST. Click the existing purchase button. During the route handler, read LocalStorage from the page and assert `purchased` plus one matching outbox entry already exist. After failure, assert both remain and App continues to respond.

- [x] **Case 3: Reload retries and clears pending entry**

After Case 2 state is persisted, reload with a successful POST route. Assert exactly one desired-state request, purchased remains true, and the outbox becomes empty. Assert no GAS GET occurs.

- [x] **Case 4: Online recovery is coalesced**

Seed one pending entry, start with failed POST, then change the route to success and dispatch several `online` events synchronously. Assert one successful retry sequence and no duplicate remote calls after the entry is removed.

- [x] **Case 5: Pending locks remain service-side**

Exercise the typed service through an App test hook only if the project already has a test-only hook pattern. Otherwise retain this as a Vitest integration test in `source-settings-service.test.ts`; do not expose production globals solely for E2E. Assert URL, sheet, type, CSV apply, GAS apply, and deletion remain unchanged.

Cross-event/day retry is already a required Vitest integration in Task 6 and must remain there. Do not add a second normal-build event or a production debug hook merely to repeat that assertion in Playwright.

## Execution steps

- [x] **Step 1: Add the spec and confirm RED against missing Phase 3 wiring**

```bash
npx playwright test tests/e2e/gas-sync.spec.ts
```

Expected: behavioral assertion failures, not missing browser or unrelated snapshot errors.

- [x] **Step 2: Make only integration-level corrections**

Fix dependency wiring, lifecycle timing, and test seams. Do not add outbox panels, settings forms, or debug data to rendered production HTML.

- [x] **Step 3: Run focused and full browser suites**

```bash
npx playwright test tests/e2e/gas-sync.spec.ts
npm run test:e2e
```

Expected: new tests and all original tests pass. Existing PNG snapshots remain byte-identical and no new visual snapshot is needed.

- [x] **Step 4: Run full verification**

```bash
npm run verify
npx biome check
git diff --check
```

- [x] **Step 5: Present commit candidate**

Proposed message: `test(sync): cover offline purchase recovery`.

## Review checklist

- Tests observe persisted state and network order, not private implementation fields.
- No production global/debug endpoint is introduced just for Playwright.
- The fake endpoint and fixture contain no real identifiers.
- Baseline visual behavior and screenshots are unchanged.
- Cross-event retry is covered at the strongest safe layer available.
