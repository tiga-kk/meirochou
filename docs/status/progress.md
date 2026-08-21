# 実装進捗

更新日: 2026-08-22

この文書を、現在フェーズ、現在Task、次に着手するTask、未完了の外部確認の唯一の正本とする。

## 現在状態

- 現在フェーズ: **Phase 8: event map / bundle汎用化 — CLOSED / browser accepted**
- Phase 8 Task 1: meirochou generic event map contract — complete.
- Phase 8 Task 2: meirochou_wrapper reproducible map.svg generation — complete.
- Phase 8 Task 3: meirochou_wrapper reviewed event build pipeline — complete.
- Phase 8 Task 9: space metadata contract closure — **ACCEPTED**.
- 現在Task: **Phase 8 — CLOSED**
- 次に着手するTask: **未設定。次Phaseは別計画として開始する。**
- canonical Task 9 plan: `docs/plans/phase-08/task-09-space-metadata-contract-closure.md`
- Task 9 design: `docs/specs/2026-08-21-phase-08-task-09-space-metadata-contract-closure-design.md`
- canonical Task 8 plan: `docs/plans/phase-08/task-08-final-regression-closure.md`
- Task 8 design: `docs/specs/2026-08-21-phase-08-task-08-final-regression-closure-design.md`
- Task 8 review: `docs/reviews/phase-08-task-08-final-regression-closure.md`
- canonical Task 7 plan: `docs/plans/phase-08/task-07-event-addition-operator-docs.md`
- Task 7 design: `docs/specs/2026-08-21-phase-08-task-07-event-addition-operator-docs-design.md`
- canonical Task 5 plan: `docs/plans/phase-08/task-05-targeted-application-refactor.md`
- Task 5 design: `docs/specs/2026-08-20-phase-08-task-05-targeted-application-refactor-design.md`
- Phase 7.6 / Phase 8 Task 0 verification report: `docs/reviews/phase-08-task-00-baseline-verification.md`
- Phase 7.6およびPhase 8 Task 0は2026-08-20のmanual/live acceptanceをもって完了。

## Phase 8 Task 8 verification / handoff

- `TASK_START_SHA`: `3e6fd975fe5abb10e289a7d568dbaa608a5f2925`。Task 7 planning/finalと実装3 commitのancestorおよびTask 7 actual diffを確認し、protected-path diffはempty。Task 7 review verdictはACCEPTABLE、追加material defectなし。
- management scroll flakeはclick-time captureへtest-only修正。pre-fixは`20 passed / 0 failed / retries 0`、post-fix focusedは`1 passed`、stressは`50 passed / 0 failed / retries 0`、whole management specは`18 passed / 0 failed / retries 0`。
- Task 8 focused Vitestは`7 files / 116 tests passed`、onboarding + management focused E2Eは`20 passed / 0 failed / retries 0`。
- `npm run verify`: PASS（webapp 146 files / 906 tests、Route Guidance 6 / 40、Phase 05D 2 / 4、architecture 191 files、26 byte-identical map assets across 2 public bundles、GAS 2 / 38、catalog extension 24）。
- strict full E2E `--retries=0`: `82 total / 74 passed / 0 failed / 8 skipped`。canonical `npm run test:e2e:ci`: 同じ`82 / 74 / 0 / 8`、retry/flaky 0。architecture、public-tree audit、`git diff --check`はPASS。protected pathsはempty。
- production registryは`[C108]`、C109 bundleなし。Task 5 assembly、Task 6 first-use/onboarding、Task 7 other-v1 verifier/guide evidenceをreviewへ記録した。

## Phase 8 Task 9 verification / handoff

