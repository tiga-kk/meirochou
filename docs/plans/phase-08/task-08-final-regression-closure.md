# Phase 8 Task 8: Final Regression / Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the known retry-dependent management-scroll E2E flake, independently re-audit Task 7 and Phase 8 invariants, and produce a fully verified Phase 8 closure candidate without changing production runtime/data behavior.

**Architecture:** Task 8 is a verification/closure task, not a feature task. Keep all production/runtime/event data frozen; replace the test's frame-count-based scroll baseline with click-time event capture, stress that regression with retries disabled, then run the complete Phase 8 and repository gates and write one final closure-candidate review record for browser acceptance.

**Tech Stack:** Playwright 1.61.1, Node.js 22.14.0, npm 10.9.2, Vitest 4, existing CI-equivalent Playwright Docker runner, Markdown review/status documentation.

**Spec:** `docs/specs/2026-08-21-phase-08-task-08-final-regression-closure-design.md`

## Global Constraints

- Repository: `tiga-kk/meirochou`.
- Work only on `docs/phase-08-task-08-final-regression-closure-plan`.
- The branch is based on the current Phase 8 Task 7 implementation branch. Start from the current remote Task 8 branch HEAD; do not reset to a SHA copied from this document.
- Task 8 is the Phase 8 final regression / closure **candidate**, not a new feature.
- Do not add C109, C110, or any real second production event.
- Do not modify `apps/webapp/js/**`, `apps/webapp/events/**`, `apps/webapp/map-bundles/**`, `functions/**`, `integrations/**`, `vite.config.ts`, `package.json`, `package-lock.json`, `.github/workflows/**`, or `playwright.config.ts`.
- Do not modify `tiga-kk/meirochou_wrapper`.
- Do not change Task 6 onboarding behavior or copy.
- Do not refactor Task 5 application assembly further.
- Do not weaken Task 7 multi-event verification, C108 regressions, byte-equality checks, or operator-guide safeguards.
- Do not add sleeps to hide the management-scroll flake.
- Do not hard-code `166` or another observed browser-specific scroll value.
- Do not raise Playwright retries, update snapshots, skip tests, loosen visual/assertion thresholds, or widen timeouts merely to obtain green.
- The strict final browser signal is a full CI-container E2E run with `--retries=0`.
- `npm run test:e2e:ci` is also required because it is the canonical documented operator/CI command.
- The two existing GAS items remain `OPEN_EXTERNAL_DEBT`; Task 8 does not absorb them.
- Codex must not write `Phase 8 CLOSED`, `browser accepted`, or equivalent. Browser-side review remains final authority.

## Expected implementation scope

Expected code/test change:

```text
M tests/e2e/management.spec.ts
```

Expected evidence/docs:

```text
A docs/reviews/phase-08-task-08-final-regression-closure.md
M docs/status/progress.md
```

The design and plan already present on the branch are planning inputs, not Task 8 implementation changes.

No other implementation file should be necessary. If a production file becomes necessary, stop and classify the reason instead of expanding scope.

---

## Task 8.0: Capture the inherited baseline and adversarially review Task 7

**Goal:** Record the exact Task 8 implementation start, prove the branch inherits the completed Task 7 tree, and independently verify that Task 7 has no unresolved material defect other than the known management-scroll E2E flake.

**Do not:** Edit files, merge main, repair unrelated failures, add an event, or assume the Task 7 self-report is browser acceptance.

**Files:**
- Read: `docs/specs/2026-08-21-phase-08-task-08-final-regression-closure-design.md`
- Read: `docs/plans/phase-08/task-08-final-regression-closure.md`
- Read: `docs/status/progress.md`
- Read: `docs/plans/phase-08/task-07-event-addition-operator-docs.md`
- Read: `guides/event-addition.md`
- Read: `scripts/verify-webapp-build.mjs`
- Read: `tests/deployment-build.test.mjs`
- Read: `tests/event-registry.test.ts`
- Read: `tests/webapp-contracts.test.mjs`
- Read: `tests/e2e/management.spec.ts`
- Read: `docs/reviews/phase-08-task-00-baseline-verification.md`
- Read: `package.json`
- Read: `scripts/run-e2e-in-ci-container.sh`

