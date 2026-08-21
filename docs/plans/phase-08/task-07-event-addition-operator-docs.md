# Phase 8 Task 7: Event Addition / Operator Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the last C108-only verification assumptions that block a second production event, then document one reproducible wrapper-to-production event-addition workflow without adding a new installer or changing application runtime code.

**Architecture:** Keep the Phase 8 data-only event architecture intact. First make the existing build verifier/tests accept multiple registered strict events while retaining C108-specific regressions; then add one canonical `guides/event-addition.md` that connects the already-existing wrapper `build-event` staging output to the meirochou registry/map-bundle tree, verification gates, manual smoke, Cloudflare deployment, and rollback.

**Tech Stack:** Node.js 22.14, TypeScript 7, Vitest 4, existing Vite build pipeline, Playwright container gate, Markdown operator documentation, existing wrapper `comiket_pathdata build-event` CLI.

**Spec:** `docs/specs/2026-08-21-phase-08-task-07-event-addition-operator-docs-design.md`

## Global Constraints

- Repository: `tiga-kk/meirochou`.
- Work only on `docs/phase-08-task-07-event-addition-operator-docs-plan`.
- This branch is based on the current Phase 8 Task 6 implementation branch. Start from the current remote Task 7 branch HEAD; do not reset to a SHA copied from this document.
- Task 7 does not add C109, C110, or any real second production event.
- Do not modify `apps/webapp/events/manifest.json` or `apps/webapp/map-bundles/**` in Task 7.
- Do not modify `apps/webapp/js/**` in Task 7.
- Do not modify Vite, package files, workflows, integrations, functions, route algorithms, storage schemas, event/map runtime contracts, or Task 6 onboarding behavior.
- Do not remove C108-specific regression checks that remain valid: C108 day1/day2, exact C108 public bundle structure, explicit C108 built asset checks, legacy root-area exclusion, and production demo exclusion.
- Remove only the historical assumption that production registry must contain exactly one event named C108.
- Do not add an event installer/deployer CLI, registry mutation script, backend registry, schemaVersion bump, new dependency, or wrapper code.
- The wrapper-side event-build implementation remains in `tiga-kk/meirochou_wrapper`; Task 7 only documents its current public command/output contract.
- Do not copy fake/synthetic event fixtures into production `apps/webapp/map-bundles`.
- Do not use `--project=chromium` as a generic webapp E2E command. Current Playwright project selection is spec-specific; use `npm run test:e2e:ci` for the full canonical gate.
- Full `npm run test:e2e:ci` is required in Task 7.4 because this is the final Phase 8 handoff baseline.
- Never update visual snapshots, increase retries, skip tests, or weaken unrelated assertions to make Task 7 green.
- Do not merge `main` or close Phase 8 before browser review.

## Expected implementation scope

Tooling:

```text
M scripts/verify-webapp-build.mjs
```

Tests:

```text
M tests/deployment-build.test.mjs
M tests/event-registry.test.ts
M tests/webapp-contracts.test.mjs
```

Operator docs:

```text
A guides/event-addition.md
M README.md
M docs/status/progress.md
```

No other production file should be necessary.

---

## Task 7.0: Capture Task 6-based baseline and confirm the residual blockers

**Goal:** Establish the exact implementation start SHA, confirm Task 6 is inherited intact, and reproduce the two C108-only verification assumptions before editing them.

**Do not:** Edit code/docs in this task, reimplement Task 6, add a real event, merge main, or update snapshots.

**Files:**
- Read: `docs/specs/2026-08-21-phase-08-task-07-event-addition-operator-docs-design.md`
- Read: `docs/plans/phase-08/task-07-event-addition-operator-docs.md`
- Read: `docs/status/progress.md`
- Read: `scripts/verify-webapp-build.mjs`
- Read: `tests/deployment-build.test.mjs`
- Read: `tests/event-registry.test.ts`
- Read: `tests/phase-08-data-only-event-addition.test.ts`
- Read: `tests/map-bundle-selection.test.ts`
- Read: `playwright.config.ts`
- Read: `guides/cloudflare-pages-deployment.md`
- Read: `README.md`
- External read-only reference: current `tiga-kk/meirochou_wrapper/python/pathdata/README.md`

**Interfaces:**
- Consumes: Task 6 implementation branch state; existing `verifyWebappBuild({ repositoryRoot })`; existing production registry parser; wrapper `build-event` staging contract.
- Produces: no code; exact baseline evidence used to classify later regressions.

