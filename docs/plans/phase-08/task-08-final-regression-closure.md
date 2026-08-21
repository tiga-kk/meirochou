# Phase 8 Task 8: Final Regression / Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the known retry-dependent management-scroll E2E flake, independently re-audit Task 7 and Phase 8 invariants, and produce a fully verified Phase 8 closure candidate without changing production runtime/data behavior.

**Architecture:** Task 8 is a verification/closure task, not a feature task. Keep production runtime/event data frozen; replace the test's frame-count-based scroll baseline with click-time event capture, stress the corrected regression with retries disabled, then run the complete Phase 8/repository gates and write one closure-candidate review record for browser acceptance.

**Tech Stack:** Playwright 1.61.1, Node.js 22.14.0, npm 10.9.2, Vitest 4, existing CI-equivalent Playwright Docker runner, Markdown review/status documentation.

**Spec:** `docs/specs/2026-08-21-phase-08-task-08-final-regression-closure-design.md`

## Global Constraints

- Repository: `tiga-kk/meirochou`.
- Work only on `docs/phase-08-task-08-final-regression-closure-plan`.
- The branch is based on the current Phase 8 Task 7 implementation branch. Start from the current remote Task 8 branch HEAD; do not reset to a SHA copied from this document.
- Task 8 is a Phase 8 final regression / closure **candidate**, not a new feature.
- Do not add C109, C110, or any real second production event.
- Do not modify `apps/webapp/js/**`, `apps/webapp/events/**`, `apps/webapp/map-bundles/**`, `functions/**`, `integrations/**`, `vite.config.ts`, `package.json`, `package-lock.json`, `.github/workflows/**`, or `playwright.config.ts`.
- Do not modify `tiga-kk/meirochou_wrapper`.
- Do not change Task 6 onboarding behavior/copy or refactor Task 5 application assembly further.
- Do not weaken Task 7 multi-event verification, C108 regressions, byte-equality checks, or operator-guide safeguards.
- Do not add sleeps to hide the management-scroll flake.
- Do not hard-code `166` or another observed browser-specific scroll value.
- Do not raise Playwright retries, update snapshots, skip tests, loosen assertions, or widen timeouts merely to obtain green.
- The strict final browser signal is a full CI-container E2E run with `--retries=0`.
- `npm run test:e2e:ci` is also required because it is the canonical documented operator/CI command.
- The two existing GAS items remain `OPEN_EXTERNAL_DEBT`; Task 8 does not absorb them.
- Codex must not write `Phase 8 CLOSED`, `browser accepted`, or equivalent. Browser-side review remains final authority.

## Expected implementation scope

Expected test change:

```text
M tests/e2e/management.spec.ts
```

Expected evidence/docs:

```text
A docs/reviews/phase-08-task-08-final-regression-closure.md
M docs/status/progress.md
```

The Task 8 design and plan already on the branch are planning inputs, not implementation changes. If a production file becomes necessary, stop and classify the reason instead of expanding scope.

---

## Task 8.0: Capture the inherited baseline and adversarially review Task 7

**Goal:** Record the exact Task 8 implementation start, prove the branch inherits Task 7, and independently verify that Task 7 has no unresolved material defect other than the known management-scroll E2E flake.

**Do not:** Edit files, merge main, repair unrelated failures, add an event, or treat the Task 7 self-report as browser acceptance.

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
- Consumes: current Task 7 implementation tree and recorded verification evidence.
- Produces: `TASK_START_SHA`, baseline measurements, Task 7 source/diff review verdict.

- [ ] **Step 1: Sync the exact remote Task 8 branch and record `TASK_START_SHA`**

```bash
git fetch origin --prune
git checkout docs/phase-08-task-08-final-regression-closure-plan
git pull --ff-only
export TASK_START_SHA="$(git rev-parse HEAD)"
printf 'TASK_START_SHA=%s\n' "$TASK_START_SHA"
git status --short
```

Expected: current branch and clean working tree except unrelated user-owned files. Never reset/delete unrelated files.

- [ ] **Step 2: Prove the three Task 7 implementation/handoff commits are inherited**

```bash
git log --oneline --decorate -15

git log --oneline --all --grep='fix(build): allow multiple production events' -1
git log --oneline --all --grep='docs(phase-08): add event addition operator guide' -1
git log --oneline --all --grep='docs(phase-08): record task 7 verification' -1
```