**Interfaces:**
- Consumes: current Task 7 implementation tree and its recorded verification evidence.
- Produces: `TASK_START_SHA`, exact baseline evidence, Task 7 browser-style source audit verdict.

- [ ] **Step 1: Sync the exact remote Task 8 branch and record `TASK_START_SHA`**

```bash
git fetch origin --prune
git checkout docs/phase-08-task-08-final-regression-closure-plan
git pull --ff-only
export TASK_START_SHA="$(git rev-parse HEAD)"
printf 'TASK_START_SHA=%s\n' "$TASK_START_SHA"
git status --short
```

Expected: branch is current and working tree is clean except unrelated user-owned files. Never reset/delete unrelated files.

- [ ] **Step 2: Prove the Task 7 implementation commits are inherited**

```bash
git log --oneline --decorate -12

git log --oneline --all --grep='fix(build): allow multiple production events' -1
git log --oneline --all --grep='docs(phase-08): add event addition operator guide' -1
git log --oneline --all --grep='docs(phase-08): record task 7 verification' -1
```

Expected: all three Task 7 implementation/handoff commits are ancestors of the current branch. If not, stop as:

```text
BLOCKED_WRONG_BASE
```

Do not recreate Task 7 manually.

- [ ] **Step 3: Audit the inherited Task 7 changed-file scope**

Identify the Task 7 planning commit immediately before implementation from history and compare it to the Task 7 final handoff commit.

At design time the expected Task 7 implementation file set is:

```text
M README.md
M docs/status/progress.md
A guides/event-addition.md
M scripts/verify-webapp-build.mjs
M tests/deployment-build.test.mjs
M tests/event-registry.test.ts
M tests/webapp-contracts.test.mjs
```

Verify from git history rather than trusting this list alone.

Task 7 must not have changed:

```text
apps/webapp/js/**
apps/webapp/events/**
apps/webapp/map-bundles/**
vite.config.ts
package.json
package-lock.json
integrations/**
functions/**
.github/workflows/**
playwright.config.ts
```

If the actual Task 7 implementation touched a protected path, stop as `BLOCKED_TASK7_REVIEW` and report the exact path/diff.

- [ ] **Step 4: Re-audit the Task 7 verifier behavior from source**

Run:

```bash
! git grep -n 'Phase 5B event registry must contain only C108' -- \
  scripts/verify-webapp-build.mjs \
  tests/deployment-build.test.mjs

! git grep -n 'production registry contains only C108' -- \
  tests/event-registry.test.ts

git grep -n 'duplicate eventId in event registry' -- \
  scripts/verify-webapp-build.mjs \
  tests/deployment-build.test.mjs

git grep -n 'C108 public bundle must contain exactly 17 files' -- \
  scripts/verify-webapp-build.mjs

git grep -n 'built C108 asset missing' -- \
  scripts/verify-webapp-build.mjs

git grep -n 'production registry excludes demo-v1' -- \
  tests/event-registry.test.ts
```

Expected:

- the two historical one-event-only searches produce no matches and exit success because of `!`;
- duplicate registry protection exists;
- C108-specific regression checks remain;
- demo-v1 production exclusion remains.

- [ ] **Step 5: Prove the synthetic second event is a real temporary bundle path, not only a second ID string**

Inspect `addRegisteredBundle()` in `tests/deployment-build.test.mjs` and verify it creates both:

```text
<temp>/apps/webapp/map-bundles/other-v1/**
<temp>/dist/webapp/assets/maps/other-v1/**
```

and rewrites the copied manifest to:

```text
eventId = "other-v1"
```

and registers:

```json
{
  "eventId": "other-v1",
  "mapBundle": "../maps/other-v1/manifest.json",
  "mapBundleContract": "event"
}
```

Verify the positive test expects:

```text
result.eventIds == ["C108", "other-v1", "public-v1"]
result.verifiedFiles == 39
```

If it only mutates an ID without source/output bundle files, stop as `BLOCKED_TASK7_REVIEW`.

- [ ] **Step 6: Re-audit the operator guide contract**

Check that `guides/event-addition.md` contains all of these concepts:

