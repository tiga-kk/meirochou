# Phase 5B Task 5: Browser Smoke Test and Dijkstra Benchmark

**Status:** Completed
**Depends on:** Phase 5B Task 4
**Commit candidate:** `test(maps): verify c108 routing performance`

## Goal

C108の4地図を実ブラウザで読み込み、SVG、marker、grid、経路overlayの座標一致を確認する。既存weighted Dijkstraを実データで測定し、Phase 5Cの距離行列実装に必要な性能値を記録する。

## User-visible result

C108を選択すると4地図が正しく表示され、既存の単一区間経路が地図上に重なる。性能記録は開発文書に残る。距離行列、Worker、TOPTWはまだ実装しない。

## Required reads

- Task 1 inventory
- Task 3 validation result
- 既存route planner
- 既存map renderer
- 既存overlay SVG生成
- Playwright config
- package scripts
- 実行可能なdesktop browser
- mobile Chromium emulation設定

## Files allowed to change

- `tests/c108-map-browser-smoke.spec.ts`
- `scripts/benchmark-c108-routing.mjs`または既存benchmark script
- benchmark helperのTypeScript/JavaScript
- `package.json`のscript追加
- `docs/reviews/phase-05b-c108-benchmark.md`
- 必要な最小限のbug fixと対応test
- Task実績欄
- `docs/status/progress.md`

## Files forbidden to change

- Dijkstraの意味
- crowded multiplier
- grid values
- map assetの見た目を性能対策として変更すること
- Worker
- matrix repository
- TOPTW
- state schema
- UI redesign

## Browser smoke cases

4 areaすべてについて次を確認する。

1. map SVGが表示される。
2. SVG viewBoxが正である。
3. pointsの既知markerがSVG範囲内に表示される。
4. marker中心とpoints座標の差が許容範囲内である。
5. 2つの到達可能circleを選び、route overlayが表示される。
6. route polylineの全点がSVG範囲内である。
7. route始点と終点が選択circle endpointに一致する。
8. blocked cellを通過しない。
9. console errorとpage errorがない。
10. unexpected external network requestがない。

実地図のスクリーンショットをGitへ追加しない。
Playwright traceやreportをcommitしない。

## Benchmark contract

各areaについて記録する。

```text
areaId
grid width
grid height
walkable cell count
circle endpoint count N
warmup runs
measured runs
median one-source Dijkstra time
p95 one-source Dijkstra time
estimated N-source matrix time
matrix distance count N*N
Float64 memory estimate
JSON/LocalStorage string estimate
unreachable endpoint count
desktop environment
mobile-equivalent environment
```

計測規則:

- warmupを最低3回実行する。
- measured runを最低10回実行する。
- `performance.now()`を使う。
- console logだけで終わらずMarkdownへ保存する。
- same input、same algorithm、same weightを使う。
- benchmark中にroute geometryを全pair保存しない。
- optimizationは実行しない。
- 測定結果を速く見せるためにgridを縮小しない。

## Procedure

- [x] **Step 1: fictional smoke testを先に追加する**

既存fixtureでmarkerとroute overlayの座標契約をtestし、実地図testが手動確認だけにならないようにする。

- [x] **Step 2: C108 browser smoke testを書く**

実地図testは明示的な環境変数またはtest projectでのみ実行できるようにし、通常CIで著作物のvisual snapshotを生成しない。

例:

```text
RUN_C108_SMOKE=1 npm run test:e2e -- tests/c108-map-browser-smoke.spec.ts
```

skip時は成功偽装ではなく、C108 smokeが未実行であることをreportする。

- [x] **Step 3: route smokeを実行する**

```bash
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts --project=chromium
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts --project=mobile-chromium
```

4 areaすべてを確認する。

- [x] **Step 4: benchmark scriptを書く**

Task 3で検証済みのpoints/gridを読み込み、既存Dijkstra kernelを直接呼ぶ。
kernelをimportできない場合、benchmarkのためにアルゴリズムを複製せず、既存moduleからpure functionをexportする最小refactorをtest付きで行う。

- [x] **Step 5: benchmarkを実行する**

```bash
npm run benchmark:c108-routing
```

desktop結果を取得する。
mobile-equivalent結果はPlaywright browser context内または実Android browser devtoolsで同一処理を実行する。
環境差を明記する。

- [x] **Step 6: benchmark文書を作る**

`docs/reviews/phase-05b-c108-benchmark.md`へ4 areaの表と次を記録する。

- 最遅area
- N-source推定時間
- matrixの最大保存量
- UI main threadで同期実行してはいけない根拠
- Phase 5Cでprogressを出す単位
- Phase 5Cで初回開始を明示操作に限定すること
- 数値から判明した実装上の制限

確認dialogの時間閾値や新しい仕様をここで決めない。

- [x] **Step 7: regressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npm run test:e2e
git diff --check
```

## Acceptance criteria

- 4 areaすべてで実ブラウザsmokeを実行している。
- marker、route始点・終点、overlay範囲が一致する。
- blocked cellを通る経路がない。
- external network requestがない。
- benchmarkに必要な全項目が記録されている。
- desktopとmobile相当の環境情報がある。
- matrix、Worker、TOPTWを実装していない。
- 実地図screenshotやtraceをcommitしていない。

## Review checklist

- benchmarkが既存Dijkstraと同じkernelを使うか。
- 1回だけの計測ではないか。
- 最速値ではなくmedian/p95を記録しているか。
- N-source推定がNを掛けた値であるか。
- route geometry保存量をmatrix保存量へ混ぜていないか。
- mobile-equivalentの意味を誇張していないか。
- C108 smokeが4 areaすべてを通っているか。

## Completion record

```text
Browser smoke environments: Playwright Chromium (Desktop) & Mobile Chromium (Pixel 5)
Areas tested: e456, e7, s12, w12 (4 areas)
Route smoke result: 8/8 tests passed in Playwright (both projects)
E2E regression: 25 passed, 6 existing visual snapshot mismatches, 8 C108 smoke tests skipped without RUN_C108_SMOKE=1; snapshots were not updated
Benchmark command: npm run benchmark:c108-routing
Benchmark document: docs/reviews/phase-05b-c108-benchmark.md
Slowest desktop median/p95: w12 (51.05 ms / 66.88 ms 1-source)
Slowest mobile-equivalent p95: w12 (71.48 ms 1-source)
Largest estimated matrix time: w12 desktop (76.58 s median, 100.32 s p95); e456 mobile-equivalent p95 (163.66 s)
Largest storage estimate: e456 (43.84 MB Float64, 26.89 MB JSON estimate)
Known limitations: Full distance matrix exceeds LocalStorage limits (~5-10MB). Worker + IndexedDB or on-demand matrix generation is required in Phase 5C.
Proposed commit message: test(maps): verify c108 routing performance
```