For each returned SHA, run:

```bash
git merge-base --is-ancestor THE_RETURNED_SHA "$TASK_START_SHA"
```

Replace `THE_RETURNED_SHA` with the SHA printed by the immediately preceding command. All three checks must exit 0. Otherwise stop as `BLOCKED_WRONG_BASE`; do not recreate Task 7 manually.

- [ ] **Step 3: Audit the inherited Task 7 changed-file scope**

Find the Task 7 planning commit and final handoff commit from history:

```bash
git log --oneline --all --grep='docs(phase-08): plan event addition operator workflow' -1
git log --oneline --all --grep='docs(phase-08): record task 7 verification' -1
```

Use the first command's SHA as `TASK7_PLAN_SHA` and the second command's SHA as `TASK7_FINAL_SHA`:

```bash
export TASK7_PLAN_SHA="$(git log --all --format=%H --grep='docs(phase-08): plan event addition operator workflow' -1)"
export TASK7_FINAL_SHA="$(git log --all --format=%H --grep='docs(phase-08): record task 7 verification' -1)"
git diff --name-status "$TASK7_PLAN_SHA".."$TASK7_FINAL_SHA"
```

Expected Task 7 implementation file set:

```text
M README.md
M docs/status/progress.md
A guides/event-addition.md
M scripts/verify-webapp-build.mjs
M tests/deployment-build.test.mjs
M tests/event-registry.test.ts
M tests/webapp-contracts.test.mjs
```

Protected-path check:

```bash
git diff --name-only "$TASK7_PLAN_SHA".."$TASK7_FINAL_SHA" -- \
  apps/webapp/js \
  apps/webapp/events \
  apps/webapp/map-bundles \
  vite.config.ts \
  package.json \
  package-lock.json \
  integrations \
  functions \
  .github/workflows \
  playwright.config.ts
```

Expected: no output. Any protected-path change is `BLOCKED_TASK7_REVIEW`.

- [ ] **Step 4: Re-audit Task 7 verifier policy from source**

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

Expected: historical one-event-only text is absent; duplicate protection, C108 regressions, and demo exclusion remain.

- [ ] **Step 5: Prove Task 7's second registered fixture is a real source/output bundle**

Inspect `addRegisteredBundle()` in `tests/deployment-build.test.mjs`. It must create both:

```text
TEMP_ROOT/apps/webapp/map-bundles/other-v1/**
TEMP_ROOT/dist/webapp/assets/maps/other-v1/**
```

It must rewrite the copied manifest to `eventId: "other-v1"`, and the registry entry must use:

```json
{
  "eventId": "other-v1",
  "mapBundle": "../maps/other-v1/manifest.json",
  "mapBundleContract": "event"
}
```

The positive test must expect:

```text
result.eventIds == ["C108", "other-v1", "public-v1"]
result.verifiedFiles == 39
```

If the test only mutates an event ID without actual source/output bundle files, stop as `BLOCKED_TASK7_REVIEW`.

- [ ] **Step 6: Re-audit the operator guide contract**

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

Read the matching sections and verify all five semantics:

```text
event-registry-entry.json is merged, not copied into public tree
new-event safe copy refuses an existing target directory
unregistered map-bundle directories may still be published
generated assets are regenerate-not-patch
apps/webapp/js changes stop the normal data-only event-addition workflow
```

- [ ] **Step 7: Confirm current production data still has no C109**

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

Both commands must succeed.

- [ ] **Step 8: Run the inherited focused Task 7 suite**

```bash
npx vitest run --root . \
  tests/deployment-build.test.mjs \
  tests/event-registry.test.ts \
  tests/webapp-contracts.test.mjs \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts
```

Record exact file/test counts and exit code.

- [ ] **Step 9: Classify the Task 7 review**

Expected classification after the source/diff audit:

```text
Task 7 source/diff review: ACCEPTABLE
Known carryover: management scroll E2E retry/flaky only
```

If another material Task 7 issue appears, Task 8 may correct it only when it is directly caused/exposed by Task 7, small, confined to Task 7-owned verifier/test/docs files, and requires no runtime/event-data change. Otherwise stop as `BLOCKED_TASK7_REVIEW`.

No commit for Task 8.0.

---

## Task 8.1: Stabilize management scroll restoration E2E

