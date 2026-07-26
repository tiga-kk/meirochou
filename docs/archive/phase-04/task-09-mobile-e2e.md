# Phase 4 Task 9: Cover Complete Mobile Management Flows

> **Depends on:** Tasks 3–8. **Scope:** Playwright user flows and intentional snapshots only. Do not fix unrelated design issues by rewriting component architecture in this Task.

## Goal

Exercise the management UI at Pixel 5/mobile Chromium width with fictional public fixtures, while proving the original navigation UI remains stable.

## Files

- Create: `tests/e2e/management.spec.ts`
- Create only approved new files under: `tests/e2e/management.spec.ts-snapshots/`
- Modify: `playwright.config.ts` only if required; retain the existing mobile Chromium project

## Fixture rules

- Use only `demo-v1` and additional explicitly fictional test registry/map fixtures already allowed by the public bundle contract.
- Route fictional GAS endpoint(s); never use network, a deployed Apps Script URL, or private map data.
- Seed LocalStorage through helper functions using runtime-valid schema objects.
- Freeze system time for deterministic export filenames and preview expiry tests, then restore it.
- Abort third-party CDN/Twitter routes as the baseline suite does.

## Test-first rule

Add one flow at a time. Before any integration correction, run the new focused test and record whether it fails. If it passes immediately because earlier Tasks already satisfy the end-to-end contract, keep it as fresh verification evidence; do not introduce an artificial product regression merely to force RED. If it fails, verify the failure is the intended missing browser behavior before editing production code.

This Task remains E2E-only. If a flow exposes a production defect, stop that
flow and return the fix plus a focused regression test to the owning Task
3–8 change or a separate `bugfix/*` commit. Do not hide production corrections
inside the Task 9 snapshot/test commit.

## Required flows

- [x] **Flow 1: First visit and CSV preview**

Open settings, verify unconfigured marker, select a fictional CSV through `setInputFiles`, see added counts, cancel once, preview again, apply, close settings, and verify map/navigation sees imported data.

- [x] **Flow 2: Day isolation**

Create/import two registry days, purchase/hold different spaces, switch days, and verify counts/history/state restore independently. Same-event day switch must not request a second map manifest.

- [x] **Flow 3: Event map isolation**

Intercept `/assets/events/manifest.json` with a two-event fictional registry. For `demo-v2`, fulfill its manifest with `eventId:"demo-v2"` and route its relative map/grid/points requests to byte-identical public `demo-v1` fixture files from the repository; do not add it to the normal build registry. During delayed second-manifest response, old map/state remains. After success, new map/state appears and route/pin selections reset. On malformed/mismatched manifest, old screen remains with an alert.

- [x] **Flow 4: GAS initial/replacement/refresh**

Fetch sheets, preview initial import, apply, explicitly refresh, and change sheet/source. Verify every operation displays diff and no GET occurs merely on settings open/reload.

- [x] **Flow 5: Failed POST and recovery**

Purchase with failing POST, verify local success plus pending panel, reload, retry success, and pending count zero. Exercise online burst coalescing.

- [x] **Flow 6: Pending locks and discard**

With pending entry, verify source and all affected deletion controls are disabled; attempt stale service action through normal UI timing and see rejection. Enter `未送信を破棄`, confirm local purchase remains, then change source.

- [x] **Flow 7: Four deletion scopes**

Verify circles preserves activity, activity clears activity, event-day falls back safely, all-events requires exact phrase, and pending preflight prevents partial all-event deletion.

- [x] **Flow 8: CSV export**

Intercept download, assert exact filename/content, local purchase `isSale`, removed rows omitted, and no state mutation.

- [x] **Flow 9: Source request and preview races**

Delay sheet/preview request A, start B or switch event/day, then complete A.
Only B/current-ref sheets, diff, and errors may appear. Expire a preview with a
frozen clock and assert apply keeps LocalStorage unchanged and requires a new
preview. Rapid apply clicks produce one save.

- [x] **Flow 10: Cross-panel model coherence**

After purchase enqueue, retry failure/success, discard, source apply, and
deletion, assert the selector pending label, source lock, outbox total, delete
lock, and export availability agree with one LocalStorage snapshot.

## Intentional snapshots

Create screenshots only for:

- settings shell with selector/source manager;
- source diff full-screen dialog;
- outbox recovery panel;
- scoped deletion dialog.

Use stable filenames and hide dynamic timestamps. Do not create screenshots for every state.

The current original baseline represents five logical scenarios in nine PNG
files because CI and local Linux variants coexist. Treat the directory as the
contract; do not hard-code either count in the test.

## Baseline protection

Before updating any new snapshot, record hashes/status of every tracked file
under `tests/e2e/webapp.spec.ts-snapshots/`. After the new snapshots are
generated, run:

```bash
git diff --exit-code -- tests/e2e/webapp.spec.ts-snapshots
```

Expected: zero diff. If an original snapshot changes, investigate and fix the regression; do not approve it as part of this Task without a separate design decision.

## Execution steps

- [x] **Step 1: Add flows incrementally and verify each focused test**

Use descriptive Japanese test names. Run `npx playwright test tests/e2e/management.spec.ts -g '<name>'` after each flow; do not wait until all flows are written.

- [x] **Step 2: Capture only the named snapshots**

Run update mode restricted to `management.spec.ts`, inspect each image at Pixel 5 dimensions, and confirm no private/sensitive value is visible.

- [x] **Step 3: Run full E2E twice**

```bash
npm run test:e2e
npm run test:e2e
```

Both runs must pass to catch leaked listeners, stale LocalStorage, nondeterministic time, and snapshot flakiness.

Install an outbound-request guard in the management spec. Allow only
localhost, the explicitly routed fictional GAS endpoint, and public test
assets. Abort every other request and fail if an unexpected GAS/private-map
destination was attempted.

- [x] **Step 4: Run full verification and baseline diff**

```bash
npm run verify
npx biome check
git diff --exit-code -- tests/e2e/webapp.spec.ts-snapshots
git diff --check
```

- [x] **Step 5: Present commit candidate**

Proposed message: `test(ui): cover mobile data management flows`.

## Review checklist

- Flows use UI for user behavior and direct seeding only for preconditions.
- Network counts/order and LocalStorage outcomes are asserted.
- Stale source results and expired previews cannot cross refs or apply twice.
- All management panels refresh coherently after state changes.
- New snapshots are minimal and intentional.
- Original snapshot directory has zero diff.
- Tests are repeatable and contain no real data.

## Completion record

- Production corrections: `746c603`, `c9848dd`.
- E2E flow and intentional snapshots: `9a77ba3`.
- Verification: `npm run verify` passed (351 Webapp tests, 27 GAS tests, typecheck, production build, and 9 map assets); `npm run test:e2e` passed twice with 30 mobile Chromium tests; `npx biome check`, `git diff --check`, and the original snapshot baseline diff passed.
