# Phase 8 Task 8 final regression / closure candidate

## Baseline

- `TASK_START_SHA`: `3e6fd975fe5abb10e289a7d568dbaa608a5f2925` (current remote branch HEAD at Task 8 start).
- Task 8 implementation candidate before the closure evidence commit: `a1a4bcf` (`test(e2e): stabilize management scroll restore`).
- Task 7 planning commit: `d5575437a5976c9c544d62c542600c1887eff525` (`docs(phase-08): plan event addition operator workflow`).
- Task 7 implementation commits: `d4e71ebe5df632008030e6a5b929233cad12ce10` (`fix(build): allow multiple production events`), `7cead9538db4371e0ac3e8ae47b6c05822410504` (`docs(phase-08): add event addition operator guide`), and `aca695ff32191ae35b959726977a6d91b18c81dd` (`docs(phase-08): record task 7 verification`). All are ancestors of `TASK_START_SHA`.
- Environment: Node.js `v22.14.0`, npm `10.9.2`, Playwright `1.61.1`, Linux `x64`.

## Task 7 adversarial review

Task 7 planning-to-final actual diff was:

```text
M README.md
M docs/status/progress.md
A guides/event-addition.md
M scripts/verify-webapp-build.mjs
M tests/deployment-build.test.mjs
M tests/event-registry.test.ts
M tests/webapp-contracts.test.mjs
```

The protected-path diff was empty. The inherited focused Task 7 suite passed `5 files / 107 tests / exit 0`.

- `tests/deployment-build.test.mjs:addRegisteredBundle()` copies the real C108 source tree to `TEMP_ROOT/apps/webapp/map-bundles/other-v1` and the real built tree to `TEMP_ROOT/dist/webapp/assets/maps/other-v1`, rewrites both manifests to `eventId: "other-v1"`, and registers `mapBundle: ../maps/other-v1/manifest.json` with `mapBundleContract: "event"`.
- The positive expectation remains `result.eventIds == ["C108", "other-v1", "public-v1"]` and `verifiedFiles == 39`.
- Duplicate protection remains at `scripts/verify-webapp-build.mjs:222` and `tests/deployment-build.test.mjs:239`.
- The C108 exact 17-file regression remains at `scripts/verify-webapp-build.mjs:361`; explicit built C108 asset checks remain at `scripts/verify-webapp-build.mjs:404`.
- `tests/event-registry.test.ts:205` retains `production registry excludes demo-v1`.
- Current production registry is `["C108"]`; `apps/webapp/map-bundles/C109` does not exist.
- `README.md` links `guides/event-addition.md`. The guide retains wrapper `build-event`, `event-registry-entry.json` merge (not public-tree copy), safe new-directory copy, unregistered-bundle warning, regenerate-not-patch ownership, the `apps/webapp/js` stop gate, `npm run verify`, `npm run test:e2e:ci`, manual smoke, Cloudflare Pages, and rollback guidance.

Review verdict: **ACCEPTABLE**. The only known carryover was the management scroll retry/flaky test described below; no additional material Task 7 defect was found.

## Management scroll flake

- Historical Task 7 occurrence: `Expected 160 / Received 166`, then retry passed.
- Root cause from Task 0/Task 7: browser layout settling/scroll anchoring changed the scroll value between the synthetic pre-click baseline and the actual settings-open click. Production scroll lock correctly saved and restored the actual lock-time value.
- Pre-fix measurement: `20 passed / 0 failed / 0 skipped / exit 0 / retries 0`.
- Exact test-only correction: `tests/e2e/management.spec.ts` now installs a one-shot capturing `click` listener on `#toggle-settings`, records `window.scrollY` in `document.body.dataset.managementScrollBeforeOpen`, polls for a positive scroll position, clicks, reads that captured value, and keeps the final `window.scrollY` assertion as exact equality.
- Post-fix focused single: `1 passed / 0 failed / exit 0 / retries 0`.
- Post-fix stress: `50 passed / 0 failed / 0 retries / exit 0`.
- Whole management spec: `18 passed / 0 failed / 0 skipped / exit 0 / retries 0`.
- No sleep, hard-coded `166`, tolerance, retry increase, timeout-only workaround, or production scroll-lock change was added.

## Phase 8 invariant audit