```bash
git grep -n 'build-event' -- guides/event-addition.md
git grep -n 'event-registry-entry.json' -- guides/event-addition.md
git grep -n 'apps/webapp/map-bundles' -- guides/event-addition.md
git grep -n 'apps/webapp/events/manifest.json' -- guides/event-addition.md
git grep -n 'apps/webapp/js' -- guides/event-addition.md
git grep -n 'npm run verify' -- guides/event-addition.md
git grep -n 'npm run test:e2e:ci' -- guides/event-addition.md
git grep -n 'Cloudflare Pages' -- guides/event-addition.md
git grep -n 'rollback' -- guides/event-addition.md
```

Read the surrounding prose and verify it says:

- staging `event-registry-entry.json` is merged into the registry and is not copied into public tree;
- new-event copy refuses an existing target directory;
- unregistered directories under `apps/webapp/map-bundles` may still be published;
- generated assets are regenerated from wrapper inputs rather than hand-patched in meirochou;
- application TypeScript changes are a stop condition for the normal event-addition workflow.

- [ ] **Step 7: Confirm current production data is still unchanged**

```bash
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const registry = JSON.parse(
  fs.readFileSync('apps/webapp/events/manifest.json', 'utf8'),
);
console.log(JSON.stringify(registry.events.map((event) => event.eventId)));
if (registry.events.some((event) => event.eventId === 'C109')) process.exit(1);
NODE

test ! -e apps/webapp/map-bundles/C109
```

Expected: no C109 production registry entry or bundle.

- [ ] **Step 8: Run the inherited focused Task 7 suite before changing the E2E**

```bash
npx vitest run --root . \
  tests/deployment-build.test.mjs \
  tests/event-registry.test.ts \
  tests/webapp-contracts.test.mjs \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts
```

Record exact file/test counts and exit code.

- [ ] **Step 9: Record the Task 7 review verdict in working notes**

The expected verdict is:

```text
Task 7 source/diff review: ACCEPTABLE
Known carryover: management scroll E2E retry/flaky only
```

If another material defect is found, do not silently fix it. Apply the design's Task 7 defect gate:

```text
directly caused/exposed by Task 7
AND small
AND contained in Task 7-owned verifier/test/docs
AND no production runtime/data change
```

If all four are not true, stop as `BLOCKED_TASK7_REVIEW`.

No commit for Task 8.0.

---

## Task 8.1: Stabilize the management scroll E2E against browser settling

**Goal:** Make the E2E measure the actual scroll position at the settings-toggle click event, which is the product lock-time contract, rather than assuming a fixed number of animation frames is enough to preserve a synthetic scroll target.

**Do not:** Change `ComipathSettings`, `bind-settings-shell-events.ts`, CSS, app runtime, retries, timeouts, snapshots, or expected equality semantics.

**Files:**
- Modify: `tests/e2e/management.spec.ts`

**Interfaces:**
- Consumes: existing `#toggle-settings` bubbling click binding and management scroll-lock behavior.
- Produces: the same E2E user-flow assertion, with `before` defined as the click-capture-time `window.scrollY`.

### Root-cause contract

The existing production event binder attaches a normal bubbling listener:

```ts
listen(settingsToggle, "click", () => {
  application.toggleSettings(settingsToggle);
});
```

A one-shot `{ capture: true }` listener installed by the E2E therefore observes `window.scrollY` before that production bubble listener locks the page.

### Characterization / historical RED evidence

- [ ] **Step 1: Run the current test 20 times in the CI container with retries disabled**

```bash
scripts/run-e2e-in-ci-container.sh \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium \
  --grep '背景scrollを固定' \
  --repeat-each=20 \
  --retries=0
```

Record:

```text
total
passed
failed
exit code
any Expected/Received values
```

Task 7 already recorded a real `Expected 160 / Received 166` retry-dependent occurrence, so 20/20 passing here does not invalidate the defect. Do not try to induce failure by changing browser timing.

- [ ] **Step 2: Replace the double-animation-frame baseline with click-time capture**

In the test `管理surfaceが背景scrollを固定し、viewport全体を遮蔽する`, replace this current block:

```ts
const before = await page.evaluate(() => {
  document.body.style.minHeight = "2000px";
  window.scrollTo(0, 160);
  return new Promise<number>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY))),
  );
});

await page.locator("#toggle-settings").click();
```