- meirochou branch: `docs/phase-08-task-09-space-metadata-contract-closure-plan`。Task start SHA: `13f091617caa5df5eb8f302110c5695a3ccc9468`。U+FEFF修正後verification時点HEAD: `40ccd7e`。
- wrapper branch: `feature/phase-08-task-09-space-metadata-contract-closure`。Task start SHA: `aa864f1ba80b87b63760248edc60b39a85d18d58`。U+FEFF修正後verification時点HEAD: `2c57f10`。
- browser review blocker対応: Pythonの`prefix.isspace()`とECMAScript `\s`の差を埋めるため、wrapperのruntime prefix validationへU+FEFFの明示拒否を追加。meirochou production predicateは既に拒否していたため、space predicate/strict boundary testsへU+FEFFを追加し、wrapperでは`build_event_bundle()`のfinal/tmp無出力も検証した。
- focused RED/GREEN: meirochou predicate/strict boundary追加後のGREENは4 files / 36 tests passed。wrapper blocker REDは24 tests中2 failures、修正後GREENは`test_event_build` 24 tests passed。
- `npm run verify`: exit 0。webapp 146 files / 911 tests、Route Guidance 6 files / 40 tests、Phase 05D 2 files / 4 tests、architecture 191 files、26 byte-identical map assets across 2 public bundles、GAS 2 files / 38 tests、catalog extension 24 tests。
- `npm run test:e2e:ci`: exit 0。82 total / 74 passed / 0 failed / 8 skipped、retry/flaky 0。Task 9由来のbrowser interaction変更なし。
- `node scripts/audit-public-tree.mjs`: PASS。`npm run check:webapp:architecture`: PASS（191 files）。`git diff --check`: PASS。
- meirochou scope gate: Task 9実装時点の変更は`apps/webapp/js/shared/domain/space-parser.ts`、`apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`、`tests/space-parser.test.ts`、`tests/boundary-parsers.test.ts`、`guides/event-addition.md`の5 files。protected-path gateはempty。C108 `apps/webapp/events/manifest.json` / `apps/webapp/map-bundles/C108` diff gateもempty。
- wrapper focused `test_event_build`: 24 tests passed。`test_cli`: 4 tests passed。full unittest discover: 52 tests passed。Ruff: `All checks passed!`。Pyright: `0 errors, 0 warnings, 0 informations`。wrapper scope gateは`python/pathdata/comiket_pathdata/event_build.py`、`python/pathdata/tests/test_event_build.py`、`python/pathdata/README.md`の3 files、protected-path gateはempty。
- Task 9 implementation commits: meirochou `502b7d3` (`refactor`), `627758b` (`style`), `0f8f322` (`fix`), `9f97c5b` (`test`), `831a677` (`docs`), `40ccd7e` (`test`); wrapper `d32d65b` (`fix`), `35ffd25` (`docs`), `2c57f10` (`fix`)。progress record commit後のmeirochou HEADはこの記録を反映する。
- このTaskはruntime lookup、route-guidance、routing、nearby/gallery、C108 source dataを変更していない。browser reviewでU+FEFF parity修正を再確認し、Task 9をACCEPTEDと判定した。

## Phase 8 browser acceptance / closure

- 2026-08-22、Task 1〜9のPhase 8全体browser reviewを完了。最終blockerだったwrapper / webapp間のU+FEFF prefix parityを修正後に再確認し、危険方向（wrapper accept → webapp reject）のBMP prefix差が残っていないことを確認した。
- `tiga-kk/meirochou_wrapper`はPR #1でTask 9を`main`へmerge。merge commit: `9c31e8ecd35c2705304d7dc910c2748d0e642549`。
- `tiga-kk/meirochou`はPR #11でTask 9を`main`へmerge。merge commit: `1552d6915d87c2aacb49cfa79a158facfa39de3e`。
- merge後の両repositoryでTask 9 branchはmainよりmerge commit 1件分だけbehind、file diffはempty。Task 9の全変更がmainへ統合されたことを確認した。
- Phase 8を**CLOSED / ACCEPTED**とする。Task 5〜8節に残る`browser review pending`等の文言は各Task実装時点のhistorical handoffであり、このclosure記録が現在状態として優先する。
- 実GASの2件は引き続き独立した`OPEN_EXTERNAL_DEBT`であり、Phase 8 closureを妨げない。

## Phase 8 Task 5 verification / handoff

- Task 5.0 focused baseline: 6 files / 54 tests passed、architecture 189 files、`git diff --check` PASS。
- Task 5.1: initial REDはbinder module resolution failure、focused GREENは3 files / 12 tests passed。
- Task 5.2: initial REDはprojection module resolution failure、focused GREENは4 files / 40 tests passed。
- Task 5.3: `tests/application-assembly.test.ts`はpre/postとも1 file / 6 tests、Route Guidanceはpre/postとも6 files / 40 tests passed。
- Task 5 full focused suite: 9 files / 61 tests passed。
- `npm run verify`: PASS。webapp 145 files / 901 tests、Route Guidance 6 files / 40 tests、Phase 05D 2 files / 4 tests、architecture 191 files、build 26 byte-identical map assets、GAS 2 files / 38 tests、catalog extension 24 tests passed。
- `npm run test:e2e:ci`: PASS。80 tests中72 passed / 8 skipped、retryなし。
- `npm run check:webapp:architecture`、`node scripts/audit-public-tree.mjs`、`git diff --check`: PASS。
- created production modules: `apps/webapp/js/app/bind-management-action-events.ts`, `apps/webapp/js/app/browser-management-projection.ts`。
- protected-path diff: empty。
- Browser review pending。Task 5はimplementation completeとして記録し、browser acceptance前に完了扱いにしない。