**Goal:** Measure the scroll position at the actual settings-toggle click event, which is the lock-time product contract, instead of assuming two animation frames are enough to preserve a synthetic scroll target.

**Do not:** Change `ComipathSettings`, `bind-settings-shell-events.ts`, CSS, app runtime, retries, timeouts, snapshots, or exact restore equality.

**Files:**
- Modify: `tests/e2e/management.spec.ts`

**Interfaces:**
- Consumes: existing normal bubbling click listener on `#toggle-settings` and existing management scroll-lock behavior.
- Produces: the same E2E user-flow contract with `before` defined as click-capture-time `window.scrollY`.

The production binder currently uses a bubbling listener:

```ts
listen(settingsToggle, "click", () => {
  application.toggleSettings(settingsToggle);
});
```

A one-shot `{ capture: true }` E2E listener on the same element therefore records the actual scroll position before the production bubble listener locks the page.

- [ ] **Step 1: Characterize the inherited test 20 times with retries disabled**

```bash
scripts/run-e2e-in-ci-container.sh \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium \
  --grep '背景scrollを固定' \
  --repeat-each=20 \
  --retries=0
```

Record total/passed/failed/exit code and any Expected/Received values. Task 7 already recorded a real `Expected 160 / Received 166` retry-dependent occurrence, so 20/20 passing here does not invalidate the defect. Do not manipulate browser timing to force a failure.

- [ ] **Step 2: Replace the double-animation-frame baseline with click-time capture**

In `管理surfaceが背景scrollを固定し、viewport全体を遮蔽する`, replace:

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

with exactly:

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

Keep the existing exact close assertion unchanged:

```ts
await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
```

Do not replace equality with a tolerance.

- [ ] **Step 3: Run the corrected focused test once with retries disabled**

```bash
scripts/run-e2e-in-ci-container.sh \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium \
  --grep '背景scrollを固定' \
  --retries=0
```

Required: 1 passed, 0 failed, exit 0.

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

Any failure blocks Task 8. Do not add sleep/retry/tolerance; inspect the exact error/trace and classify the race.

- [ ] **Step 5: Run the whole management spec with retries disabled**

```bash
scripts/run-e2e-in-ci-container.sh \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium \
  --retries=0
```

Record exact total/pass/fail/skip counts.

- [ ] **Step 6: Verify the intended diff and commit**

```bash
git diff --name-status "$TASK_START_SHA"
git diff -- tests/e2e/management.spec.ts
git diff --check
```

At this point the implementation diff must contain only:

```text
M tests/e2e/management.spec.ts
```

Commit:

```bash
git add tests/e2e/management.spec.ts
git commit -m "test(e2e): stabilize management scroll restore"
```

---

## Task 8.2: Re-run focused Phase 8 outcomes and audit invariants

**Goal:** Prove the major Phase 8 outcomes still exist together after Task 8.1, independently of a generic full-suite green signal.

**Do not:** Modify code to satisfy the audit, add a real event, edit wrapper code, or substitute stale progress prose for current source/test evidence.

**Files:**
- Read-only audit of current production/tests/docs.

**Interfaces:**
- Consumes: Task 1〜7 implementation and Task 8.1 test correction.
- Produces: exact invariant evidence for the final review document.

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

- [ ] **Step 2: Run onboarding + management browser coverage with retries disabled**

```bash
scripts/run-e2e-in-ci-container.sh \
  tests/e2e/first-launch-onboarding.spec.ts \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium \
  --retries=0
```

Record exact total/pass/fail/skip counts.

- [ ] **Step 3: Prove runtime map loading remains event-generic**

```bash
! git grep -n 'C108' -- \
  apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts

git grep -n 'mapBundleContract' -- \
  apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts \
  apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts
```

The loader must contain no C108-specific branch/string; strict/legacy selection must remain data-driven.

Read `tests/phase-08-data-only-event-addition.test.ts` and record evidence that C999 travels through:

```text
parseEventRegistry
-> resolveEventMapManifestUrl
-> loadRuntimeMapBundleManifestFromUrl
-> runtimeMapAreaCatalog
-> HttpRouteMapAssetsLoader
-> points/grid-meta/grid bytes
```

Also record that fixture `areaId` and raw pathdata `map_id` intentionally differ.

- [ ] **Step 4: Prove strict manifest metadata remains data-owned**

