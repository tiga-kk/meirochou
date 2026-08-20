# Phase 8 Task 6: First-launch Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically present the existing in-app usage guide exactly once for a normal browser profile, while preserving the permanent manual guide entry point and all existing application behavior.

**Architecture:** Reuse the existing `user-guide-dialog`; do not create a wizard or onboarding subsystem. Persist one app-level seen marker through the existing local-state adapter pattern, trigger the dialog from the existing BrowserApplication guide wiring after successful normal-mode initialization, and isolate existing E2E fixtures by seeding the seen marker in their shared fictional-registry helper.

**Tech Stack:** TypeScript 7, Lit, Vitest 4, happy-dom, Playwright, existing `StorageService` and BrowserApplication shell.

**Spec:** `docs/specs/2026-08-20-phase-08-task-06-first-launch-onboarding-design.md`

## Global Constraints

- Repository: `tiga-kk/meirochou`.
- Work only on `docs/phase-08-task-06-first-launch-onboarding-plan`.
- This branch was created from the current Phase 8 Task 5 implementation branch, not from stale `main`; start from the current remote Task 6 planning-branch HEAD.
- Do not reset to a SHA copied from this document.
- This is a small UX behavior change. Reuse the existing `user-guide-dialog`, header button, focus behavior, and storage infrastructure.
- Do not add a wizard, carousel, tour engine, onboarding state machine, new feature directory, analytics, remote config, or backend persistence.
- Do not modify event/map contracts, Event Day transition semantics, CSV/GAS contracts, route algorithms, route persistence, X post behavior, catalog caching, or local data deletion semantics.
- Do not undo or bypass Phase 8 Task 5 management binder/projection/assembly boundaries.
- Do not intentionally change CSS/layout. No CSS or `index.html` change is expected.
- Do not change the existing manual `使い方` button semantics.
- Do not make onboarding completion event/day-specific.
- Do not clear the seen marker when event/day data is deleted.
- Do not auto-open or write the Task 6 marker for `?demo_ui=1`.
- Full `npm run test:e2e:ci` is a completion gate because this Task intentionally changes first-load browser UI behavior.
- Do not update visual snapshots, skip tests, increase retries, or relax assertions merely to make the Task green.
- Do not start Phase 8 Task 7 operator documentation.

## Expected implementation scope

Production:

```text
M apps/webapp/js/data/local-state-adapters.ts
M apps/webapp/js/app/browser-application.ts
M apps/webapp/js/components/user-guide-dialog.ts
```

Tests:

```text
A tests/first-use-guide-state.test.ts
M tests/user-guide-dialog.test.ts
M tests/e2e/fixture-registry.ts
A tests/e2e/first-launch-onboarding.spec.ts
```

Final docs:

```text
M docs/status/progress.md
```

No other production file should be necessary.

---

## Task 6.0: Capture the Task 5-based baseline

**Goal:** Record an exact implementation start point and verify the existing guide/runtime state before changing first-launch behavior.

**Do not:** Modify code, merge `main`, rewrite Task 5, or start Task 7.

**Files:**
- Read: `docs/specs/2026-08-20-phase-08-task-06-first-launch-onboarding-design.md`
- Read: `docs/plans/phase-08/task-06-first-launch-onboarding.md`
- Read: `docs/status/progress.md`
- Read: `apps/webapp/js/components/user-guide-dialog.ts`
- Read: `apps/webapp/js/app/browser-application.ts`
- Read: `apps/webapp/js/data/local-state-adapters.ts`
- Read: `apps/webapp/js/state/storage-service.ts`
- Read: `tests/user-guide-dialog.test.ts`
- Read: `tests/e2e/fixture-registry.ts`
- Read: `tests/e2e/webapp.spec.ts`

- [ ] **Step 1: Sync the exact remote Task 6 branch and record start SHA**

```bash
git fetch origin --prune
git checkout docs/phase-08-task-06-first-launch-onboarding-plan
git pull --ff-only
export TASK_START_SHA="$(git rev-parse HEAD)"
printf 'TASK_START_SHA=%s\n' "$TASK_START_SHA"
git status --short
```