with:

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

Keep all existing assertions after the click, including the final exact restoration:

```ts
await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
```

Do not replace exact equality with a tolerance.

- [ ] **Step 3: Run the focused test once with retries disabled**

```bash
scripts/run-e2e-in-ci-container.sh \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium \
  --grep '背景scrollを固定' \
  --retries=0
```

Expected: 1 passed, 0 failed, 0 retries.

- [ ] **Step 4: Stress the corrected test 50 times with retries disabled**

```bash
scripts/run-e2e-in-ci-container.sh \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium \
  --grep '背景scrollを固定' \
  --repeat-each=50 \
  --retries=0
```

Required acceptance:

```text
50 passed
0 failed
0 retries
exit 0
```

If even one iteration fails, stop Task 8. Do not add sleep/retry/tolerance. Inspect trace/error and classify the real race.

- [ ] **Step 5: Run the whole management E2E spec with retries disabled**

```bash
scripts/run-e2e-in-ci-container.sh \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium \
  --retries=0
```

Record exact total/pass/fail/skip counts.

- [ ] **Step 6: Verify only the intended test file changed**

```bash
git diff --name-status "$TASK_START_SHA" --
git diff -- tests/e2e/management.spec.ts
git diff --check
```

At this point expected implementation diff is only:

```text
M tests/e2e/management.spec.ts
```

- [ ] **Step 7: Commit the test-only correction**

```bash
git add tests/e2e/management.spec.ts
git commit -m "test(e2e): stabilize management scroll restore"
```

---

## Task 8.2: Re-run focused Phase 8 outcomes and audit invariants

**Goal:** Prove the major Phase 8 outcomes still exist together after Task 8.1, independently of the full-suite green signal.

**Do not:** Modify code to make the audit easier, add a real event, edit wrapper code, or replace source evidence with statements copied from old progress records.

**Files:**
- Read: Phase 8 production/test/doc files listed below.
- No file modification required in this task.

**Interfaces:**
- Consumes: completed Task 1〜7 implementation and Task 8.1 test correction.
- Produces: exact invariant evidence used by the final closure report.

- [ ] **Step 1: Run the focused Phase 8 unit/integration suite**

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

Record exact file/test counts and exit code.

- [ ] **Step 2: Run focused Task 6 + management browser coverage without retries**

```bash
scripts/run-e2e-in-ci-container.sh \
  tests/e2e/first-launch-onboarding.spec.ts \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium \
  --retries=0
```

Record exact total/pass/fail/skip counts.

- [ ] **Step 3: Prove strict production event loading remains event-generic**

Run:

```bash
! git grep -n 'C108' -- \
  apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts

git grep -n 'mapBundleContract' -- \
  apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts \
  apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts
```

Expected:

- runtime HTTP map loader contains no C108-specific branch/string;
- strict/legacy contract selection remains data-driven.

Then inspect `tests/phase-08-data-only-event-addition.test.ts` and record that C999 proceeds through:

```text
production registry parser
-> resolveEventMapManifestUrl
-> strict runtime manifest loader
-> runtime map area catalog
-> HttpRouteMapAssetsLoader
-> points/grid-meta/grid bytes
```

and that raw strict `areaId` and pathdata `map_id` are intentionally allowed to differ.

- [ ] **Step 4: Prove manifest-owned area metadata remains in the strict contract**

Inspect strict map-manifest parser/types/tests and record evidence for:

```text
areas: 1 or more
areaId
metersPerPixel
prefixes
labels
assets.svg
assets.points
assets.gridMeta
assets.grid
```

Do not add a new parser or schema.

- [ ] **Step 5: Prove Task 7 build verification is multi-event without losing C108 regressions**

Run:

```bash
git grep -n 'accepts multiple registered events' -- tests/deployment-build.test.mjs
git grep -n 'duplicate registered event IDs' -- tests/deployment-build.test.mjs
git grep -n 'C108 public bundle must contain exactly 17 files' -- scripts/verify-webapp-build.mjs
git grep -n 'built C108 asset missing' -- scripts/verify-webapp-build.mjs
```

Record all matches.