Read the strict manifest parser/type tests and record current evidence for:

```text
one-or-more areas
areaId
metersPerPixel
prefixes
labels
assets.svg
assets.points
assets.gridMeta
assets.grid
```

No parser/schema change is authorized.

- [ ] **Step 5: Prove Task 7 verification remains multi-event while C108 regressions remain**

```bash
git grep -n 'accepts multiple registered events' -- tests/deployment-build.test.mjs
git grep -n 'duplicate registered event IDs' -- tests/deployment-build.test.mjs
git grep -n 'C108 public bundle must contain exactly 17 files' -- scripts/verify-webapp-build.mjs
git grep -n 'built C108 asset missing' -- scripts/verify-webapp-build.mjs
```

All four must match.

- [ ] **Step 6: Prove Task 5 targeted application split remains present**

```bash
test -f apps/webapp/js/app/bind-management-action-events.ts
test -f apps/webapp/js/app/browser-management-projection.ts

git grep -n 'bindManagementActionEvents' -- \
  apps/webapp/js/app \
  tests/application-assembly.test.ts
```

Read `tests/application-assembly.test.ts` and record the management/route-guidance assembly checks. Do not refactor these modules.

- [ ] **Step 7: Prove Task 6 first-use UX remains present**

```bash
git grep -n 'meirochou.first-use-guide-seen' -- \
  apps/webapp/js/data/local-state-adapters.ts \
  tests/first-use-guide-state.test.ts

git grep -n 'readFirstUseGuideSeen\|markFirstUseGuideSeen' -- \
  apps/webapp/js/app/browser-application.ts

test -f tests/e2e/first-launch-onboarding.spec.ts
```

Read the focused tests and record normal one-time launch behavior and `demo_ui` non-persistence behavior. Do not change onboarding.

- [ ] **Step 8: Prove Task 7 operator workflow remains linked and data-only**

```bash
git grep -n 'guides/event-addition.md' -- README.md
git grep -n 'build-event' -- guides/event-addition.md
git grep -n 'git diff --name-only -- apps/webapp/js' -- guides/event-addition.md
git grep -n 'npm run test:e2e:ci' -- guides/event-addition.md
```

Record evidence for wrapper generation ownership, registry-entry merge, unregistered-bundle warning, regenerate-not-patch, manual smoke, and Cloudflare rollback authority.

- [ ] **Step 9: Reconfirm protected production paths are untouched by Task 8**

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

**Goal:** Produce fresh whole-repository evidence, including a full browser run that cannot hide a failure behind retries.

**Do not:** Rerun repeatedly until lucky green, absorb unrelated fixes, update snapshots, or continue after an unclassified regression.

**Files:**
- No source modification expected.

**Interfaces:**
- Consumes: Task 8.1 correction and Task 8.2 invariant evidence.
- Produces: final automated measurements for the closure review.

- [ ] **Step 1: Run fresh repository verification**

```bash
npm run verify
```

Record exit code and every printed suite count: webapp Vitest, Route Guidance, Phase 05D regressions, architecture, build verified assets, GAS, and catalog extension. Required: exit 0.

- [ ] **Step 2: Run the entire Playwright suite with retries disabled**

```bash
scripts/run-e2e-in-ci-container.sh --retries=0
```

Record total/passed/failed/skipped/exit code. Required: exit 0 and zero failed.

If a test fails, run that exact test once with `--retries=0` for diagnosis. Do not repeatedly rerun the full suite.

Use exactly one classification:

```text
TASK8_REGRESSION
  failure is caused by the management.spec.ts change

PREEXISTING_OR_INDEPENDENT
  failure reproduces from TASK_START_SHA and is unrelated to Task 8 diff

ENVIRONMENTAL
  concrete Docker/browser/system evidence exists and assertion/product evidence does not
```

Any unresolved failure blocks the closure candidate.

- [ ] **Step 3: Run the canonical documented E2E command**

```bash
npm run test:e2e:ci
```

Record total/passed/failed/skipped/retry-or-flaky count/exit code. Required for a closure candidate: exit 0 and no unresolved retry/flaky. If a retry occurs, diagnose that exact test and do not self-close Phase 8.

- [ ] **Step 4: Run architecture/public-tree/hygiene gates**

```bash
npm run check:webapp:architecture
node scripts/audit-public-tree.mjs
git diff --check
```