Expected: clean working tree except unrelated user-owned files that must not be reset/deleted.

- [ ] **Step 2: Verify inherited Task 5 files are present**

```bash
test -f apps/webapp/js/app/bind-management-action-events.ts
test -f apps/webapp/js/app/browser-management-projection.ts
git grep -n "buildBrowserManagementProjection" -- apps/webapp/js/app/browser-application.ts
```

Expected: all commands succeed. If Task 5 files are absent, stop as `BLOCKED_WRONG_BASE` rather than rebuilding Task 5.

- [ ] **Step 3: Run focused unit baseline**

```bash
npx vitest run --root . \
  tests/user-guide-dialog.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/route-motion-preference.test.ts
```

Record exact files/tests/pass count and exit code.

- [ ] **Step 4: Run current manual-guide E2E baseline**

```bash
npx playwright test tests/e2e/webapp.spec.ts \
  --project=chromium \
  --grep "使い方"
```

Expected: existing manual header guide test passes before Task 6.

- [ ] **Step 5: Run architecture/hygiene baseline**

```bash
npm run check:webapp:architecture
git diff --check
```

Expected: PASS.

No commit for Task 6.0.

---

## Task 6.1: Add the one-value first-use preference contract

**Goal:** Add a safe app-level seen marker using the existing local-state preference pattern.

**Do not:** Add JSON schema, migration framework, onboarding store/class, event/day repository field, or local-data-deletion coupling.

**Files:**
- Modify: `apps/webapp/js/data/local-state-adapters.ts`
- Create: `tests/first-use-guide-state.test.ts`

**Interfaces:**

Produce exactly:

```ts
export function readFirstUseGuideSeen(
  storage?: FirstUseGuideStorage,
): boolean;

export function markFirstUseGuideSeen(
  storage?: FirstUseGuideStorage,
): void;
```

Internal exact storage contract:

```ts
interface FirstUseGuideStorage {
  getString(key: string, fallback?: string): string;
  setString(key: string, value: string): void;
}
```

Exact marker:

```text
key   = meirochou.first-use-guide-seen
value = 1
```

### Required semantics

```text
missing                -> false
"1"                    -> true
any other stored value -> false
read throws             -> true
mark                    -> setString(exactKey, "1")
write throws            -> swallow / no throw
```

- [ ] **Step 1: Write the failing state-adapter test first**

Create `tests/first-use-guide-state.test.ts` with these cases:

```ts
import { describe, expect, test, vi } from "vitest";
import {
  markFirstUseGuideSeen,
  readFirstUseGuideSeen,
} from "../apps/webapp/js/data/local-state-adapters";

const KEY = "meirochou.first-use-guide-seen";

describe("first-use guide state", () => {
  test("treats only the exact marker as seen", () => {
    let stored = "";
    const storage = {
      getString: (_key: string, fallback = "") => stored || fallback,
      setString: (_key: string, value: string) => {
        stored = value;
      },
    };

    expect(readFirstUseGuideSeen(storage)).toBe(false);
    stored = "0";
    expect(readFirstUseGuideSeen(storage)).toBe(false);
    stored = "legacy";
    expect(readFirstUseGuideSeen(storage)).toBe(false);
    stored = "1";
    expect(readFirstUseGuideSeen(storage)).toBe(true);
  });

  test("writes the exact first-use marker", () => {
    const setString = vi.fn();
    markFirstUseGuideSeen({
      getString: () => "",
      setString,
    });
    expect(setString).toHaveBeenCalledWith(KEY, "1");
  });

  test("fails closed on read errors and ignores write errors", () => {
    expect(
      readFirstUseGuideSeen({
        getString: () => {
          throw new Error("storage blocked");
        },
        setString: () => {},
      }),
    ).toBe(true);

    expect(() =>
      markFirstUseGuideSeen({
        getString: () => "",
        setString: () => {
          throw new Error("storage blocked");
        },
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the new test to verify RED**

```bash
npx vitest run --root . tests/first-use-guide-state.test.ts
```

Expected RED: imports `readFirstUseGuideSeen` / `markFirstUseGuideSeen` do not exist yet. Record exact failure.

- [ ] **Step 3: Implement minimal state functions**

In `local-state-adapters.ts`, near the existing route-motion preference constant/functions, add:

```ts
const FIRST_USE_GUIDE_SEEN_KEY = "meirochou.first-use-guide-seen";