- [ ] **Step 6: Prove Task 5 targeted application refactor remains present and bounded**

```bash
test -f apps/webapp/js/app/bind-management-action-events.ts
test -f apps/webapp/js/app/browser-management-projection.ts

git grep -n 'bindManagementActionEvents' -- \
  apps/webapp/js/app \
  tests/application-assembly.test.ts

git grep -n 'BrowserManagementProjection\|browserManagementProjection' -- \
  apps/webapp/js/app \
  tests/application-assembly.test.ts
```

Do not refactor these modules in Task 8.

- [ ] **Step 7: Prove Task 6 first-use UX remains present without modifying it**

```bash
git grep -n 'meirochou.first-use-guide-seen' -- \
  apps/webapp/js/data/local-state-adapters.ts \
  tests/first-use-guide-state.test.ts

git grep -n 'readFirstUseGuideSeen\|markFirstUseGuideSeen' -- \
  apps/webapp/js/app/browser-application.ts

test -f tests/e2e/first-launch-onboarding.spec.ts
```

Read the focused tests and record that normal launch is one-time while `demo_ui` does not persist the marker.

- [ ] **Step 8: Prove the operator workflow remains linked and data-only**

```bash
git grep -n 'guides/event-addition.md' -- README.md
git grep -n 'build-event' -- guides/event-addition.md
git grep -n 'git diff --name-only -- apps/webapp/js' -- guides/event-addition.md
git grep -n 'npm run test:e2e:ci' -- guides/event-addition.md
```

Read the relevant sections and record:

```text
wrapper owns generation
registry entry is merged, not published as a file
unregistered bundle directories may still publish
regenerate-not-patch
manual smoke
Cloudflare Pages / rollback link
```

- [ ] **Step 9: Reconfirm Task 8 protected production paths are untouched**

```bash
git diff --name-only "$TASK_START_SHA"..HEAD -- \
  apps/webapp/js \
  apps/webapp/events \
  apps/webapp/map-bundles \
  functions \
  integrations \
  vite.config.ts \
  package.json \
  package-lock.json \
  .github/workflows \
  playwright.config.ts
```

Expected: no output.

No commit for Task 8.2.

---

## Task 8.3: Run strict full closure verification

**Goal:** Produce fresh whole-repository evidence that Phase 8 is a closure candidate, including a full browser run that cannot hide failures behind retries.

**Do not:** Continue after a regression without classification, rerun repeatedly until lucky green, change unrelated code, or update snapshots.

**Files:**
- No source modification expected.

**Interfaces:**
- Consumes: Task 8.1 correction and Task 8.2 invariant evidence.
- Produces: final automated verification measurements for the closure report.

- [ ] **Step 1: Run fresh `npm run verify`**

```bash
npm run verify
```

Record exact exit code and all reported suite counts, including:

```text
webapp Vitest files/tests
Route Guidance files/tests
Phase 05D regression files/tests
architecture result/file count
build verified asset count
GAS files/tests
catalog extension tests
```

Expected: exit 0.

- [ ] **Step 2: Run the entire Playwright suite with retries disabled**

```bash
scripts/run-e2e-in-ci-container.sh --retries=0
```

This is the strict Task 8 closure gate.

Record:

```text
total
passed
failed
skipped
flaky/retry (must be 0 because retries disabled)
exit code
```

Required: exit 0 and zero failed.

If a test fails, do one focused rerun of that exact test with `--retries=0` only for diagnosis. Do not repeatedly rerun the full suite until it happens to pass.

Classification rules:

```text
TASK8_REGRESSION
  failure is caused by tests/e2e/management.spec.ts correction

PREEXISTING_OR_INDEPENDENT
  failure reproduces from TASK_START_SHA and is unrelated to Task 8 diff

ENVIRONMENTAL
  failure has concrete Docker/browser/system evidence and not assertion/product evidence
```

A non-Task8 failure blocks Phase 8 closure unless the browser reviewer explicitly accepts it as external debt. Codex must not absorb unrelated fixes automatically.

- [ ] **Step 3: Run the canonical documented E2E command**

```bash
npm run test:e2e:ci
```

Record exact:

```text
total
passed
failed
skipped
retry/flaky count
exit code
```