All must pass.

- [ ] **Step 5: Reconfirm no C109 was added**

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

Both must succeed.

- [ ] **Step 6: Inspect the pre-documentation diff**

```bash
git status --short
git diff --name-status "$TASK_START_SHA"..HEAD
git diff --check
```

Expected implementation diff at this point:

```text
M tests/e2e/management.spec.ts
```

No commit in Task 8.3.

---

## Task 8.4: Write the final closure-candidate review and progress handoff

**Goal:** Record the actual measurements/source audit in one final review artifact and set the canonical status to browser-review-pending.

**Do not:** Invent counts, copy Task 7 measurements as fresh Task 8 results, mark browser acceptance, resolve external GAS debt, or merge main.

**Files:**
- Create: `docs/reviews/phase-08-task-08-final-regression-closure.md`
- Modify: `docs/status/progress.md`

**Interfaces:**
- Consumes: measured evidence from Task 8.0〜8.3.
- Produces: closure-candidate review artifact and canonical handoff state.

- [ ] **Step 1: Create the review file from measured evidence**

Create `docs/reviews/phase-08-task-08-final-regression-closure.md` with these exact headings:

```markdown
# Phase 8 Task 8 final regression / closure candidate

## Baseline
## Task 7 adversarial review
## Management scroll flake
## Phase 8 invariant audit
## Focused verification
## Full verification
## Scope audit
## External debt
## Verdict
```

Under `## Baseline`, write the literal SHA values printed by Task 8.0 Step 1 and the Task 7 history commands, plus the actual Node/npm/Playwright versions printed by the environment.

Under `## Task 7 adversarial review`, list the exact Task 7 changed files, protected-path result, multi-event fixture evidence, C108 regression evidence, production-data result, guide evidence, and the review verdict.

Under `## Management scroll flake`, record:

```text
historical Task 7 occurrence: Expected 160 / Received 166, retry passed
Task 0 root cause: browser settling/scroll anchoring vs pre-click test baseline
pre-fix 20-repeat measured totals
exact click-capture-time test correction
post-fix 50-repeat measured totals
whole management-spec measured totals
```

Under `## Phase 8 invariant audit`, use a Markdown table with one row for each invariant from Task 8.2 Steps 3〜8. Each row must cite the exact file/test/grep evidence used and a PASS/FAIL verdict.

Under `## Focused verification`, write the exact counts printed by Task 8.2 Steps 1〜2.

Under `## Full verification`, write the exact counts/results printed by Task 8.3 Steps 1〜4, including both no-retry full E2E and canonical `npm run test:e2e:ci`.

Under `## Scope audit`, explicitly state the actual Task 8 implementation file set and that runtime, registry, map-bundle, package/workflow/Vite/Playwright-config, and wrapper diffs are absent.

Under `## External debt`, preserve the existing two GAS evidence items as `OPEN_EXTERNAL_DEBT` and state they are not Task 8 implementation scope.

Under `## Verdict`, write exactly:

```text
CLOSURE_CANDIDATE_BROWSER_REVIEW_PENDING
```

Then state that Phase 8 is not closed until browser-side review accepts the evidence.

- [ ] **Step 2: Update `docs/status/progress.md` minimally**

Preserve all Task 1〜7 history. Set the current state to the equivalent of:

```text
現在Task: Phase 8 Task 8 final regression / closure candidate — implementation complete / browser review pending
次に着手するTask: Phase 8 browser acceptance / closure decision
canonical Task 8 plan: docs/plans/phase-08/task-08-final-regression-closure.md
Task 8 design: docs/specs/2026-08-21-phase-08-task-08-final-regression-closure-design.md
Task 8 review: docs/reviews/phase-08-task-08-final-regression-closure.md
```

Add a concise Task 8 verification/handoff section containing the actual Task 7 review verdict, pre/post flake results, focused counts, full verification counts, E2E no-retry/canonical totals, architecture/public-tree/diff results, and protected-path result.

Keep the two GAS items as `OPEN_EXTERNAL_DEBT`.

Do not write `Phase 8 CLOSED`, `Task 8 browser accepted`, or `browser acceptance complete`.

- [ ] **Step 3: Verify review/status semantics**

