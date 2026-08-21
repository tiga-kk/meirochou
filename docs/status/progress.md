# 実装進捗

更新日: 2026-08-21

この文書を、現在フェーズ、現在Task、次に着手するTask、未完了の外部確認の唯一の正本とする。

## 現在状態

- 現在フェーズ: **Phase 8: event map / bundle汎用化**
- Phase 8 Task 1: meirochou generic event map contract — complete.
- Phase 8 Task 2: meirochou_wrapper reproducible map.svg generation — complete.
- Phase 8 Task 3: meirochou_wrapper reviewed event build pipeline — complete.
- 現在Task: **Phase 8 Task 9 space metadata contract closure — implementation complete / browser review pending**
- 次に着手するTask: **Phase 8 browser acceptance / final closure decision**
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
- このTaskはruntime lookup、route-guidance、routing、nearby/gallery、C108 source dataを変更していない。Phase 8はbrowser review pendingであり、CLOSED/ACCEPTEDとは記録しない。

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
- Task 7 production behavior required no Task 6 repair. Historical Task 6 focused Playwright plan used a project name that did not select `webapp.spec`; Task 7 operator guidance uses canonical `npm run test:e2e:ci` and does not propagate that command.
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

## Phase 8 Task 1で解決すること

- strict production event map manifestのarea数をC108の4固定から1件以上へgeneric化する。
- `prefixes` / `labels`をC108 TypeScript constantから各area manifestへ移す。
- registry entryへoptional `mapBundleContract: "event" | "legacy"`を導入し、未指定をstrict production contract、legacyをdemo fixture専用として扱う。
- production loaderから`eventId === "C108"`等のevent固有contract分岐を除去する。
- C999等のnon-C108 strict fixtureでruntime manifest変換を証明する。
- demo-v1 bundle自体は変更しない。

## Phase 8 Task 1でやらないこと

- wrapper側のmanifest/map.svg生成。
- C109 production event追加。
- bundle全体のcross-file integrity command。
- application大規模refactor。
- 初回onboarding。
- route/ALNS/grid/points/wall semantics変更。

## Phase 8 Task 1完了記録

- 実装commit: `e02d676`, `3dd15e5`, `9b50715`。browser review対応commit: `7f3ffd4`。
- Finding 1: domain `EventRegistryEntry`へ`mapBundleContract?: "event" | "legacy"`を追加し、transitionの`loadManifest` callbackへlegacy値が保持されるtestを追加。
- Finding 2: production registryから取得した`c108Event`をruntime loaderへ直接渡し、`mapBundleContract`未指定をassert。production C108 registryは未変更。
- E2E blockerは`TASK1_REGRESSION`。baseline 3回は各`18 passed / 0 failed`、headはFlow 2/3/7/9が再現。原因はmanagement specの5つのcustom legacy registry fixtureにdiscriminatorがなかったこと。`tests/e2e/management.spec.ts`へ`mapBundleContract: "legacy"`を追加。
- focused Vitest: 6 files / 72 tests passed。
- focused management E2E: 18 passed / 0 failed / exit 0。
- `npm run check:webapp`: PASS。`npm run typecheck:functions`: PASS。`npm run build:webapp`: PASS。`node scripts/audit-public-tree.mjs`: PASS。`git diff --check`: PASS。
- `npm run verify`: standalone clean checkoutでPASS（Vitest 142 files / 896 tests、route 40、Phase 5D 4、GAS 38、catalog 24）。linked worktreeでは`.git`ファイルの`/tmp`絶対パスを検出する既知環境差が1件発生したため、completion gateはstandalone結果で確認。
- 通常`npm run test:e2e:ci`: exit 0（80 tests、71 passed / 1 flaky / 8 skipped）。flakyはALNS preview testの初回失敗・retry成功のみ。
- baseline `76fa5ae`のfull `npm run test:e2e:ci`: exit 0（72 passed / 8 skipped）。未修正head `9b50715`のfull E2E: exit 1（67 passed / 5 failed / 8 skipped、Flow 2/3/7/9と既存ALNS preview test）。
- hardcode scan: 指定4パターンは0件。
## 進行規則