- [ ] **Step 1: Sync the exact remote Task 7 branch and record the start SHA**

```bash
git fetch origin --prune
git checkout docs/phase-08-task-07-event-addition-operator-docs-plan
git pull --ff-only
export TASK_START_SHA="$(git rev-parse HEAD)"
printf 'TASK_START_SHA=%s\n' "$TASK_START_SHA"
git status --short
```

Expected: clean working tree except unrelated user-owned files. Never reset/delete unrelated files.

- [ ] **Step 2: Prove Task 6 implementation is inherited rather than rebuilt**

```bash
git grep -n 'meirochou.first-use-guide-seen' -- \
  apps/webapp/js/data/local-state-adapters.ts \
  tests/first-use-guide-state.test.ts

git grep -n 'readFirstUseGuideSeen\|markFirstUseGuideSeen' -- \
  apps/webapp/js/app/browser-application.ts

test -f tests/e2e/first-launch-onboarding.spec.ts
```

Expected: all succeed. If absent, stop as `BLOCKED_WRONG_BASE`; do not recreate Task 6 in Task 7.

- [ ] **Step 3: Confirm the known Task 6 Playwright-plan mismatch without changing Task 6**

```bash
git grep -n 'name: "chromium"\|name: "mobile-chromium"' -- playwright.config.ts
```

Read the matching `testMatch` / `testIgnore` blocks.

Expected: `chromium` is limited to specific desktop specs while `mobile-chromium` is the broad project. This is a historical Task 6 planning-command issue, not a Task 6 production defect. Task 7 documentation must use `npm run test:e2e:ci` as the canonical full E2E command.

- [ ] **Step 4: Run focused current baseline**

```bash
npx vitest run --root . \
  tests/deployment-build.test.mjs \
  tests/event-registry.test.ts \
  tests/webapp-contracts.test.mjs \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts
```

Record exact file/test counts and exit code.

- [ ] **Step 5: Confirm both historical C108-only assumptions exist**

```bash
git grep -n 'Phase 5B event registry must contain only C108' -- \
  scripts/verify-webapp-build.mjs \
  tests/deployment-build.test.mjs

git grep -n 'production registry contains only C108' -- \
  tests/event-registry.test.ts
```

Expected before Task 7.1: both searches return matches.

- [ ] **Step 6: Confirm current production data remains C108-only before this Task**

```bash
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const registry = JSON.parse(fs.readFileSync('apps/webapp/events/manifest.json', 'utf8'));
console.log(registry.events.map((event) => event.eventId));
NODE

test ! -e apps/webapp/map-bundles/C109
```

Expected: current production registry prints only the currently deployed event(s); at Task 7 design time this is `C108`. The second command must succeed. Task 7 must not add C109.

- [ ] **Step 7: Run architecture/hygiene baseline**

```bash
npm run check:webapp:architecture
git diff --check
```

Expected: PASS.

No commit for Task 7.0.

---

## Task 7.1: Make the build/registry verification event-generic

**Goal:** Remove the one-event C108 restriction from verification while retaining the existing security, artifact-integrity, C108 regression, and production-demo exclusion checks.

**Do not:** Change runtime parsers, Vite selection behavior, production registry data, map assets, C108-specific file checks, or weaken missing/escaping/symlink/credential tests.

**Files:**
- Modify: `tests/deployment-build.test.mjs`
- Modify: `scripts/verify-webapp-build.mjs`
- Modify: `tests/event-registry.test.ts`

**Interfaces:**
- Consumes: `verifyWebappBuild({ repositoryRoot }): { eventIds: readonly string[]; verifiedFiles: number }`.
- Produces: the same function signature and result shape, now accepting multiple registered events.

### Exact generic behavior

`verifyWebappBuild` must continue to verify:

```text
built registry bytes/JSON == source registry
schemaVersion == 1
events is an array
each registered event has non-empty string eventId
each registered eventId is unique
each mapBundle is a non-empty string under ../maps/
referenced source manifest exists
referenced built manifest exists
source manifest eventId == registry eventId
all source public bundle dirs have manifest.json
dir name == bundle manifest eventId
public bundle event IDs are unique
all referenced source/built assets exist
built bundle file list == source bundle file list
all copied files are byte-identical
C108 exact 17-file regression remains if C108 exists
C108 explicit four-area built checks remain if C108 exists
no legacy root e456/e7/s12/w12 directories
no symlinks/private paths/credentials/root-relative assets
```

Only this policy disappears:

```text
registry event IDs must equal exactly ["C108"]
```

### TDD fixture helper