interface FirstUseGuideStorage {
  getString(key: string, fallback?: string): string;
  setString(key: string, value: string): void;
}

export function readFirstUseGuideSeen(
  storage: FirstUseGuideStorage = new StorageService(),
): boolean {
  try {
    return storage.getString(FIRST_USE_GUIDE_SEEN_KEY, "") === "1";
  } catch {
    return true;
  }
}

export function markFirstUseGuideSeen(
  storage: FirstUseGuideStorage = new StorageService(),
): void {
  try {
    storage.setString(FIRST_USE_GUIDE_SEEN_KEY, "1");
  } catch {
    // First-use UI persistence must never block application startup.
  }
}
```

Do not export the key unless implementation requires it for a concrete test. Prefer testing the exact key through the injected storage spy.

- [ ] **Step 4: Run focused GREEN**

```bash
npx vitest run --root . \
  tests/first-use-guide-state.test.ts \
  tests/route-motion-preference.test.ts
npm run check:webapp
git diff --check
```

Expected: all PASS.

- [ ] **Step 5: Commit Task 6.1**

```bash
git add \
  apps/webapp/js/data/local-state-adapters.ts \
  tests/first-use-guide-state.test.ts
git commit -m "feat(ui): persist first-use guide state"
```

---

## Task 6.2: Auto-open the existing guide once in normal runtime

**Goal:** Reuse the existing BrowserApplication guide wiring to display the current dialog exactly once for a browser profile.

**Do not:** Add another dialog/component, add close listeners just to track completion, add onboarding mutable state, alter Task 5 binder/projection ownership, or auto-open in `?demo_ui=1`.

**Files:**
- Modify: `apps/webapp/js/app/browser-application.ts`
- Modify: `apps/webapp/js/components/user-guide-dialog.ts`
- Modify: `tests/user-guide-dialog.test.ts`
- Test: `tests/apps-behavior-characterization.test.ts` (run as regression; modify only if adding one focused behavior assertion is clearly smaller than a new fixture file)

**Interfaces consumed:**

```ts
readFirstUseGuideSeen(): boolean
markFirstUseGuideSeen(): void
isDevDemoEnabled(location): boolean
```

### Exact runtime order

Inside the existing code that resolves:

```text
#btn-open-user-guide
#user-guide-dialog
```

preserve the manual click wiring first.

Then:

```ts
if (
  !isDevDemoEnabled(this.window.location) &&
  !readFirstUseGuideSeen()
) {
  userGuideDialog.open = true;
  markFirstUseGuideSeen();
}
```

Only execute the seen write if both button/dialog wiring reached a valid dialog and auto-open actually occurs.

Do not write the marker in `?demo_ui=1`.

Do not mark on manual button click. Manual open is not a new first-launch event.

Do not wait for a `user-guide-close` event before marking.

- [ ] **Step 1: Add focused guide-copy assertions before changing production copy**

Extend `tests/user-guide-dialog.test.ts` without removing any existing assertion.

Add assertions that rendered text contains all of:

```text
管理
CSV
GAS
現在地
次の目的地を検索
使い方
```

The intent is that the first paragraph explains the actual initial sequence and says the guide remains reopenable.

- [ ] **Step 2: Run the component test and confirm RED on the new sequence wording**

```bash
npx vitest run --root . tests/user-guide-dialog.test.ts
```

Expected: at least one new copy assertion fails before the intro is updated. If all pass already, strengthen only the first-use sequence assertion rather than inventing unrelated wording.

- [ ] **Step 3: Update only the intro copy in `user-guide-dialog.ts`**

Replace the current intro meaning with a compact first-use sequence equivalent to:

```text
初めて使う場合は、管理からCSVまたはGASで巡回リストを読み込み、現在地を設定して「次の目的地を検索」を押すと案内が始まります。閉じてもヘッダーの「使い方」からいつでも確認できます。
```

Keep all existing detailed sections and accessibility behavior.

Do not rewrite CSV/GAS contract details during this Task unless current code is factually inconsistent with existing production parser; if such inconsistency is discovered, stop and report instead of silently expanding Task 6.

- [ ] **Step 4: Import and wire the new preference helpers in `browser-application.ts`**

Extend the existing import from `../data/local-state-adapters`:

```ts
import {
  markFirstUseGuideSeen,
  readFirstUseGuideSeen,
  readRouteMotionPreference,
  writeRouteMotionPreference,
} from "../data/local-state-adapters";
```

Then minimally extend the existing guide block.

Do not move this into a new `OnboardingController`, `Manager`, `Service`, or app feature.

- [ ] **Step 5: Add a focused browser-shell characterization assertion**

Prefer adding one focused test to the existing BrowserApplication characterization fixture if it can reuse `createBrowserApplicationOptions()` cleanly.

The assertion must prove at least:

```text
normal location + missing marker -> guide open and marker written
```

If the existing fixture makes direct app initialization substantially more complex than the E2E proof, do not build a large unit fixture. In that case rely on Task 6.1 unit state tests plus Task 6.3 Playwright for the integration behavior, and leave `apps-behavior-characterization.test.ts` unchanged.

Do not introduce dependency injection into `BrowserApplicationOptions` only for the onboarding storage test.

- [ ] **Step 6: Run Task 6.2 focused tests**

```bash
npx vitest run --root . \
  tests/first-use-guide-state.test.ts \
  tests/user-guide-dialog.test.ts \
  tests/apps-behavior-characterization.test.ts
