# Phase 8 Task 8: Final Regression / Closure Design

## Status and intent

Phase 8 Task 7 is implemented on `docs/phase-08-task-07-event-addition-operator-docs-plan`. Its current handoff records the next step as **Phase 8 final browser review / closure**. Task 8 formalizes that next step; it is not a new product feature.

Task 8 has four responsibilities:

1. independently re-audit the Task 7 multi-event verifier and operator-guide changes;
2. remove the one known retry-dependent E2E flake that reappeared during Task 7 final verification;
3. run a final Phase 8 regression/invariant audit with stricter no-retry browser evidence;
4. write a closure-candidate review record and stop for browser-side acceptance.

Task 8 must not add a real second production event, change runtime event/map behavior, add new architecture, or self-declare Phase 8 closed.

## Task 7 review finding carried into Task 8

Task 7 production/tooling scope is otherwise consistent with its plan:

- `scripts/verify-webapp-build.mjs` no longer requires registry IDs to equal exactly `["C108"]`;
- the verifier still rejects duplicate registered event IDs;
- the deployment fixture creates a real second temporary source/output bundle and verifies `result.eventIds === ["C108", "other-v1", "public-v1"]` and 39 verified files;
- C108-specific 17-file and explicit built-asset regressions remain;
- production registry and production map bundles were not modified;
- `guides/event-addition.md` documents wrapper `build-event` -> staging review -> safe copy -> registry merge -> verification -> manual smoke -> Cloudflare Pages / rollback;
- normal event addition is documented as data-only and `apps/webapp/js/**` remains a stop gate.

One residual test-quality issue remains. Task 7 final `npm run test:e2e:ci` completed with one retry/flaky occurrence in:

```text
tests/e2e/management.spec.ts
管理surfaceが背景scrollを固定し、viewport全体を遮蔽する
```

The observed mismatch was `Expected 160 / Received 166`; the retry passed.

This is not a Task 7 product regression. The same test had already failed during Phase 8 Task 0. Task 0 diagnosed browser scroll anchoring/layout settling between the test's synthetic `scrollTo(0, 160)` and the actual settings-open click. The production component correctly captures the scroll position at lock time and restores that captured value. Task 0 changed the test from immediate readback to a double `requestAnimationFrame`, but Task 7 proves that two frames are not a durable synchronization contract.

Task 8 therefore owns a **test-only** correction: measure the scroll position at the actual settings-toggle click event, before the production bubble listener calls `toggleSettings()`, then assert that closing the management surface restores that exact event-time value.

## Why the E2E correction belongs in the test

The product contract is:

```text
page is scrolled
-> user opens management surface
-> current scroll position at lock time is saved
-> background is fixed at scrollY=0 while management is open
-> closing restores the saved scroll position
```

The contract is not:

```text
window.scrollTo(0, 160)
-> browser must still report exactly 160 an arbitrary number of frames later
```

The current application binding uses a normal bubbling `click` listener on `#toggle-settings`. The E2E can safely attach a one-shot capturing listener to the same element before clicking. That listener records `window.scrollY` before the production bubbling handler runs. The test then compares post-close scroll position to that captured click-time value.

This removes dependence on how many animation frames Chrome needs to settle and does not alter product behavior.

### Required E2E shape

The test should replace the current pre-click `before` promise based on two animation frames with event-time capture equivalent to:

```ts
await page.evaluate(() => {
  document.body.style.minHeight = "2000px";
  delete document.body.dataset.managementScrollBeforeOpen;

  const toggle = document.getElementById("toggle-settings");
  if (!(toggle instanceof HTMLElement)) {
    throw new Error("#toggle-settings is missing");
  }

  toggle.addEventListener(
    "click",
    () => {
      document.body.dataset.managementScrollBeforeOpen = String(window.scrollY);
    },
    { capture: true, once: true },
  );

  window.scrollTo(0, 160);
});

await expect
  .poll(() => page.evaluate(() => window.scrollY))
  .toBeGreaterThan(0);

await page.locator("#toggle-settings").click();

const before = await page.evaluate(() =>
  Number(document.body.dataset.managementScrollBeforeOpen),
);
expect(Number.isFinite(before)).toBe(true);
expect(before).toBeGreaterThan(0);
```