- [ ] **Step 1: Add a helper that publishes a real second fixture bundle**

In `tests/deployment-build.test.mjs`, add a helper after the existing rewrite helpers:

```js
function addRegisteredBundle(eventId = "other-v1") {
  const sourceC108 = join(
    fixtureRoot,
    "apps/webapp/map-bundles/C108",
  );
  const outputC108 = join(
    fixtureRoot,
    "dist/webapp/assets/maps/C108",
  );
  const sourceOther = join(
    fixtureRoot,
    `apps/webapp/map-bundles/${eventId}`,
  );
  const outputOther = join(
    fixtureRoot,
    `dist/webapp/assets/maps/${eventId}`,
  );

  cpSync(sourceC108, sourceOther, { recursive: true });
  cpSync(outputC108, outputOther, { recursive: true });

  const otherManifest = {
    ...mapManifest,
    eventId,
    displayName: "Other fixture",
  };
  writeJson(join(sourceOther, "manifest.json"), otherManifest);
  writeJson(join(outputOther, "manifest.json"), otherManifest);

  rewriteRegistries({
    ...registry,
    events: [
      ...registry.events,
      {
        eventId,
        displayName: "Other fixture",
        mapBundle: `../maps/${eventId}/manifest.json`,
        mapBundleContract: "event",
        days: [{ dayId: "day1", displayName: "Other Day 1" }],
      },
    ],
  });
}
```

Do not put this fixture under real `apps/webapp/map-bundles` in the repository. It exists only inside the temp deployment-build fixture.

- [ ] **Step 2: Replace the historical negative second-event test with a positive acceptance test**

Replace:

```text
rejects a second published event
```

with:

```js
test("accepts multiple registered events and unregistered public static artifacts", () => {
  addRegisteredBundle();

  const result = verifyWebappBuild({ repositoryRoot: fixtureRoot });

  assert.deepEqual(result.eventIds, ["C108", "other-v1", "public-v1"]);
  assert.equal(result.verifiedFiles, 39);
});
```

Keep the existing first test that proves C108 plus the intentionally unregistered `public-v1` static bundle is accepted; it continues to document that public bundle publication and registry registration are separate concepts.

- [ ] **Step 3: Run only the new multi-event test and prove RED**

```bash
npx vitest run --root . \
  tests/deployment-build.test.mjs \
  -t "accepts multiple registered events"
```

Expected RED before verifier edit:

```text
Phase 5B event registry must contain only C108
```

Record the exact failure. If it fails for missing fixture files instead, fix the test fixture only; do not edit production verifier until the test reaches the intended historical assertion.

- [ ] **Step 4: Add a generic duplicate-registry regression**

Add:

```js
test("rejects duplicate registered event IDs", () => {
  rewriteRegistries({
    ...registry,
    events: [...registry.events, structuredClone(registry.events[0])],
  });

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /duplicate eventId in event registry/,
  );
});
```

This assertion may initially fail with the old C108-only message; that is expected until Step 5.

- [ ] **Step 5: Remove only the C108-only registry assertion in `verify-webapp-build.mjs`**

Delete:

```js
const registryEventIds = sourceRegistry.events.map((event) => event?.eventId);
assert.deepEqual(
  registryEventIds,
  ["C108"],
  "Phase 5B event registry must contain only C108",
);
```

Before the existing `for (const event of sourceRegistry.events)` loop, add:

```js
const registeredEventIds = new Set();
```

Inside the loop, immediately after current non-empty string `eventId` validation, add:

```js
assert.equal(
  registeredEventIds.has(eventId),
  false,
  `duplicate eventId in event registry: ${eventId}`,
);
registeredEventIds.add(eventId);
```

Do not duplicate the complete `parseEventRegistry()` implementation inside this Node verifier.

Do not remove or change the later source-manifest `eventId` equality assertion.

- [ ] **Step 6: Update the production registry test without weakening C108 regression**

In `tests/event-registry.test.ts`, replace:

```ts
test("production registry contains only C108 with day1 and day2", () => {
  const registry = parseEventRegistry(productionRegistryJson);
  expect(registry.events.map((event) => event.eventId)).toEqual(["C108"]);
  expect(registry.events[0]?.days.map((day) => day.dayId)).toEqual([
    "day1",
    "day2",
  ]);
});
```

with:

```ts
test("production registry preserves C108 without forbidding additional strict events", () => {
  const registry = parseEventRegistry(productionRegistryJson);
  expect(registry.events.length).toBeGreaterThan(0);

  const c108 = registry.events.find((event) => event.eventId === "C108");
  expect(c108).toBeDefined();
  expect(c108?.days.map((day) => day.dayId)).toEqual(["day1", "day2"]);

  expect(
    registry.events.every((event) => event.mapBundleContract !== "legacy"),
  ).toBe(true);
});
```

Keep the separate `production registry excludes demo-v1` test unchanged.

Do not alter strict C108 runtime-loader regression tests.

- [ ] **Step 7: Run the deployment and registry tests GREEN**

```bash
npx vitest run --root . \
  tests/deployment-build.test.mjs \
  tests/event-registry.test.ts
```

Expected: all tests pass. Record exact file/test count.

- [ ] **Step 8: Prove historical one-event text is gone but C108-specific regressions remain**

```bash
! git grep -n 'Phase 5B event registry must contain only C108' -- \
  scripts/verify-webapp-build.mjs \
  tests/deployment-build.test.mjs

! git grep -n 'production registry contains only C108' -- \
  tests/event-registry.test.ts

git grep -n 'C108 public bundle must contain exactly 17 files' -- \
  scripts/verify-webapp-build.mjs

git grep -n 'built C108 asset missing' -- \
  scripts/verify-webapp-build.mjs
```

Expected: first two negated grep commands succeed with no output; last two return the preserved C108 regression checks.

- [ ] **Step 9: Run adjacent Phase 8 event tests**

```bash
npx vitest run --root . \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts \
  tests/deployment-build.test.mjs \
  tests/event-registry.test.ts

npm run check:webapp
git diff --check
```

Expected: PASS.

- [ ] **Step 10: Commit Task 7.1**

```bash
git add \
  scripts/verify-webapp-build.mjs \
  tests/deployment-build.test.mjs \
  tests/event-registry.test.ts

git commit -m "fix(build): allow multiple production events"
```

---

## Task 7.2: Add the canonical event-addition operator guide

**Goal:** Give a future operator one reviewed procedure that starts from wrapper staging output and ends at verified/deployed meirochou data, with explicit stop conditions and no hidden application-code steps.

**Do not:** Add an installer script, duplicate wrapper internals, add a real event, commit secrets, tell operators to hand-patch generated assets, or imply every directory in `map-bundles` must be registry-registered.

**Files:**
- Create: `guides/event-addition.md`
- Modify: `tests/webapp-contracts.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: wrapper `build-event` staging output contract; production registry path; public map-bundle path; `npm run verify`; `npm run test:e2e:ci`; existing Cloudflare deployment guide.
- Produces: `guides/event-addition.md` as the canonical meirochou operator workflow.

### Required guide sections

The guide must contain these sections or equivalent clearly named sections:

```text
Purpose / scope
Repository responsibilities
Prerequisites
1. Build the event staging package in meirochou_wrapper
2. Review the staging package
3. Copy map-bundle into meirochou
4. Merge event-registry-entry.json into the production registry
5. Review the expected data-only diff
6. Run automated verification
7. Run local/manual smoke
8. Merge and deploy through Cloudflare Pages
Rollback / recovery
Common failures
Do not do these things
```

- [ ] **Step 1: Write the docs contract test before the guide exists**

In `tests/webapp-contracts.test.mjs`, add one test:

```js
test("event addition guide covers the data-only operator workflow", () => {
  const guide = read("guides/event-addition.md");

  for (const pattern of [
    /meirochou_wrapper/,
    /build-event/,
    /event-registry-entry\.json/,
    /map-bundle/,
    /apps\/webapp\/events\/manifest\.json/,
    /apps\/webapp\/map-bundles/,
    /npm run verify/,
    /npm run test:e2e:ci/,
    /Cloudflare Pages/,
    /guides\/cloudflare-pages-deployment\.md/,
  ]) {
    assert.match(guide, pattern);
  }

  assert.match(guide, /apps\/webapp\/js/);
  assert.match(guide, /変更.*不要|変更しない|no[- ]diff/i);
  assert.doesNotMatch(
    guide,
    /(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|CF_ACCOUNT_ID|CLOUDFLARE_ZONE_ID)\s*(?:=|:)/,
  );
});
```

The `apps/webapp/js` match is intentional: the guide must explicitly mention it as a path that should have no normal event-addition diff, not omit the path entirely.

- [ ] **Step 2: Run the docs contract test and prove RED**

```bash
npx vitest run --root . tests/webapp-contracts.test.mjs \
  -t "event addition guide covers"