npm run check:webapp
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6.2**

```bash
git add \
  apps/webapp/js/app/browser-application.ts \
  apps/webapp/js/components/user-guide-dialog.ts \
  tests/user-guide-dialog.test.ts
```

If `tests/apps-behavior-characterization.test.ts` was legitimately modified, include it.

```bash
git commit -m "feat(ui): show guide on first launch"
```

---

## Task 6.3: Isolate existing E2E and prove first-launch behavior

**Goal:** Keep all existing fictional-demo E2E behavior stable while adding one dedicated first-launch browser test.

**Do not:** Modify every E2E spec individually, disable the auto-open in production, add event-specific C108 logic, or rely on `?demo_ui=1` for the positive first-launch proof.

**Files:**
- Modify: `tests/e2e/fixture-registry.ts`
- Create: `tests/e2e/first-launch-onboarding.spec.ts`
- Regression: `tests/e2e/webapp.spec.ts`

### Fixture API

Add exactly one optional behavior flag:

```ts
export interface DemoEventRegistryRouteOptions {
  readonly firstUseGuideSeen?: boolean;
}

export async function routeDemoEventRegistry(
  page: Page,
  options: DemoEventRegistryRouteOptions = {},
): Promise<void>
```

Default:

```ts
const firstUseGuideSeen = options.firstUseGuideSeen ?? true;
```

When true, before navigation seed:

```ts
await page.addInitScript(() => {
  localStorage.setItem("meirochou.first-use-guide-seen", "1");
});
```

When false, do not seed/remove the key. A fresh Playwright page/context should therefore start unseen.

Do not change the fictional registry payload.

- [ ] **Step 1: Modify fixture helper first and verify existing guide E2E remains green**

After adding the default marker seed:

```bash
npx playwright test tests/e2e/webapp.spec.ts \
  --project=chromium \
  --grep "使い方"
```

Expected: the existing manual guide test still passes unchanged.

- [ ] **Step 2: Create dedicated first-launch E2E**

Create `tests/e2e/first-launch-onboarding.spec.ts` with its own routing setup.

Structure:

```ts
import { expect, test } from "@playwright/test";
import { routeDemoEventRegistry } from "./fixture-registry";

const FIRST_USE_KEY = "meirochou.first-use-guide-seen";

test.beforeEach(async ({ context, page }) => {
  await context.route(
    /(?:cdnjs\.cloudflare\.com|platform\.twitter\.com)/,
    (route) => route.abort(),
  );
  await routeDemoEventRegistry(page, { firstUseGuideSeen: false });
});
```