| Invariant | Evidence | Result |
| --- | --- | --- |
| Multiple unique events remain supported | `parseEventRegistry` accepts inherited C108 plus C999 in `tests/phase-08-data-only-event-addition.test.ts`; Task 7 fixture expects C108/other-v1/public-v1. | PASS |
| Strict map manifest remains data-owned | `application-boundary-parsers.ts` requires one-or-more areas and validates area IDs, map IDs, positive `metersPerPixel`, non-empty unique `prefixes`/`labels`, and relative `assets.svg`, `assets.points`, `assets.gridMeta`, `assets.grid`. | PASS |
| Runtime loader remains event-generic | `http-map-manifest-loader.ts` has no `C108` reference; `mapBundleContract` selection is data-driven in the boundary parser and loader. | PASS |
| C999 data-only route assets reach runtime adapters | The C999 test traverses `parseEventRegistry -> resolveEventMapManifestUrl -> loadRuntimeMapBundleManifestFromUrl -> runtimeMapAreaCatalog -> HttpRouteMapAssetsLoader`, then validates points, grid metadata, and 24 grid bytes. `areaId` is `east` while raw `map_id` is `fixture-map`. | PASS |
| Multi-event verifier and C108 regressions coexist | `tests/deployment-build.test.mjs` retains real `other-v1` source/output fixture and duplicate-ID rejection; verifier retains C108 17-file and explicit built-asset checks. | PASS |
| Task 5 application assembly remains covered | `bind-management-action-events.ts` and `browser-management-projection.ts` exist; `tests/application-assembly.test.ts` covers binding singleton, route-guidance injection, background process, deletion callbacks, and adapter boundaries. | PASS |
| Task 6 first-use behavior remains covered | `meirochou.first-use-guide-seen`, `readFirstUseGuideSeen`, and `markFirstUseGuideSeen` remain in source/tests; onboarding E2E proves normal one-time launch and `demo_ui` non-persistence. | PASS |
| Task 7 operator workflow remains linked and data-only | README link and guide checks cover `build-event`, registry merge, safe copy, unregistered warning, regenerate-not-patch, `apps/webapp/js` no-diff gate, canonical verify/E2E, manual smoke, deployment, and rollback. | PASS |

## Focused verification

- Task 7 inherited focused suite before the Task 8 edit: `5 files / 107 tests passed / exit 0`.
- Task 8 focused Phase 8 Vitest suite (`event-registry`, `map-bundle-selection`, `phase-08-data-only-event-addition`, `deployment-build`, `application-assembly`, `first-use-guide-state`, `webapp-contracts`): `7 files / 116 tests passed / exit 0`.
- Focused onboarding + management E2E under `mobile-chromium`, `--retries=0`: `20 passed / 0 failed / 0 skipped / exit 0`.

## Full verification

- `npm run verify`: exit `0`.
  - Webapp: `146 files / 906 tests passed`.
  - Route Guidance: `6 files / 40 tests passed`.
  - Phase 05D regressions: `2 files / 4 tests passed`.
  - Architecture: `191 files`.
  - Build: `26 byte-identical map assets across 2 public bundles`.
  - GAS: `2 files / 38 tests passed`.
  - Catalog extension: `24 tests passed`.
- Full CI-container E2E with `--retries=0`: `82 total / 74 passed / 0 failed / 8 skipped / exit 0`.
- Canonical `npm run test:e2e:ci`: `82 total / 74 passed / 0 failed / 8 skipped / exit 0`; retry/flaky count `0`.
- `npm run check:webapp:architecture`: PASS (`191 files`).
- `node scripts/audit-public-tree.mjs`: PASS.
- `git diff --check`: PASS.

## Scope audit

Task 8 actual implementation/evidence diff from `TASK_START_SHA` is:

```text
M tests/e2e/management.spec.ts
A docs/reviews/phase-08-task-08-final-regression-closure.md
M docs/status/progress.md
```

No `apps/webapp/js`, `apps/webapp/events`, `apps/webapp/map-bundles`, `functions`, `integrations`, wrapper, package, workflow, Vite, or Playwright-config diff was introduced. No real C109/C110/second production event was added.

## External debt

The existing two GAS items remain `OPEN_EXTERNAL_DEBT` and are outside Task 8 scope:

- evidence that resubmitting the same space updates the existing GAS row;
- evidence that unrelated existing Sheet columns are preserved during GAS updates.

## Verdict

CLOSURE_CANDIDATE_BROWSER_REVIEW_PENDING

Phase 8 is not closed until browser-side review accepts this evidence.