```

Expected RED: `guides/event-addition.md` does not exist (`ENOENT` / file read failure). Record exact failure.

- [ ] **Step 3: Create the guide header and repository responsibility section**

Create `guides/event-addition.md` beginning with:

```markdown
# イベント追加・運用ガイド

この文書は、`tiga-kk/meirochou_wrapper`でreview済みevent packageを生成し、`tiga-kk/meirochou`へproduction eventとしてdata-onlyで追加し、検証・公開・rollbackするための運用手順です。

通常の新規event追加では`apps/webapp/js/**`を変更しません。application TypeScript変更が必要になった場合はこの手順を中断し、event固有分岐を追加せず別Taskとして原因を調査します。
```

Then explain exact repo roles:

```text
meirochou_wrapper:
  OCR/reviewed pathdata/map config -> build-event staging package

meirochou:
  reviewed staging map bundle + registry entry -> public webapp build/deploy
```

Reference the wrapper authority as:

```text
tiga-kk/meirochou_wrapper/python/pathdata/README.md
```

Do not copy the entire wrapper README into this guide.

- [ ] **Step 4: Document prerequisites and exact wrapper staging command**

Include:

```bash
cd /path/to/meirochou_wrapper/python/pathdata
PYTHONPATH=. .venv/bin/python -m comiket_pathdata \
  build-event /path/to/event.toml \
  --output-dir /path/to/dist/C109
```

Explain that `C109` is only a command example; Task 7 itself does not add it.

Document expected staging tree exactly:

```text
/path/to/dist/C109/
  event-registry-entry.json
  map-bundle/
    manifest.json
    <areaId>/
      map.svg
      points.json
      grid-meta.json
      grid.bin
```

State that unresolved wrapper review artifacts must be resolved upstream. Do not tell operators to bypass preflight.

- [ ] **Step 5: Document staging review invariants**

Before copying, operator checks:

```text
event-registry-entry.json.eventId == map-bundle/manifest.json.eventId
registry mapBundle == ../maps/<EVENT_ID>/manifest.json
registry mapBundleContract == event
manifest has >= 1 area
each area has non-empty prefixes/labels
asset paths are ./<areaId>/{map.svg,points.json,grid-meta.json,grid.bin}
points.json has no local image.path
no local absolute path/private review file is included
```

Do not require web `areaId` to equal pathdata internal `map_id`.

- [ ] **Step 6: Document safe copy topology for a genuinely new event**

Use exactly:

```bash
export EVENT_ID=C109
export STAGING=/absolute/path/to/dist/C109

test -f "$STAGING/event-registry-entry.json"
test -f "$STAGING/map-bundle/manifest.json"
test ! -e "apps/webapp/map-bundles/$EVENT_ID"

mkdir -p "apps/webapp/map-bundles/$EVENT_ID"
cp -R "$STAGING/map-bundle/." "apps/webapp/map-bundles/$EVENT_ID/"

test -f "apps/webapp/map-bundles/$EVENT_ID/manifest.json"
```

Explicitly state:

- `test ! -e` is a safety gate for a **new** event.
- do not blindly overwrite/delete an existing production bundle.
- updating/replacing an existing event needs deliberate review of cache/version/rollback and is outside the new-event copy shortcut.
- correct destination is `.../<EVENT_ID>/manifest.json`, not `.../<EVENT_ID>/map-bundle/manifest.json`.

- [ ] **Step 7: Document registry merge semantics**

Tell the operator to open:

```text
$STAGING/event-registry-entry.json
apps/webapp/events/manifest.json
```

Copy the generated single event object into the production `events` array.

Explicitly state:

- do not copy `event-registry-entry.json` into the public web tree.
- preserve existing event entries such as C108.
- do not convert production event to `legacy`.
- keep generated `mapBundleContract: "event"`.
- do not edit generated `mapBundle` to an absolute URL.
- JSON order is not a runtime contract, but review the intended selector order deliberately.

- [ ] **Step 8: Document the expected future event diff**

Include:

```text
M apps/webapp/events/manifest.json
A apps/webapp/map-bundles/<EVENT_ID>/manifest.json
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/map.svg
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/points.json
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/grid-meta.json
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/grid.bin
```

And a stop gate:

```bash
git diff --name-only -- apps/webapp/js
```

Expected: no output for a normal event addition.

Explain: if app TS changes seem necessary, stop and open a separate architecture/contract defect task.

Also warn that Vite publishes every directory under `apps/webapp/map-bundles`, even unregistered ones. Never leave fake/stale staging bundle directories there.

- [ ] **Step 9: Document generated-artifact ownership**

State clearly:

```text
map-bundle/manifest.json
map.svg
points.json
grid-meta.json
grid.bin
```

are wrapper output. If incorrect, correct reviewed wrapper input and regenerate. Do not hand-edit final web assets merely to make meirochou verification pass.

- [ ] **Step 10: Document automated verification commands**

Use:

```bash
npx vitest run --root . \
  tests/event-registry.test.ts \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts \
  tests/deployment-build.test.mjs

npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

Do not document a guessed `--project=chromium` command as a universal gate.

Explain limitations: existing E2E is primarily application regression and fixture-driven; it does not replace a manual smoke against the newly added production registry/bundle.

- [ ] **Step 11: Document local/manual production-registry smoke**

After automated gates, instruct the operator to run the normal app without `?demo_ui=1` using the normal development/preview workflow.

Minimum checklist:

```text
new event/display days appear
switching to it loads map bundle without bootstrap error
area/location controls reflect its manifest prefixes/labels
one reviewed representative space from each materially different area is representable
existing C108 still selects/loads
```

If route-ready source data exists, add one short known-circle route-start smoke. Do not invent fake spaces just to complete the checklist.

- [ ] **Step 12: Document deployment and rollback by reference**

Link to:

```text
guides/cloudflare-pages-deployment.md
```

Summarize:

```text
review + required gates -> merge main -> Cloudflare Pages production deploy
verify GitHub Actions + Cloudflare deployment
production smoke new event + C108
rollback/revert if unhealthy
```

Do not copy credentials or Cloudflare account identifiers.

- [ ] **Step 13: Add common-failure recovery table/text**

Cover at minimum:

```text
wrapper review_needed/preflight failure
source map manifest missing
registry eventId / manifest eventId mismatch
nested map-bundle copy mistake
unintended public bundle directory
built/source byte mismatch
new event appears to require application TypeScript change
```

For each, give a recovery action that fixes data/upstream generation instead of weakening validators.

- [ ] **Step 14: Add the guide to the README documentation index**

Under `## ドキュメント（LLM向け）`, add one bullet:

```markdown
- [イベント追加・運用](guides/event-addition.md) — wrapper生成物をproduction registry/map bundleへdata-onlyで追加・検証・公開する手順
```

Do not rewrite unrelated README sections in Task 7.

- [ ] **Step 15: Run the docs test GREEN**

```bash
npx vitest run --root . \
  tests/webapp-contracts.test.mjs \
  tests/deployment-build.test.mjs \
  tests/event-registry.test.ts

npm run check:webapp
git diff --check
```

Expected: PASS. Record exact counts.

- [ ] **Step 16: Adversarially read the finished guide as a first-time operator**

Verify each answer is explicit in the guide:

```text
Which repo generates what?
What exact command creates staging output?
What must be reviewed before copy?
What directory is copied where?
What must not be copied?
How is registry updated?
What should a normal future diff contain?
Why can an unregistered bundle still ship?
What commands must pass?
What does E2E not prove?
What manual smoke is required?
What happens after main merge?
How do I recover from each common failure?
When must I stop instead of changing app TypeScript?
```

If any answer requires reading this implementation plan rather than the guide itself, fix the guide before commit.

- [ ] **Step 17: Commit Task 7.2**

```bash
git add \
  guides/event-addition.md \
  README.md \
  tests/webapp-contracts.test.mjs

git commit -m "docs(phase-08): add event addition operator guide"
```

---

## Task 7.3: Adversarial scope review before full verification

**Goal:** Confirm Task 7 did not accidentally turn into a new event implementation, a broad validator rewrite, or a wrapper/deployment automation project.

**Do not:** Fix unrelated code while reviewing, add a real event to demonstrate the guide, or weaken a validator to make a synthetic test pass.

**Files:**
- Review diff only; no file is expected to change unless a Task 7.1/7.2 defect is found.

**Interfaces:**
- Consumes: `TASK_START_SHA..HEAD` diff.
- Produces: a bounded Task 7 implementation ready for full verification.

- [ ] **Step 1: Inspect the full changed-file set**

```bash
git diff --name-status "$TASK_START_SHA"..HEAD
```

Before progress update, expected implementation files are only:

```text
M scripts/verify-webapp-build.mjs
M tests/deployment-build.test.mjs
M tests/event-registry.test.ts
M tests/webapp-contracts.test.mjs
A guides/event-addition.md
M README.md
```

Plus the two pre-existing planning docs already present at `TASK_START_SHA` and therefore not part of implementation diff.

