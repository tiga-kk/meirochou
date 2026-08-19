# Phase 8 Task 0 baseline verification

## Environment

- 実行日: 2026-08-19 (UTC)
- repository: `tiga-kk/meirochou`
- 実装開始時の `origin/main` SHA: `2535a30d0b0b0cb99317982e1b25ccd49f0393c2`
- 実装開始時の `origin/main`: `2535a30 fix(phase-07-6): harden x-post lifecycle state transitions`
- baseline実行HEAD: `f3c7fafb32a3081d48c3294b81ae5815c148534b`
- Node.js: `v22.14.0`
- npm: `10.9.2`
- `npm ci`: PASS (exit 0; 69 packages added; npm auditは1 moderate / 1 high vulnerabilityを報告)
- working tree: 既存の未追跡ファイル `docs/reviews/phase-07-4-android-route-animation-diagnosis.md` あり。今回変更せず保持。

## Initial automated verification

| Command | Result | Failure classification | Action |
|---|---|---|---|
| `npm run verify` | PASS (exit 0; Vitest 142 files / 889 tests、route 6 files / 40 tests、Phase 5D 2 files / 4 tests、GAS 2 files / 38 tests、catalog 24 tests。architecture/typecheck/buildもPASS) | — | 変更なし |
| `npm run test:e2e:ci` | FAIL (exit 1; 80 tests: 71 passed / 1 failed / 8 skipped。managementの対象testはretry #1/#2も同じFAIL) | `STALE_TEST_EXPECTATION` | focused reproductionとroot cause確認後、テストの計測タイミングだけを修正 |
| `node scripts/audit-public-tree.mjs` | PASS (exit 0) | — | 変更なし |
| `git diff --check` | PASS (exit 0) | — | 変更なし |

## Focused diagnosis

### `tests/e2e/management.spec.ts:174` scroll restoration

- failing test: `管理surfaceが背景scrollを固定し、viewport全体を遮蔽する`
- reproduction command: `npx playwright test tests/e2e/management.spec.ts --project=mobile-chromium --grep '背景scrollを固定'`
- actual behavior: 初期評価直後の`window.scrollY`は160だが、Pixel 5 contextの次frameで166へ安定する。open時の`ComipathSettings.lockPageScroll()`はその時点の166を`body.style.top = "-166px"`として保存し、close時もscrollY=166へ復元する。CI containerのfull E2EでもExpected 160 / Received 166として再現した。
- expected product contract: management surfaceを開いた時点のscroll位置を保存し、閉じた時に同じ位置へ復元する。既存`tests/settings-component.test.ts`も保存したscroll位置の復元を固定している。
- root cause: E2Eが`document.body.style.minHeight`と`window.scrollTo(0, 160)`の直後に`before=160`を取得し、ブラウザの次frameのレイアウト安定化によるscroll anchoring後の実際のopen前位置を待っていない。production codeの保存・復元処理の不具合ではない。
- owner file: `tests/e2e/management.spec.ts`。このfailureの期待値を作っているテスト側の計測タイミングが責務ownerであり、productionのscroll lock実装はlock時の現在値を正しく扱っている。
- classification: `STALE_TEST_EXPECTATION`。単一E2E assertionを満たすためproductionのscroll semanticsを変更せず、安定後の位置をbaselineとして測る。

Diagnostic evidence:

- Pixel 5 browser context: `393x727`, `deviceScaleFactor=2.75`。set直後は160、次frame以降は166。
- focused browser probe: open中は`body.style.top=-166px`, `scrollY=0`、close後は`scrollY=166`, `visualViewport.pageTop=166`。
- `ComipathSettings.lockPageScroll()` / `unlockPageScroll()`の既存unit contractはPASS。

### Focused closure regression

| Command | Result |
|---|---|
| lifecycle / cleanup cluster (4 Vitest files) | PASS (46 tests) |
| wall / optimization / gallery cluster (6 Vitest files) | PASS (23 tests) |
| focused management E2E after fix | PASS (1 test) |

候補preview、navigation resume、public-boundaryの旧failureは今回のcurrent full baselineで再現しなかったため、旧記録だけを理由に再実行・修正していない。

## Manual / external acceptance

2026-08-20 (JST) にユーザーが実環境で以下を確認し、5項目すべて問題なしと受入した。

1. Cloudflare previewでX accountの最近の投稿本文を表示でき、Pixiv等は`投稿情報なし`となり、X取得失敗時もroute/catalog/purchase操作を継続できる。
2. mobile相当/実機で投稿panel内部scrollが地図pan/pinchやpage scrollと致命的に競合せず、sale warning、map pin、gallery badgeに意味的な破綻がない。
3. 200% text zoomで投稿本文、warning、badge、操作buttonに切れ・重大な重なりがない。
4. cache取得後のoffline状態でcache済み投稿・warningを表示でき、主要機能を継続利用できる。
5. gallery ordering、swipe purchase、priority filter、wall circle位置補正に目立つ破綻がない。

判定:

- `EXTERNAL_ACCEPTANCE_REQUIRED`: **ACCEPTED**。上記1でlive X/Pixiv/failure degradationを確認。
- `MANUAL_VISUAL_ACCEPTANCE_REQUIRED`: **ACCEPTED**。上記2〜5でgesture/visual/200% zoom/offline/galleryを確認。
- `OPEN_EXTERNAL_DEBT`: **OPENのまま**。実GASで同一space再送が既存行更新になる明示証拠、およびGAS更新時に対象外の既存Sheet列が保持される明示証拠はPhase 7.6 X closureと独立した残件として後続Taskを阻害しない。
- snapshotは今回更新していない。

## Final automated verification

| Command | Result |
|---|---|
| `npm run verify` | PASS (exit 0; Vitest 142 files / 889 tests、route 6 files / 40 tests、Phase 5D 2 files / 4 tests、GAS 2 files / 38 tests、catalog 24 tests。architecture/typecheck/buildもPASS) |
| `npm run test:e2e:ci` | PASS (exit 0; CI container、80 tests: 72 passed / 8 skipped / 0 failed) |
| `node scripts/audit-public-tree.mjs` | PASS (exit 0) |
| `git diff --check` | PASS (exit 0) |

- final code SHA before docs commit: `1f57160` (`test(baseline): stabilize management scroll assertion`)
- docs変更後も上記4 gateを再実行し、全自動gateがPASSした。

## Final verdict

自動検証上のfailureは解消した。唯一のcurrent failureだったmanagement scroll assertionは`STALE_TEST_EXPECTATION`であり、production semanticsを変更せずE2Eの計測タイミングを安定化した。

2026-08-20 (JST) のmanual/live acceptanceも完了したため、**Phase 7.6およびPhase 8 Task 0は完了**と判定する。GAS 2件は`OPEN_EXTERNAL_DEBT`として保持するが、Phase 8 Task 1以降のevent map汎用化を阻害しない。
