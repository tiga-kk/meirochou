# Phase 5D Handoff: Apps Internal Refactor Verification

**確認日:** 2026-08-04
**判定:** BLOCKED（Task 3.1のreview証跡と、legacy責務の移行完了が未確認）
**Branch:** `feature/phase-05d`

## Summary

Task 10の検証記録を作成した。現行treeでは、Task 8/9までの変更により旧ファイル名の削除、feature public API、architecture checkerの実行可能化は確認できる。一方、Task 3.1の専用commitまたはreview記録は履歴から確認できず、Task 9で削除した旧facadeの責務も新featureへ完全移行したとは判定できない。

したがって、Phase 5Dを完了扱いにせず、Phase 5Eへのhandoffは保留する。

## Task commit and review trace

| Task | Candidate commit(s) | Review status |
|---|---|---|
| 1 | `eaa88d5` | implementation exists; dedicated final review record not found |
| 2 | `7651862` | implementation exists; dedicated final review record not found |
| 3 | `b9679d8`, `c3b3777`, `8479492` | implementation exists; foundation review was not closed |
| 3.1 | — | **BLOCKER: dedicated commit/review not found** |
| 4 | `f7ba8a4` | implementation exists; depends on unclosed Task 3.1 |
| 5 | `699288b` | implementation exists; depends on unclosed Task 3.1 |
| 6 | `db24a5e`, `8320bbf` | implementation exists; depends on unclosed Task 3.1 |
| 7 | `88f5e71` | implementation exists; depends on unclosed Task 3.1 |
| 8 | `4f3c07f` | implementation exists; depends on unclosed Task 3.1 |
| 9 | `65a505b` | implementation exists; semantic completion requires review |
| 10 | this commit | verification record created; Phase exit gate not met |

## Legacy-to-current mapping

| Legacy path | Current path / remaining risk |
|---|---|
| `js/app.js` | `js/app/` assembly and shell plus `js/comipath-browser-runtime.js`; runtime facade remains 2,791 lines |
| `js/data-manager.ts` | `js/event-day-data-store.ts` and feature modules; data-store remains 1,009 lines |
| `js/ui-manager.js` | `js/comipath-dom-coordinator.js` and feature/shared views; coordinator remains 479 lines |
| `js/config.ts` | `features/event-day/infrastructure/http-map-manifest-loader.ts` and `MapAreaCatalog` |
| `js/types/domain.ts` | `features/event-day/domain/application-contract-types.ts` (312 lines; central contract ownership still needs review) |
| `js/types/boundary-parsers.ts` | `features/event-day/infrastructure/application-boundary-parsers.ts` (746 lines; mixed boundary ownership still needs review) |

The seven legacy paths and `scripts/webapp-architecture-legacy-allowlist.json` are absent. Absence of the old names alone is not evidence that all responsibilities have been distributed.

## Current structure and public boundaries

Feature directories currently present: `event-day`, `circle-status`, `route-guidance`, `circle-data-source`, and `local-data-deletion`. Their `public-api.ts` files do not export concrete `LocalStorage`, `Http`, `Browser`, `WebWorker`, or `Gas*Client` names, and no feature `index.ts` files were found.

The assembly entry point is `apps/webapp/js/app/assemble-comipath-application.ts`. The browser runtime and data store still act as broad coordination/state owners, so the ownership boundary is not accepted as final until Task 3.1 and Task 9 are reviewed against the design.

## State and lifecycle contracts to preserve

- Active event/day and pending GAS updates must remain in the event/day persisted state; `gasOutbox` is the only pending-update persistence field found.
- Route guidance mutable state must have one owner and stale request/timer/worker callbacks must not update state after stop.
- Browser start/stop, pagehide, retry-after-failure, and listener registration require the Task 3.1 review evidence before Phase completion.
- LocalStorage schema, GAS local-first ordering, CSV preview/apply/cancel, route guidance, resume, and deletion behavior must remain unchanged.

## Verification evidence

| Check | Result |
|---|---|
| `npm ci` from a fresh `node_modules` directory | PASS; npm reported 69 packages installed, with one existing moderate audit finding |
| `node scripts/check-webapp-architecture.mjs` | PASS; 134 files |
| legacy file/allowlist absence checks | PASS |
| feature `index.ts` absence | PASS |
| `npm run test:webapp` | PASS previously on current commit: 487 tests / 69 files |
| `npm run check:webapp` | PASS previously on current commit |
| `npm run build:webapp` and `npm run verify:webapp:build` | PASS previously on current commit |
| `npm run verify:gas` | PASS previously on current commit |
| `CI=1 npm run test:e2e` | PASS: 38 passed / 8 skipped, one worker |
| `RUN_C108_SMOKE=1 npx playwright test ... --project=chromium --project=mobile-chromium` | PASS: 8 passed |
| `node scripts/audit-public-tree.mjs` | PASS previously on current commit |
| `npx biome check` | PASS with existing warnings only |
| user-flow human smoke | NOT RUN in this environment |

## GitHub Actions investigation

`gh auth status` succeeded and PR #7 was inspected. The failing remote run was `30928219194`, at old SHA `4f3c07f` (Task 8). Its only failure was mobile Chromium visual assertions: received images were one pixel shorter and differed by ratios from 0.02 to 0.08. No unit, type, or build failure was reported.

The same CI setting (`CI=1`, one worker) passes on the current tree, so no snapshot update or relaxed diff threshold was added. The remote result remains historical until this branch is pushed; this Task does not authorize push.

## Blocking risks and next action

1. Implement and review Task 3.1, including its lifecycle and foundation contracts.
2. Review Task 4–9 against the Task 3.1 gate and record the review results.
3. Complete the remaining runtime/data/coordinator responsibility migration or explicitly revise the Phase 5D design and acceptance criteria.
4. Re-run the full clean verification and perform the listed browser user-flow smoke before changing the Phase status to complete.

## Rollback and Phase 5E boundary

The rollback point before Task 10 is `65a505b` (Task 9). Do not begin the Phase 5E tests/docs reorganization while this handoff is BLOCKED. Once the exit gate is satisfied, Phase 5E may reorganize test/doc locations and names, but must preserve the feature public APIs, LocalStorage/GAS/CSV/route contracts, and lifecycle guarantees recorded above.