- [ ] **Step 2: Prove protected production paths are untouched**

```bash
git diff --name-only "$TASK_START_SHA"..HEAD -- \
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

Expected: no output.

- [ ] **Step 3: Prove no real C109 production data was added**

```bash
test ! -e apps/webapp/map-bundles/C109
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const registry = JSON.parse(fs.readFileSync('apps/webapp/events/manifest.json', 'utf8'));
if (registry.events.some((event) => event.eventId === 'C109')) process.exit(1);
NODE
```

Expected: success.

The guide may contain `C109` as a command example; production data may not.

- [ ] **Step 4: Prove C108 regressions were not erased**

```bash
git grep -n 'C108 public bundle must contain exactly 17 files' -- \
  scripts/verify-webapp-build.mjs

git grep -n 'built C108 asset missing' -- \
  scripts/verify-webapp-build.mjs

git grep -n 'production registry excludes demo-v1' -- \
  tests/event-registry.test.ts
```

Expected: all return matches.

- [ ] **Step 5: Check for overengineering**

```bash
git diff --name-only "$TASK_START_SHA"..HEAD | \
  grep -E 'install-event|deploy-event|registry-editor|event-installer|migration' || true
```

Expected: no new automation file.

Also inspect diff manually: there must be no new runtime parser, schema, CLI, dependency, generic validator framework, or wrapper code.

- [ ] **Step 6: Verify generated-artifact guidance does not encourage hand patching**

```bash
git grep -n 'regenerate\|再生成' -- guides/event-addition.md
git grep -n 'apps/webapp/js' -- guides/event-addition.md
```

Expected: guide explicitly tells the operator to regenerate incorrect generated assets and treats app TS diff as abnormal/stop condition.

No commit unless this review exposes a real Task 7 defect; fix such a defect in the owning Task 7.1/7.2 files and amend with a new meaningful commit rather than hiding it.

---

## Task 7.4: Full Phase 8 handoff verification and progress record

**Goal:** Run current whole-project gates, record actual evidence, and leave Task 7 ready for browser-side final Phase 8 review without declaring Phase 8 closed prematurely.

**Do not:** Mark Task 7/browser acceptance/Phase 8 CLOSED yourself, merge main, update snapshots, increase retries, or suppress failures.

**Files:**
- Modify: `docs/status/progress.md`

**Interfaces:**
- Consumes: final Task 7 implementation and existing project scripts.
- Produces: factual Task 7 verification handoff; no runtime behavior change.

- [ ] **Step 1: Re-run the complete focused Task 7 suite from a fresh command**

```bash
npx vitest run --root . \
  tests/deployment-build.test.mjs \
  tests/event-registry.test.ts \
  tests/webapp-contracts.test.mjs \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts
```

Record exact files/tests/pass/fail counts and exit code.

- [ ] **Step 2: Run full repository verification**

```bash
npm run verify
```

Record exact result and all suite counts emitted by the script.

If failure occurs, do not immediately edit tests. Determine whether failure is Task 7 regression, existing baseline issue, or environment-specific.

- [ ] **Step 3: Run final Phase 8 full E2E baseline**

```bash
npm run test:e2e:ci
```

Record:

```text
total tests
passed
failed
skipped
retry/flaky count
exit code
```

If a test fails:

1. record exact test/error;
2. inspect trace/screenshot if produced;
3. rerun that exact test once using the repository-supported container/project invocation rather than guessing a project name;
4. if needed, run the same failure against `TASK_START_SHA` to classify baseline vs Task 7 regression.

HEAD-only failure is `TASK7_REGRESSION`.

A retry-pass is still reported as flaky; do not conceal it.

- [ ] **Step 4: Run architecture/public-tree/hygiene gates**

```bash
npm run check:webapp:architecture
node scripts/audit-public-tree.mjs
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Run the final protected-path audit**