The existing management-open assertions remain:

- settings surface visible/open;
- `body.style.position === "fixed"`;
- `body.style.overflow === "hidden"`;
- viewport corners covered by management surface;
- wheel input does not move `window.scrollY` while open;
- close hides the surface;
- post-close `window.scrollY` equals the captured click-time `before` value.

Do not add sleeps or hard-coded `166`, increase retries, change the product scroll-lock code, or loosen the final equality assertion.

## Scope

### Production/runtime files

No production/runtime file is expected to change.

Protected production paths include:

```text
apps/webapp/js/**
apps/webapp/events/**
apps/webapp/map-bundles/**
functions/**
integrations/**
vite.config.ts
package.json
package-lock.json
.github/workflows/**
playwright.config.ts
```

### Test file

Expected test-only change:

```text
M tests/e2e/management.spec.ts
```

### Closure evidence/docs

Expected new/modified docs:

```text
A docs/reviews/phase-08-task-08-final-regression-closure.md
M docs/status/progress.md
```

No other source change should be required.

## Task 8 verification strategy

### 1. Re-audit Task 7 before touching the E2E

Task 8 must confirm from the actual inherited tree that:

- no real C109 bundle exists;
- production registry does not contain C109;
- Task 7 changed only its expected verifier/tests/docs files;
- `verifyWebappBuild` accepts a second registered fixture event without weakening source/built byte equality;
- duplicate registry IDs still fail;
- C108 17-file and explicit built-asset checks still exist;
- `production registry excludes demo-v1` still exists;
- operator guide has the wrapper build-event path, safe copy, manual registry merge, no-app-TS gate, full verify/E2E, manual smoke, deployment and rollback.

If this audit finds a material Task 7 defect other than the known scroll flake, Task 8 may fix it only when all of the following are true:

1. the defect is directly caused by or exposed by Task 7;
2. the correction is small and contained in Task 7-owned verifier/test/docs files;
3. no product runtime/event data change is required;
4. the Task 8 review record states the defect and its exact correction.

Otherwise stop as `BLOCKED_TASK7_REVIEW` rather than expanding Task 8.

### 2. Preserve historical failure evidence

The Task 7 handoff already contains a real flaky occurrence, so Task 8 does not need to manufacture a deterministic RED by weakening the browser environment.

Before editing, run the focused management test repeatedly in the CI-equivalent container with retries disabled:

```bash
scripts/run-e2e-in-ci-container.sh \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium \
  --grep '背景scrollを固定' \
  --repeat-each=20 \
  --retries=0
```

Record pass/fail counts and any observed values. If it happens to pass 20/20, still proceed with the event-time measurement correction because Task 7 already supplied confirmed retry-dependent evidence and the current double-frame synchronization is not the product contract.

### 3. Prove the corrected test is stable

After the test-only change, run the same command with `--repeat-each=50 --retries=0`.

Acceptance:

```text
50/50 passed
0 failed
0 retries
```

If any iteration fails, Task 8 does not proceed to closure.

### 4. Final focused Phase 8 regression

Run the Phase 8-specific focused set covering the major outcomes:

```bash
npx vitest run --root . \
  tests/event-registry.test.ts \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts \
  tests/deployment-build.test.mjs \
  tests/application-assembly.test.ts \
  tests/first-use-guide-state.test.ts \
  tests/webapp-contracts.test.mjs
```

Also run the focused onboarding/management E2E specs under `mobile-chromium` with retries disabled.

### 5. Full automated closure gates

Run fresh:

```bash
npm run verify
scripts/run-e2e-in-ci-container.sh --retries=0
npm run test:e2e:ci
npm run check:webapp:architecture
node scripts/audit-public-tree.mjs
git diff --check
```

The no-retry full E2E run is the strict final signal. The canonical `npm run test:e2e:ci` is also run so the documented operator/CI path remains verified.

Any retry/flaky in the canonical run must be reported even if exit code is zero.

Task 8 may not update snapshots, raise retry counts, skip a failing test, widen timeouts merely to make a failure disappear, or change unrelated product code.

## Phase 8 invariant audit

The closure report must explicitly prove these outcomes from source/tests rather than only saying the suite is green.

### Event/map genericity

- strict event registry/parser supports multiple unique events;
- strict map manifest supports one or more areas;
- production map loader has no C108-specific contract branch;
- prefixes/labels/metersPerPixel originate from manifest data;
- data-only C999 fixture reaches runtime map catalog and route assets;
- build verifier accepts multiple registered events;
- C108-specific regressions remain as regressions rather than global restrictions.

### Wrapper boundary

- wrapper remains the owner of generated event assets;
- meirochou operator guide consumes `build-event` output rather than rebuilding OCR/map generation;
- Task 8 changes no wrapper code.

### Application structure

- Task 5 extracted management binding/projection and grouped route-guidance assembly remain covered by assembly/architecture tests;
- Task 8 performs no further architecture refactor.

### First-use UX

- Task 6 first-use marker and onboarding E2E remain present;
- `demo_ui` non-persistence behavior remains covered;
- Task 8 does not change onboarding copy/behavior.

### Operator workflow

- `guides/event-addition.md` is linked from README;
- new-event copy is safe for a nonexistent target directory;
- registry entry is merged, not copied into public tree;
- unregistered public bundle warning remains;
- generated assets use regenerate-not-patch ownership;
- full verification/manual smoke/deploy/rollback steps remain.

## Closure report

Create:

```text
docs/reviews/phase-08-task-08-final-regression-closure.md
```

It must contain:

- Task 8 start SHA and final candidate SHA;
- inherited Task 7 head and reviewed commits/files;
- Task 7 adversarial review verdict;
- the known scroll-flake history and root cause;
- pre-fix repeat result;
- exact test-only correction;
- post-fix 50-repeat result;
- focused Phase 8 result counts;
- `npm run verify` result/counts;
- no-retry full E2E totals;
- canonical E2E totals and retry/flaky count;
- architecture/public-tree/diff checks;
- protected-path diff result;
- Phase 8 invariant audit table;
- remaining external debt, if any, clearly separated from Phase 8 closure blockers.

The existing two GAS items remain `OPEN_EXTERNAL_DEBT` unless separately resolved. They do not become Task 8 implementation scope.

## Progress semantics

After all Task 8 implementation/verification gates are green, update `docs/status/progress.md` to:

```text
現在Task: Phase 8 Task 8 final regression / closure candidate — implementation complete / browser review pending
次に着手するTask: Phase 8 browser acceptance / closure decision
```

Do not write `Phase 8 CLOSED`, `browser accepted`, or equivalent.

Browser-side review is the final authority. Only after that external review may the status be changed to closed.

## Acceptance criteria

Task 8 is an acceptable closure candidate only if all are true:

1. Task 7 source/diff audit has no unresolved material defect.
2. Management scroll E2E uses click-time capture rather than animation-frame-count timing.
3. The focused management E2E passes 50/50 with `--retries=0` in the CI-equivalent container.
4. `npm run verify` passes.
5. Full CI-container E2E passes with `--retries=0`.
6. Canonical `npm run test:e2e:ci` passes and reports any retry/flaky honestly.
7. Architecture/public-tree/diff gates pass.
8. No production runtime/event/map data/package/workflow change occurs.
9. Phase 8 invariants are evidenced in the closure report.
10. Progress remains browser-review-pending rather than self-closed.

If any condition fails, Task 8 remains open or blocked; Phase 8 is not closed.