Expected: exit 0. Any retry/flaky must be recorded even when exit 0.

Task 8 acceptance target is zero retry/flaky here as well. If a retry occurs, diagnose the exact test and do not self-close Phase 8.

- [ ] **Step 4: Run architecture/public-tree/hygiene gates**

```bash
npm run check:webapp:architecture
node scripts/audit-public-tree.mjs
git diff --check
```

Expected: all pass.

- [ ] **Step 5: Confirm no real event or product data was added**

```bash
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const registry = JSON.parse(
  fs.readFileSync('apps/webapp/events/manifest.json', 'utf8'),
);
console.log(JSON.stringify(registry.events.map((event) => event.eventId)));
if (registry.events.some((event) => event.eventId === 'C109')) process.exit(1);
NODE

test ! -e apps/webapp/map-bundles/C109
```

Expected: succeeds.

- [ ] **Step 6: Run final diff hygiene before writing evidence**

```bash
git status --short
git diff --name-status "$TASK_START_SHA"..HEAD
git diff --check
```

Expected before documentation changes:

```text
M tests/e2e/management.spec.ts
```

plus only the already-present planning docs relative to the Task 7 base, not as Task 8 implementation diff from `TASK_START_SHA`.

No commit in Task 8.3.

---

## Task 8.4: Write the final closure-candidate review and progress handoff

**Goal:** Convert the actual Task 8 measurements and source audit into one review artifact, update progress to browser-review-pending, and stop without self-closing Phase 8.

**Do not:** Invent counts, copy stale Task 7 measurements as fresh Task 8 results, mark browser acceptance, resolve external GAS debt, or merge main.

**Files:**
- Create: `docs/reviews/phase-08-task-08-final-regression-closure.md`
- Modify: `docs/status/progress.md`

**Interfaces:**
- Consumes: Task 8.0〜8.3 measured evidence.
- Produces: closure candidate review artifact and canonical handoff status.

- [ ] **Step 1: Create the review file with exact measured evidence**

Create `docs/reviews/phase-08-task-08-final-regression-closure.md` with this structure and fill every value from actual commands:

```markdown
# Phase 8 Task 8 final regression / closure candidate

## Baseline

- TASK_START_SHA: `<actual>`
- Task 7 inherited final head: `<actual>`
- Task 8 candidate head before docs: `<actual>`
- Node/npm/Playwright environment: `<actual>`

## Task 7 adversarial review

- changed-file scope: PASS / exact files
- multi-event verifier: PASS / evidence
- C108 regressions retained: PASS / evidence
- production registry/map data unchanged: PASS
- operator guide workflow: PASS / evidence
- material defect found: none, except known management scroll test flake

## Management scroll flake

- historical Task 7 occurrence: Expected 160 / Received 166, retry passed
- Task 0 historical diagnosis: browser settling/scroll anchoring vs pre-click test baseline
- pre-fix 20-repeat result: `<actual>`
- correction: click-capture-time scroll measurement, test-only
- post-fix 50-repeat result: `<actual>`
- full management spec result: `<actual>`

## Phase 8 invariant audit

| Invariant | Evidence | Verdict |
|---|---|---|
| strict runtime event map loading is not C108-branched | `<actual grep/test>` | PASS |
| manifest owns area/prefix/label/meter metadata | `<actual>` | PASS |
| data-only C999 reaches runtime route assets | `<actual>` | PASS |
| build verifier accepts multiple registered events | `<actual>` | PASS |
| C108 remains a regression, not a global restriction | `<actual>` | PASS |
| wrapper remains generation owner | `<actual guide evidence>` | PASS |
| Task 5 application split remains covered | `<actual>` | PASS |
| Task 6 first-use UX remains covered | `<actual>` | PASS |
| Task 7 operator workflow remains linked/data-only | `<actual>` | PASS |

## Focused verification

- Phase 8 Vitest set: `<actual files/tests/result>`
- onboarding + management E2E no-retry: `<actual>`

## Full verification

- npm run verify: `<actual>`
- full E2E --retries=0: `<actual totals>`
- npm run test:e2e:ci: `<actual totals/retries>`
- architecture: `<actual>`
- public-tree audit: `<actual>`
- git diff --check: PASS

## Scope audit

- production runtime diff: none
- production registry diff: none
- production map-bundle diff: none
- package/workflow/Vite diff: none
- wrapper diff: none
- Task 8 implementation files: `<actual>`

## External debt

The existing two GAS evidence items remain OPEN_EXTERNAL_DEBT and are not Phase 8 Task 8 implementation scope.

## Verdict

`CLOSURE_CANDIDATE_BROWSER_REVIEW_PENDING`

Do not mark Phase 8 closed until browser-side review accepts this evidence.
```