- 一度に一Taskだけ実装・review・commitする。
- 各Taskは意味のあるfocused REDから開始する。
- visual snapshotは人間visual確認前に一括更新しない。
- Phase 8 Task 1では各code commitを関連focused tests GREENの状態で残し、一時的broken commitを作らない。
- Task 5以降を先取りしない。

## Phase 8 Task 4 verification / handoff

- focused Task 4: 1 file / 1 test passed、exit code 0。
- adjacent contract regression: 4 files / 42 tests passed、exit code 0。
- `npm run verify`: exit code 0。webapp 143 files / 897 tests、route-guidance 6 files / 40 tests、Phase 05D 2 files / 4 tests、architecture 189 files、GAS 2 files / 38 tests、catalog-extension 24 tests passed。build verificationは2 public bundlesの26 byte-identical map assetsを確認。
- fixture: C999、strict area `east` 1件、internal `map_id` `fixture-map`、`grid.bin` 24 bytes（全byte 1）、`points.json.image.path`なし。
- production registryはC108-only、public C999 bundleなし、application TypeScript / Vite / package / workflow / integrationsはno-diff gate passed。
- Task 4はCLOSED。browser acceptanceは人間チェック完了。Task 5は未着手。

## Phase 7.5 Task 1完了記録

- route/nearby共通の`calculateMapStageLayout()`を追加し、aspect ratio維持、contain、短辺占有率0.8のbounded-cover、中心配置を統一。
- nearbyの既存adapterとrouteのstage計算を共通helperへ寄せ、routeのviewport高さ決定と`overflow: hidden`は変更していない。
- focused verification: map stage / nearby workspace / route contract tests 5 files / 15 tests passed、`npm run check:webapp` passed、`git diff --check` passed。

## Phase 7.5 Task 2完了記録

- route画面を`summary -> map -> action bar -> detail`のmap-first構成へ変更し、購入済/保留を詳細外へ移動。
- 詳細は`aria-expanded`付きのcollapsed panelとし、候補選択時だけ自動展開。開閉処理はmap transformを変更しない。
- navigation mapの高さ上限を除去し、CSSの実測`clientWidth/clientHeight`を共通`calculateMapStageLayout()`へ渡す構成へ変更。
- focused verification: route map first Vitest 2 tests、関連route Vitest 14 tests、390/644/1024px Playwright geometry test passed、`npm run check:webapp` passed、`npm run build:webapp` passed、`git diff --check` passed。
- 既存visual snapshotは人間確認前のため更新していない。旧baselineとの差分はTask 8の人間visual確認後に扱う。

## Phase 7.5 Task 3完了記録

- 独立地図のarea/origin/filter controlsを`条件`drawerへまとめ、open直後はcollapsedにした。
- area・priority・件数・保留の状態からcompact summaryを生成し、drawerの開閉や再openでfilter stateをリセットしない。
- drawerの開閉後に`applyViewportLayout()`を呼び、collapsed時のworkspace高を再取得する。
- focused verification: nearby Vitest 4 files / 13 tests passed、nearby mobile E2E（drawer、workspace geometry、filter、origin）passed、`npm run check:webapp` passed、`npm run build:webapp` passed、`git diff --check` passed。

## Phase 7.5 Task 4完了記録

- `paginateNearbyCatalog()`を追加し、5/10件は全件、15/20件は1〜10 / 11〜末尾へ分割するページ制御を追加。
- `buildNearbyPerimeterLayout()`でnarrow/mediumは上下、wideは四辺へcard slotを配置し、mapRectとcardの非重複を維持。
- page/filter/area/origin変更時はpageを先頭へ戻し、pan/zoomではcard DOMを再生成せずleader geometryだけを更新する既存経路を維持。
- selected cardの操作はcard内から`nearby-selection-toolbar`へ分離し、画像の自然aspect ratioを維持。
- focused verification: Task 4 Vitest 5 files / 19 tests passed、mobile nearby E2E 3 tests passed、desktop workspace E2E 2 tests passed、`npm run check:webapp` passed、`npm run build:webapp` passed、`git diff --check` passed。

## Phase 7.5 Task 5完了記録