Positive normal-runtime test:

```text
page.goto("/")
expect guide dialog visible
expect intro text mentions 管理 / 次の目的地を検索 / 使い方
expect localStorage marker === "1"
Escape
expect dialog closed
reload
expect dialog remains closed automatically
click header 使い方
expect dialog visible again
```

Use actual role/locator patterns already used by `webapp.spec.ts`.

- [ ] **Step 3: Add dev-demo negative test**

Use a fresh context/page behavior within the same spec or a second test.

Navigate:

```text
/?demo_ui=1
```

with marker absent.

Assert:

```text
guide dialog is not auto-open
localStorage marker is null
manual 使い方 button opens guide
```

Do not interpret manual open as a reason to set the first-use marker in demo mode.

- [ ] **Step 4: Run focused onboarding E2E**

```bash
npx playwright test tests/e2e/first-launch-onboarding.spec.ts --project=chromium
```

Expected: both positive and demo-negative tests PASS with no retry.

- [ ] **Step 5: Run adjacent manual-guide E2E**

```bash
npx playwright test tests/e2e/webapp.spec.ts \
  --project=chromium \
  --grep "使い方"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6.3**

```bash
git add \
  tests/e2e/fixture-registry.ts \
  tests/e2e/first-launch-onboarding.spec.ts
git commit -m "test(ui): cover first-launch guide"
```

---

## Task 6.4: Full verification, scope audit, and handoff

**Goal:** Prove Task 6 changes only first-launch guide presentation and leaves the rest of the application stable.

**Do not:** Mark browser acceptance complete, merge `main`, or begin Task 7.

**Files:**
- Modify after all gates pass: `docs/status/progress.md`

- [ ] **Step 1: Run full focused unit suite**

```bash
npx vitest run --root . \
  tests/first-use-guide-state.test.ts \
  tests/user-guide-dialog.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/route-motion-preference.test.ts
```

Record exact file/test counts and exit code.

- [ ] **Step 2: Run focused E2E suite**

```bash
npx playwright test \
  tests/e2e/first-launch-onboarding.spec.ts \
  tests/e2e/webapp.spec.ts \
  --project=chromium \
  --grep "first|初回|使い方"
```

If grep does not select the dedicated tests because of Japanese title wording, run the dedicated spec without grep plus the existing `使い方` grep separately. Do not weaken test names/assertions to fit a grep command.

- [ ] **Step 3: Run full verification**

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

Record exact results/counts/retries.

If E2E fails:

1. record failing test and exact assertion/error;
2. inspect trace/screenshot;
3. rerun exactly that test once;
4. if necessary compare against `TASK_START_SHA` under the same environment;
5. classify head-only failure as `TASK6_REGRESSION`.

Do not hide a failure with retry/skip/snapshot/threshold changes.

- [ ] **Step 4: Audit exact scope**

```bash
git diff --name-status "$TASK_START_SHA"..HEAD
```

Expected Task 6 implementation files are limited to:

```text
apps/webapp/js/data/local-state-adapters.ts
apps/webapp/js/app/browser-application.ts
apps/webapp/js/components/user-guide-dialog.ts
tests/first-use-guide-state.test.ts
tests/user-guide-dialog.test.ts
tests/e2e/fixture-registry.ts
tests/e2e/first-launch-onboarding.spec.ts
docs/status/progress.md
```

`tests/apps-behavior-characterization.test.ts` may also appear only if one focused existing-fixture assertion was added without weakening prior behavior.

Protected paths that should have no Task 6 diff:

```bash
git diff --name-only "$TASK_START_SHA"..HEAD -- \
  apps/webapp/js/features \
  apps/webapp/events \
  apps/webapp/map-bundles \
  vite.config.ts \
  package.json \
  package-lock.json \
  integrations \
  functions \
  .github/workflows
```

Expected: empty.

- [ ] **Step 5: Run anti-overengineering audit**

```bash
git diff --name-only "$TASK_START_SHA"..HEAD | grep -Ei \
  '(onboarding-(manager|service|store|controller)|tutorial|tour-engine)' && exit 1 || true