Do not leave angle-bracket placeholders in the committed file. Replace all with actual values.

- [ ] **Step 2: Update `docs/status/progress.md` minimally**

Preserve all prior Phase 8 Task 1〜7 history.

Change current state to the equivalent of:

```text
現在Task: Phase 8 Task 8 final regression / closure candidate — implementation complete / browser review pending
次に着手するTask: Phase 8 browser acceptance / closure decision
canonical Task 8 plan: docs/plans/phase-08/task-08-final-regression-closure.md
Task 8 design: docs/specs/2026-08-21-phase-08-task-08-final-regression-closure-design.md
Task 8 review: docs/reviews/phase-08-task-08-final-regression-closure.md
```

Add a concise Task 8 verification/handoff section containing actual:

```text
Task 7 source review verdict
management pre-fix repeat result
management post-fix 50-repeat result
focused Phase 8 counts
npm run verify counts/result
full no-retry E2E totals
canonical E2E totals/retries
architecture/public-tree/diff results
protected-path audit
```

Keep the two GAS items as `OPEN_EXTERNAL_DEBT`.

Do not write:

```text
Phase 8 CLOSED
Task 8 browser accepted
browser acceptance complete
```

- [ ] **Step 3: Run documentation/hygiene checks after the review/status edits**

```bash
git diff --check

git grep -n 'CLOSURE_CANDIDATE_BROWSER_REVIEW_PENDING' -- \
  docs/reviews/phase-08-task-08-final-regression-closure.md

! git grep -n 'Phase 8 CLOSED\|Task 8 browser accepted\|browser acceptance complete' -- \
  docs/reviews/phase-08-task-08-final-regression-closure.md \
  docs/status/progress.md
```

Expected: all succeed.

- [ ] **Step 4: Commit the review/status handoff**

```bash
git add \
  docs/reviews/phase-08-task-08-final-regression-closure.md \
  docs/status/progress.md

git commit -m "docs(phase-08): record final closure candidate"
```

---

## Task 8.5: Final adversarial scope audit and push

**Goal:** Ensure the pushed Task 8 branch contains only the test stabilization and evidence necessary for browser closure review.

**Do not:** Make new corrections after the final audit without rerunning affected gates, merge main, start another Phase, or push unrelated user-owned files.

**Files:**
- Read-only audit of the whole Task 8 implementation diff.

**Interfaces:**
- Consumes: final Task 8 commits.
- Produces: pushed branch ready for browser review.

- [ ] **Step 1: Inspect the exact Task 8 implementation diff from `TASK_START_SHA`**

```bash
git diff --name-status "$TASK_START_SHA"..HEAD
git log --oneline "$TASK_START_SHA"..HEAD
git status --short
```

Expected implementation file set:

```text
M tests/e2e/management.spec.ts
A docs/reviews/phase-08-task-08-final-regression-closure.md
M docs/status/progress.md
```

No other implementation file is expected.

- [ ] **Step 2: Run the protected-path gate**

```bash
git diff --name-only "$TASK_START_SHA"..HEAD -- \
  apps/webapp/js \
  apps/webapp/events \
  apps/webapp/map-bundles \
  functions \
  integrations \
  vite.config.ts \
  package.json \
  package-lock.json \
  .github/workflows \
  playwright.config.ts
```

Expected: no output.

- [ ] **Step 3: Answer the final 24 adversarial questions from the actual tree**