- map関連button/controlに44px操作領域、hover/active/focus-visible、selected/disabled/busyの視覚状態、reduced-motion時のtransition停止を追加。
- 購入・保留とnearbyの目的地設定をpending中disabled/`aria-busy`にし、カードのdrag/pointerupを選択clickへ変換しないようにした。
- route詳細のEscapeで詳細だけを閉じ、詳細toggleへfocusを戻す。nearbyの既存close focus復帰も維持。
- focused verification: Task 5 Vitest 3 files / 15 tests passed、対象nearby/map-first E2E 2 tests passed、keyboard E2E 2 projects passed、`npm run check:webapp` passed、`git diff --check` passed。
- 指定E2E全体は26 passed / 8 failed。失敗はTask 2 map-first変更に伴う既存visual snapshot差分と旧来の詳細表示前提で、snapshotは人間visual確認前のため更新していない。

## Phase 7.5 Task 6完了記録

- `PrepareRouteOptimizationUseCase`を追加し、fresh startで`searchNext()`から渡された同一`pendingCircles`だけをmatrix endpointsとALNS inputへ接続した。候補の再取得やpriority/holdの再解釈は行わない。
- composition rootで既存`DistanceMatrixController`をLocalStorage repositoryとdistance-matrix workerへ接続し、cache hit時はworker再計算を避ける。matrix準備失敗時は表示中のcurrent exact routeを維持する。
- `RouteOptimizationPreview`/callbacksを追加し、ALNS progressはpreview callbackのみ、completeだけがNavigationStateとsnapshotへcommitする。stale/cancelled jobは世代無効化でUI/stateを更新しない。
- worker progressは初回即時、改善通知は250ms以上でcoalesceし、completeは即時通知する。
- focused verification: Task 6 Vitest 6 files / 38 tests passed、`npm run check:webapp` passed、`npm run build:webapp` passed、`git diff --check` passed。

## Phase 7.5 Task 7完了記録

- ALNS progressをephemeralな青〜紫の`optimization-preview-overlay`とcompact statusへ接続し、同一overlayのpolylineだけを更新する構成を追加した。正式な赤current routeは維持し、complete時だけpreviewを消して正式best orderへ戻す。
- previewの地図点は既存points JSONと`parseSpace`を再利用して解決し、drag/pinch中はDOM更新を保留して操作終了時に最新previewへ追従する。manual destination、購入/保留、reset、cancel/errorでもpreviewをclearする。
- focused verification: preview model / route map contract / runtime controllerの3 files・12 tests passed、新規ALNS preview mobile E2E passed、`npm run check:webapp` passed、`npm run build:webapp` passed、`git diff --check` passed。
- 指定mobile E2E全体は35件中27 passed / 8 failed。8件はTask 5時点から継続しているmap-first visual baselineまたはcatalog表示前提の既存失敗で、新規preview E2Eの失敗ではない。visual snapshotは人間確認前のため更新していない。

## Phase 7.5 Task 8完了記録

- focused verificationは指定10 files / 38 testsがpassed、`node scripts/audit-public-tree.mjs`と`git diff --check`もpassedした。
- `npm run verify`は836 passed / 2 failedで終了した。失敗は`tests/route-map-candidate-preview.test.ts`のEscape経路と、worktreeの`.git`ファイルに含まれるローカル絶対パスを検出する`tests/public-boundary.test.mjs`。後者は直接実行したpublic tree auditではpassedした。
- `npm run test:e2e:ci`は終了コード1、62 passed / 9 failed / 8 skipped（managementの1件はretry成功）。失敗には既存visual baseline差分に加え、`navigation-resume`の期待snapshot世代、candidate Escape、catalog表示前提が含まれる。Task 8の計画に従い、このTask内で場当たり的な修正やsnapshot更新は行わない。
- 390px級Motorola Androidでのheaded実機操作、ALNS preview中のdrag/pinch、visual snapshotを含む人間受入はユーザー確認済みとして受入した。
- `npm run verify` / `npm run test:e2e:ci`の既知FAILは`docs/reviews/phase-07-5-field-verification.md`へ記録済みの既存差分として扱い、Phase 7.5の完了を阻害しないものとした。
- Phase 7.5は完了。Phase 7.6もTask 1〜9実装、Task 0 final automated verification、2026-08-20 manual/live acceptanceを経て完了。現在はPhase 8 Task 4のbrowser review pending。