Task開始時の基準commitは、実装開始直前の対象branch最新remote HEADから取得する。文書中の計画開始SHAを実装開始点として固定しない。

## Phase 8 Task 6 verification / handoff

- Task 6.0 focused baseline: 3 files / 22 tests passed、architecture 191 files、`git diff --check` PASS。指定manual-guide E2Eの`--project=chromium`はPlaywright設定上対象外のため`No tests found`（exit 1）。実対象のmobile-chromiumでの確認はTask 6.3で行い、環境の一時的な`ERR_INSUFFICIENT_RESOURCES`を確認した後、再実行でPASS。
- Task 6.1 initial RED: `readFirstUseGuideSeen is not a function` / `markFirstUseGuideSeen is not a function`、3 tests failed。focused GREENは2 files / 6 tests passed。
- Task 6.2 copy RED: first-use sequence assertion 1 failed / 2 tests。focused GREENは3 files / 22 tests passed。`npm run check:webapp` PASS。
- Task 6.3 onboarding E2E: 2 passed / 0 failed / retryなし。existing manual-guide E2E: 1 passed / 0 failed / retryなし。対象projectはmobile-chromium。指定`--project=chromium`は`No tests found`。
- Task 6 full focused unit: 4 files / 25 tests passed。
- `npm run verify`: PASS。webapp 146 files / 904 tests、Route Guidance 6 files / 40 tests、Phase 05D 2 files / 4 tests、architecture 191 files、build 26 byte-identical map assets、GAS 2 files / 38 tests、catalog extension 24 tests passed。
- `npm run test:e2e:ci`: PASS。82 tests中74 passed / 8 skipped、retryなし。
- `node scripts/audit-public-tree.mjs`、`npm run check:webapp:architecture`、`git diff --check`: PASS。protected-path diff: empty。
- Task 6はimplementation completeとして記録し、browser review pending。Task 7 event-addition/operator docsはTask 6 browser acceptanceまで開始禁止。

## Phase 8 Task 7 verification / handoff

- Task 7.0 baseline: focused 5 files / 105 tests passed、architecture 191 files、`git diff --check` PASS。Task 6のfirst-use marker、read/write adapter caller、onboarding E2E specは継承を確認した。Playwrightは`chromium`が4 spec限定で、一般webapp specは`mobile-chromium`のため、Task 6 historical focused commandの不一致をTask 7 guideへ伝播していない。開始時production registryは`[C108]`、C109 bundleなし。
- Task 7.1: synthetic `other-v1` source/output bundleとmanifestをfixture内に追加し、旧verifierは`Phase 5B event registry must contain only C108`でRED。GREENはdeployment-build 1 file / 12 tests、event-registry 1 file / 14 tests。`result.eventIds`は`["C108", "other-v1", "public-v1"]`、`verifiedFiles`は39。C108 17-file/built-asset checks、missing/escape/symlink/credential、source/build byte-identical checksは維持。
- Task 7.2: guide contract REDは`guides/event-addition.md`のENOENT。GREENはwebapp contracts/deployment/event-registry 3 files / 100 tests。wrapper `build-event`、staging review、safe copy、manual registry merge、data-only diff、unregistered bundle warning、regenerate-not-patch、`npm run verify`、`npm run test:e2e:ci`、manual smoke、Cloudflare Pages rollbackを記録。
- Task 7 production behavior required no Task 6 repair. Historical Task 6 focused Playwright plan used a project name that did not select `webapp.spec`; Task 7 operator guidance uses canonical `npm run test:e2e:ci` and does not propagate that command。
- Task 7 full focused suite: 5 files / 107 tests passed。`npm run verify`: exit 0、webapp 146 files / 906 tests、Route Guidance 6 files / 40 tests、Phase 05D 2 files / 4 tests、architecture 191 files、build 26 byte-identical map assets、GAS 2 files / 38 tests、catalog extension 24 tests。
- `npm run test:e2e:ci`: exit 0、82 total、73 passed、0 failed、8 skipped、1 retry/flaky。flakyは`tests/e2e/management.spec.ts:174`の初回scroll assertion（Expected 160 / Received 166）がretryで成功したもの。指定testの単独再実行は1 passed。trace/screenshotはCI test-resultsへ生成された。
- `npm run check:webapp:architecture` PASS（191 files）、`node scripts/audit-public-tree.mjs` PASS、`git diff --check` PASS、protected-path diff empty。Task 7はimplementation completeとして記録し、browser review pending。Phase 8 final browser review / closureが未完了である。