```text
1. Did Task 8 add a real event? Must be no.
2. Did Task 8 modify apps/webapp/js? Must be no.
3. Did Task 8 modify production registry/map bundles? Must be no.
4. Did Task 8 modify wrapper? Must be no.
5. Did Task 8 modify package/workflow/Vite/Playwright config? Must be no.
6. Did Task 7 source review find any unresolved material defect? Must be no.
7. Does Task 7 still accept an actual second temporary source/output bundle? Must be yes.
8. Does Task 7 still reject duplicate registry IDs? Must be yes.
9. Do C108 17-file checks remain? Must be yes.
10. Do C108 explicit built-asset checks remain? Must be yes.
11. Does production still exclude demo-v1? Must be yes.
12. Does the management E2E capture scroll at click time? Must be yes.
13. Does the management E2E still require exact restore equality? Must be yes.
14. Was no sleep/hard-coded 166/tolerance added? Must be yes.
15. Did the corrected focused test pass 50/50 with retries disabled? Must be yes.
16. Did the full E2E suite pass with retries disabled? Must be yes.
17. Did canonical npm run test:e2e:ci pass with zero unresolved flaky? Must be yes for closure candidate.
18. Did npm run verify pass? Must be yes.
19. Did architecture/public-tree/diff gates pass? Must be yes.
20. Does the source audit still prove data-only C999 runtime route assets? Must be yes.
21. Are Task 5 refactor and Task 6 onboarding regressions still covered? Must be yes.
22. Is the Task 7 operator guide still linked/data-only? Must be yes.
23. Are GAS items still separated as OPEN_EXTERNAL_DEBT? Must be yes.
24. Is Phase 8 still browser-review-pending rather than self-closed? Must be yes.
```

If any answer is not the required value, do not push a closure candidate. Correct only if it is within this Task's allowed scope and rerun every affected gate; otherwise stop with the exact blocker.

- [ ] **Step 4: Run final hygiene**

```bash
git diff --check
git status --short
```

Expected: clean working tree after committed changes, except unrelated pre-existing user-owned files that must remain untouched.

- [ ] **Step 5: Push the same Task 8 branch and stop**

```bash
git push origin docs/phase-08-task-08-final-regression-closure-plan
```

Do not merge main. Do not create Task 9. Do not begin another Phase. Stop for browser-side adversarial review.

---

## Final report required from the implementing agent

The final Codex report must include all of the following.

### Identity

```text
TASK_START_SHA
final pushed HEAD
commit list
complete changed-file list from TASK_START_SHA
```

### Task 7 browser-style audit

```text
Task 7 implementation commit ancestry
Task 7 changed-file scope
protected-path result
multi-event source/output fixture evidence
result.eventIds expectation
verifiedFiles expectation
duplicate registry guard evidence
C108 17-file evidence
C108 explicit built-asset evidence
demo-v1 exclusion evidence
operator-guide workflow evidence
Task 7 audit verdict
```

### Management flake

```text
historical Task 7 flaky: Expected 160 / Received 166, retry passed
pre-fix 20-repeat no-retry totals/result
exact test-only code correction
post-fix focused single result
post-fix 50-repeat no-retry totals/result
whole management spec no-retry totals/result
confirmation: no sleep, no hard-coded 166, no tolerance, no retry increase
```

### Phase 8 focused evidence

```text
focused Vitest files/tests/result
first-launch + management E2E no-retry totals
runtime loader no-C108 grep
strict map metadata evidence
C999 data-only runtime route asset evidence
Task 5 assembly evidence
Task 6 first-use evidence
Task 7 operator guide evidence
```

### Full closure gates

```text
npm run verify exact counts/result
full CI-container E2E --retries=0 exact totals/result
npm run test:e2e:ci exact total/pass/fail/skip/retry
npm run check:webapp:architecture result
node scripts/audit-public-tree.mjs result
git diff --check result
protected-path audit result
```

### Closure docs/status

```text
review file path
review verdict = CLOSURE_CANDIDATE_BROWSER_REVIEW_PENDING
progress current Task
progress next step
OPEN_EXTERNAL_DEBT preserved
```

Finally state explicitly:

```text
no real C109 event added
no apps/webapp/js change
no production registry/map-bundle change
no wrapper change
no package/Vite/workflow/Playwright-config change
Task 7 had no additional material defect beyond the management E2E flake
Phase 8 is NOT self-declared closed; browser review is pending
```

Codex self-review is not browser acceptance. After pushing, stop.