```bash
git diff --name-only "$TASK_START_SHA"..HEAD -- \
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

Expected: no output.

- [ ] **Step 6: Update `docs/status/progress.md` minimally and factually**

Preserve prior Task 1〜6 verification history.

Update current Phase 8 state to the equivalent of:

```text
現在Task: Phase 8 Task 7 event-addition/operator docs — implementation complete / browser review pending
次: Phase 8 final browser review / closure. No further implementation Task is authorized before Task 7 acceptance.
canonical Task 7 plan: docs/plans/phase-08/task-07-event-addition-operator-docs.md
Task 7 design: docs/specs/2026-08-21-phase-08-task-07-event-addition-operator-docs-design.md
```

Add a short Task 7 verification/handoff section with actual measured results only.

Record the known Task 6 planning-command correction factually, for example:

```text
Task 6 production behavior required no Task 7 repair. Its historical focused Playwright plan used a project name that did not select webapp.spec; Task 7 operator guidance therefore uses the canonical npm run test:e2e:ci gate and does not propagate that command.
```

Record the Task 7 residual blocker correction:

```text
historical build verifier / production registry tests no longer require exactly [C108]; synthetic second registered event is accepted while C108-specific regressions remain.
```

Do **not** write:

```text
Task 7 CLOSED
Task 7 browser accepted
Phase 8 CLOSED
```

before browser-side review.

- [ ] **Step 7: Commit the verification record**

```bash
git add docs/status/progress.md
git commit -m "docs(phase-08): record task 7 verification"
```

- [ ] **Step 8: Final adversarial audit**

Run:

```bash
git status --short
git diff --name-status "$TASK_START_SHA"..HEAD
git log --oneline "$TASK_START_SHA"..HEAD
git diff --check
```

Then answer all of these from the actual diff, not memory:

```text
1. Did Task 7 add any real event? Must be no.
2. Did Task 7 touch apps/webapp/js? Must be no.
3. Does the deployment fixture prove a real second registry->manifest->bundle path, not only a second eventId string? Must be yes.
4. Does the verifier still compare all source/built bundle files byte-for-byte? Must be yes.
5. Do missing asset/path escape/symlink/credential negative tests remain? Must be yes.
6. Does C108 retain exact 17-file and explicit built-asset checks? Must be yes.
7. Does production registry test retain C108 day1/day2 and demo-v1 exclusion? Must be yes.
8. Does the operator guide use wrapper build-event rather than manual asset construction? Must be yes.
9. Does it explain event-registry-entry.json is merged, not copied into public tree? Must be yes.
10. Does it explain Vite may publish unregistered map-bundle directories? Must be yes.
11. Does it forbid hand patching generated bundle artifacts? Must be yes.
12. Does it provide an apps/webapp/js no-diff stop gate? Must be yes.
13. Does it require npm run verify and npm run test:e2e:ci? Must be yes.
14. Does it include manual production-registry smoke? Must be yes.
15. Does it link existing Cloudflare deployment/rollback authority? Must be yes.
16. Did it avoid inventing a universal --project=chromium command? Must be yes.
17. Was no installer/deployer CLI added? Must be yes.
18. Were no package/workflow/Vite changes made? Must be yes.
19. Was Task 6 onboarding behavior left unchanged? Must be yes.
20. Is Phase 8 still pending browser acceptance rather than self-declared closed? Must be yes.
```

If any answer is wrong, fix it before push and rerun affected gates.

- [ ] **Step 9: Push the same Task 7 branch and stop**

```bash
git push origin docs/phase-08-task-07-event-addition-operator-docs-plan
```

Do not merge main. Do not create/implement another Phase Task. Stop for browser review.

---

## Final report required from the implementing agent

The final Codex report must contain all of the following:

```text
TASK_START_SHA
final pushed HEAD
commit list
complete changed-file list
```

Task 7.0 evidence:

```text
focused baseline counts/result
Task 6 inherited-state checks
historical C108-only grep evidence
current production registry/event data unchanged
Playwright config/project-name finding
```

Task 7.1 evidence:

```text
multi-event test initial RED exact failure
final deployment-build test counts
final event-registry test counts
synthetic registered other-v1 path/mapBundle/manifest proof
expected result.eventIds
expected verifiedFiles count
C108 exact regression grep proof
demo-v1 exclusion proof
```

Task 7.2 evidence:

```text
docs test initial RED exact failure
final webapp-contract test counts
guide path
README link
guide sections/checklist proof
no secret/token values
no installer script
```

Task 7.4 evidence:

```text
final focused suite exact counts
npm run verify exact result/counts
npm run test:e2e:ci exact total/pass/fail/skip/retry
npm run check:webapp:architecture result
node scripts/audit-public-tree.mjs result
git diff --check result
protected-path audit result
```

Also explicitly report:

```text
no real C109 production event added
no apps/webapp/js changes
no production registry/map-bundle changes
no Vite/package/workflow changes
Task 6 required no production repair
Task 6 Playwright command mismatch was not propagated
Phase 8 not self-declared CLOSED
```

Codex self-review is not browser acceptance. After push, wait for browser-side adversarial review.