## 直前Phase

Phase 7.4 Task 27はMotorola Android実機確認とGitHub Actions greenまで完了した。Phase 7.4のmotion設定、5個cue、nearby ranking/filter/origin、catalog detail layer、Undo等は完了履歴として保持し、Phase 7.5で作り直さない。

## Phase 7.5で解決すること

### Map-first UI

- route/nearby両方の地図を大きくする。
- `overflow: hidden`は維持し、viewport面積とstage初期scaleを改善する。
- route detailとnearby filter controlsを通常時にcompact化する。
- map関連buttonのpressed/selected/disabled/busy/focusを整理する。

### 周辺お品書き

- cardは地図へ重ねず周囲へ配置する。
- 5/10件は全件同時表示。
- 15件は1〜10 / 11〜15。
- 20件は1〜10 / 11〜20。
- card画像は自然aspect ratioを維持する。

### ALNS live preview

現行workerにはprogress messageがあるが、progressが正式bestOrderへ直接反映される。またfresh startではALNS/distance matrix workerのproduction wiringがない。

Phase 7.5では既存worker群を接続し、progressをephemeral preview、completeを正式commitへ分離する。探索中は青〜紫の巡回順previewを250ms以上の間隔で更新し、complete後は既存赤current exact routeへ戻る。

## Task一覧

| Task | 内容 | 状態 | 依存 |
|---|---|---|---|
| 1 | 共通map-first stage geometryを確立 | **完了（ee6bf27）** | Phase 7.4 |
| 2 | 経路画面をmap-first surfaceへ再構成 | **完了（c70cf32）** | Task 1 |
| 3 | 独立地図の補助controlsをcompact drawer化 | **完了（f637fbf）** | Task 1 |
| 4 | 周辺cardをperimeter配置し10件単位paginationを追加 | **完了（a2016c3）** | Task 3 |
| 5 | map関連UIのinteraction polish | **完了（d671a23）** | Task 2〜4 |
| 6 | fresh start ALNSとpreview-only progress contractをproduction接続 | **完了（d0c0e69）** | Task 1 |
| 7 | ALNS best orderを地図上でlive preview | **完了（a0092b5）** | Task 6、Task 2 |
| 8 | 統合回帰・実機/人間受入 | **完了（自動検証の既存差分を記録、人間受入確認済み）** | Task 1〜7 |

## 既存の外部確認残件

- 実GASで同一space再送が既存行更新になる明示証拠。
- GAS更新時に対象外の既存Sheet列が保持される明示証拠。

これらはPhase 7.6 / Phase 8 Task 0の完了を妨げない独立した`OPEN_EXTERNAL_DEBT`として保持し、Phase 8 Task 1以降を止めない。

## Phase 7.6実装履歴

Phase 7.6 Task 1〜9のproduction実装は、`origin/main` に次の履歴として存在する。

| Task | 内容 | 実装履歴 |
|---|---|---|
| 1 | X投稿proxy契約とYahoo raw parser | `8f4edd8` |
| 2 | event dateとX account contract | `5f83d0f` |
| 3 | XPost clientとbounded cache | `6cbdba9` |
| 4 | 投稿panel接続 | `a0ed6cc` |
| 5 | event-day sale mention monitor | `f200271` |
| 6 | sale warning接続 | `13ff131` |
| 7 | `W_*`壁分類とoptimization接続 | `b1491c8` |
| 8 | gallery位置順・wall anchor・badge | `dc52cbb` |
| 9 | lifecycle・削除・回帰接続 | `cdaf701`, `2535a30` |

### Phase 8 Task 0 baseline / closure status

- 初回`npm run verify`: PASS（142 files / 889 testsほか全gate成功）。
- 初回`npm run test:e2e:ci`: 80 tests中71 passed / 1 failed / 8 skipped。management scroll assertionは`STALE_TEST_EXPECTATION`として`1f57160`でテスト計測を安定化した。
- focused closure regression: lifecycle 46 tests、wall/optimization/gallery 23 tests、management focused E2E 1 testがPASS。
- final `npm run verify`: PASS（142 files / 889 testsほか全gate）。
- final `npm run test:e2e:ci`: PASS（CI container、80 tests中72 passed / 8 skipped）。
- final `node scripts/audit-public-tree.mjs` / `git diff --check`: PASS。
- 2026-08-20、Cloudflare/X live、実機mobile、gesture、200% text zoom、offline cache、gallery interactionをユーザーが確認し、5項目すべて問題なしとしてmanual/live acceptance完了。
- GAS 2件のみ独立した`OPEN_EXTERNAL_DEBT`として継続。