git grep -n -E 'class (Onboarding|Tutorial|Tour).*(Manager|Service|Store|Controller)' -- \
  apps/webapp/js || true
```

Expected: no new Task 6 abstraction family.

Also inspect actual diff and confirm:

```text
- one persistent marker only
- no onboarding step state
- no event/day ownership
- no backend/API
- no Task 5 boundary reversal
```

- [ ] **Step 6: Update progress only after all verification passes**

In `docs/status/progress.md`, minimally record:

```text
Phase 8 Task 6 first-launch onboarding — implementation complete / browser review pending
```

Add actual verification counts/results only.

Set next Task to:

```text
Phase 8 Task 7 event-addition/operator docs — Task 6 browser acceptanceまで開始禁止
```

Do not write `CLOSED`, `ACCEPTED`, or browser acceptance complete.

- [ ] **Step 7: Commit verification record**

```bash
git add docs/status/progress.md
git commit -m "docs(phase-08): record task 6 verification"
```

- [ ] **Step 8: Final branch audit and push**

```bash
git status --short
git diff --name-status "$TASK_START_SHA"..HEAD
git log --oneline "$TASK_START_SHA"..HEAD
git diff --check
git push origin docs/phase-08-task-06-first-launch-onboarding-plan
```

Stop after push. Do not merge.

---

## Adversarial self-review checklist

Before claiming implementation complete, answer all items from the actual diff.

1. Does normal marker-less `/` auto-open the existing `user-guide-dialog`?
2. Is the exact marker `meirochou.first-use-guide-seen = "1"` written only after auto-open is triggered?
3. Does reload avoid automatic reopening?
4. Does manual `使い方` still open the same dialog after the marker exists?
5. Does manual opening avoid creating a second onboarding mechanism?
6. Does `?demo_ui=1` avoid Task 6 auto-open?
7. Does `?demo_ui=1` avoid Task 6 marker writes?
8. Are storage read errors fail-closed (`seen=true`) and non-fatal?
9. Are storage write errors swallowed and non-fatal?
10. Is the marker app-level rather than event/day-level?
11. Does local event deletion leave the marker alone?
12. Is there still only one guide dialog component?
13. Is there no wizard, step model, tour library, analytics, or backend state?
14. Are existing CSV/GAS contract explanations still present?
15. Are focus trap, Escape, backdrop, close button, and manual opener behavior preserved?
16. Did existing E2E fixtures avoid first-launch interference via one shared helper rather than per-spec edits?
17. Does the dedicated Playwright test prove open -> mark -> close -> reload -> no auto-open -> manual reopen?
18. Does the dedicated dev-demo test prove no auto-open/no marker but manual guide still works?
19. Are Task 5 management binder/projection/Route Guidance assembly untouched except normal BrowserApplication guide-line additions?
20. Are protected-path diffs empty?
21. Are full `npm run verify`, `npm run test:e2e:ci`, public-tree audit, and `git diff --check` green?
22. Is Task 7 untouched?

Any failed item blocks Task 6 completion.

## Required final Codex report

Report exactly:

```text
TASK_START_SHA
final pushed HEAD
commit list
changed-file list

Task 6.0 focused baseline counts
Task 6.0 manual-guide E2E baseline result
Task 6.1 initial RED exact failure
Task 6.1 focused GREEN counts
Task 6.2 copy RED exact failure
Task 6.2 focused GREEN counts
Task 6.3 onboarding E2E counts/retry status
Task 6.3 existing manual-guide E2E result
full focused unit counts
npm run verify exact result/counts
npm run test:e2e:ci exact result/counts/retries
architecture/public-tree/diff-check results
protected-path diff result

proof normal first launch auto-opens
proof exact marker is stored
proof reload does not auto-open again
proof manual guide remains available
proof demo_ui neither auto-opens nor writes marker
proof storage failures do not block boot
proof no wizard/state machine/framework was added
proof Task 5 boundaries were not reversed
proof Task 7 was not started
```

Codex self-assessment is not browser acceptance. Browser-side adversarial review is the next gate after push.