```bash
git diff --check

git grep -n 'CLOSURE_CANDIDATE_BROWSER_REVIEW_PENDING' -- \
  docs/reviews/phase-08-task-08-final-regression-closure.md

! git grep -n 'Phase 8 CLOSED\|Task 8 browser accepted\|browser acceptance complete' -- \
  docs/reviews/phase-08-task-08-final-regression-closure.md \
  docs/status/progress.md
```

All commands must succeed.

- [ ] **Step 4: Commit the review/status handoff**

```bash
git add \
  docs/reviews/phase-08-task-08-final-regression-closure.md \
  docs/status/progress.md

git commit -m "docs(phase-08): record final closure candidate"
```

---

## Task 8.5: Final adversarial scope audit and push

**Goal:** Ensure the pushed Task 8 implementation contains only the test stabilization and evidence needed for browser closure review.

**Do not:** Merge main, start Task 9/another Phase, or push unrelated user-owned files.

**Files:**
- Read-only audit of the complete Task 8 implementation diff.

**Interfaces:**
- Consumes: final Task 8 commits.
- Produces: pushed branch ready for browser-side review.

- [ ] **Step 1: Inspect the exact Task 8 implementation diff**

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

- [ ] **Step 3: Answer the final adversarial checklist from the actual tree**

```text
1. Real event added? no.
2. apps/webapp/js modified? no.
3. Production registry/map bundles modified? no.
4. Wrapper modified? no.
5. Package/workflow/Vite/Playwright config modified? no.
6. Unresolved Task 7 material defect? no.
7. Actual second temporary source/output bundle test retained? yes.
8. Duplicate registry guard retained? yes.
9. C108 exact 17-file check retained? yes.
10. C108 explicit built-asset checks retained? yes.
11. Production demo-v1 exclusion retained? yes.
12. Management E2E captures scroll at click time? yes.
13. Exact restore equality retained? yes.
14. Sleep/hard-coded 166/tolerance/retry increase added? no.
15. Corrected focused test passed 50/50 with retries disabled? yes.
16. Full E2E passed with retries disabled? yes.
17. Canonical E2E has no unresolved retry/flaky? yes.
18. npm run verify passed? yes.
19. Architecture/public-tree/diff gates passed? yes.
20. C999 data-only runtime route-asset proof retained? yes.
21. Task 5 refactor and Task 6 onboarding coverage retained? yes.
22. Task 7 operator guide remains linked/data-only? yes.
23. GAS items remain OPEN_EXTERNAL_DEBT? yes.
24. Phase 8 remains browser-review-pending? yes.
```

If any answer differs, do not push a closure candidate. Correct only when the issue is within Task 8's allowed scope and rerun every affected gate; otherwise stop with the blocker.

- [ ] **Step 4: Run final hygiene and push**

```bash
git diff --check
git status --short
git push origin docs/phase-08-task-08-final-regression-closure-plan
```

After push, stop. Do not merge main or start another Task/Phase.

---

## Final report required from the implementing agent

Report all of the following from actual commands, not memory.

### Identity

```text
TASK_START_SHA
final pushed HEAD
commit list
complete changed-file list from TASK_START_SHA
```

### Task 7 audit

```text
Task 7 implementation commit ancestry
Task 7 changed-file scope
Task 7 protected-path result
other-v1 source/output fixture evidence
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
historical Task 7 flaky occurrence: Expected 160 / Received 166, retry passed
pre-fix 20-repeat no-retry totals/result
exact test-only correction
post-fix focused single result
post-fix 50-repeat no-retry totals/result
whole management spec no-retry totals/result
confirmation: no sleep, no hard-coded 166, no tolerance, no retry increase
```

### Phase 8 focused evidence

```text
focused Vitest files/tests/result
first-launch + management E2E no-retry totals
runtime-loader no-C108 result
strict map metadata evidence
C999 data-only runtime route-asset evidence
Task 5 assembly evidence
Task 6 first-use evidence
Task 7 operator-guide evidence
```

### Full closure gates

```text
npm run verify exact counts/result
full CI-container E2E --retries=0 exact totals/result
npm run test:e2e:ci exact totals and retry/flaky count
npm run check:webapp:architecture result
node scripts/audit-public-tree.mjs result
git diff --check result
protected-path audit result
```

### Closure handoff

```text
review file path
review verdict: CLOSURE_CANDIDATE_BROWSER_REVIEW_PENDING
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