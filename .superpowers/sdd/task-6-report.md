# Phase 6.1 Task 6 最終検証レポート

## 判定

`DONE_WITH_CONCERNS`

`BLOCKED: physical scale evidence missing (e456, e7, s12, w12)`

Task 5のscale非依存部分は維持して完了。4 areaの実距離根拠がないため、m表示・`metersPerPixel` contract・Phase 6.1完了progress更新は行わない。

## 検証コマンド

- `npm run test:e2e:ci`（初回）: 41 passed / 3 failed / 8 skipped。Flow 10は旧disabled期待、地図2枚は意図したviewport/S/G/flow差分。
- `npm run test:e2e:ci:update -- --grep "デモデータで地図・ピン・経路・ボトムシートを表示する"`: 1 passed。navigation snapshotのみ更新。
- `npm run test:e2e:ci:update -- --grep "ピンの候補経路を比較してから目的地を変更する"`: 1 passed。route comparison snapshotのみ更新。
- `npm run test:e2e:ci`（最終）: exit 0、43 passed / 1 flaky / 8 skipped。flakyは同一地点pin z-orderの初回失敗後retry成功。今回変更の失敗ではない。
- 最終E2Eのflaky詳細: `tests/e2e/webapp.spec.ts` の `同一地点では次目的地ピンを通常ピンより前面に表示する` で、`tests/e2e/webapp.spec.ts:316` の `expect(nextPinIsTopmost).toBe(true)` が初回失敗し、同一testのPlaywright retryで成功した。focused再実行も1回だけ行い、同じ `elementFromPoint` z-order assertionで再度失敗した。該当testは今回のHEAD差分に含まれず、`aaa661e`（2026-07-20）の既存testであり、今回変更対象外のz-order assertionなので、今回変更由来とは断定できない。なお、最終E2E全体はretry成功でexit 0。
- Flowごとの実行証跡は下記「Required Flow A〜G」に記載。
- `npm run verify`: GREEN。webapp 95 files / 672 tests、route guidance 6 files / 35 tests、Phase 5D回帰4 tests、architecture 152 files、typecheck、build、public asset 26件、GAS 27 tests。
- `node scripts/audit-public-tree.mjs`: GREEN。
- `git diff --check`: GREEN。
- `git status --short`: report作成前はE2E assertion 1行と対象snapshot 2枚のみ。

## Required Flow A〜G

- Flow A: PASS。`tests/e2e/management.spec.ts` の `Flow 7.1: pending GAS同期付き全日程削除の確認と破棄` で、pending件数表示、cancel保持、confirm後のstate/outbox/navigation snapshot削除、GAS POSTなしを確認。
- Flow B: PASS。`tests/e2e/management.spec.ts` の `Flow 1: 初回訪問とCSVプレビュー・適用・ナビゲーション反映`、`Flow 4: GASの初期インポート・置換・リフレッシュ`、`Flow 9: ソース取得およびプレビューの競合排除`、および `tests/circle-data-source-cancellation.test.ts` の `reaches csv-preview and apply-preview through controller paths` と stale/cancel success testsで、CSV/GAS preview、apply、loading/success、競合排除を確認。
- Flow C: PASS（scale非依存のdemo実map結合・viewport）。`tests/e2e/webapp.spec.ts` の `デモデータで地図・ピン・経路・ボトムシートを表示する`、`tests/route-map-viewport-layout.test.ts` の3ケース、`tests/e2e/webapp.spec.ts` の `マニフェストの2エリアから現在地候補を切り替える` で確認。`tests/c108-map-browser-smoke.spec.ts` の `renders marker and route overlay for area e456/e7/s12/w12` は `RUN_C108_SMOKE=1` fixture unavailableのため8件skip。
- Flow D: PASS。`tests/gesture-zoom-controller.test.ts` の `limits pinch center movement to the rubber-band overscroll`、`recovers from cancel and capture loss without leaving active pointers`、`applies bounded resistance outside pan limits`、`settles a bounds violation after a low-speed pointer release`、および `resets to the configured base transform after pan and zoom` で確認。
- Flow E: PASS。`tests/gallery-swipe-action.test.ts` の `fires once only for the allowed outer direction and applies progressive resistance`、`keeps the Phase 6 purchase trigger distance and strict boundary`、`calculates continuous, symmetric resistance that lightens toward the trigger`、`does not purchase on a forbidden direction or vertical scroll`、および `tests/e2e/webapp.spec.ts` の `一覧の左右スワイプが外側方向の購入と端末保存へ到達する` で確認。
- Flow F: PASS（確認できる範囲のS/G/flow/cost-length分離）。`tests/e2e/webapp.spec.ts` の `デモデータで地図・ピン・経路・ボトムシートを表示する` と `ピンの候補経路を比較してから目的地を変更する`、`tests/route-overlay-contract.test.ts` の `planRoute and buildRouteOverlaySvg fulfill coordinate contracts with fictional data` と `weighted cost stays separate from unweighted pixel length for both route origins` で、circle/`planRoute`経路のS/G、current route flow、candidate blue line、reduced-motion、`cost`/`physicalPixelLength`分離を確認。`weighted cost stays separate from unweighted pixel length for both route origins` は manual grid 起点の `planRouteFromGridIndex` を含むが、同起点のSVG S/G markerまでは検証していないため未証明。`m`表示と`metersPerPixel`/scale contractは `e456/e7/s12/w12` のscale evidence不足のため **BLOCKED (scale only)**。
- Flow G: PASS。`tests/e2e/webapp.spec.ts` の `ピンの候補経路を比較してから目的地を変更する`、`予定を開くと巡回順と地図pinの番号が一致し案内状態を変えない`、`一覧から目的地を選び購入・保留状態を更新する`、`使い方をheaderから開き、本文を拡大表示して閉じられる`、`tests/e2e/gas-sync.spec.ts` の `購入は失敗POSTより先にLocalStorageへ保存される`、`tests/purchase-flow.test.ts` の `reports local save failure without calling GAS or claiming success` と `keeps the local purchase when a later GAS request fails` で確認。

## Snapshot判断

対象3枚のうち、意図した差分が出た次の2枚だけを個別更新した。

- `navigation-map-catalog-mobile-chromium-linux.png`
- `route-comparison-mobile-chromium-linux.png`

差分はTask 3/5の自然比率viewport、S/G marker、current route flowによるもの。`scoped-deletion-dialog-mobile-chromium-linux.png`は、pending warningの意図した差分がそのsnapshotに発生しなかったため更新していない。無差別更新はしていない。

## Biome baseline比較

基準はPhase 6.1開始commit `9718f976558e31596585f6e03416db8825c6e13f`。

- Phase 6.1変更ファイル限定: `12 errors / 6 warnings`。Task 1〜5由来の既存format/lint診断を一括修正していない。
- baseline `npx biome check .`: `89 errors / 116 warnings / 8 infos`。
- current `npx biome check .`: `87 errors / 116 warnings / 6 infos`。
- baseline比で新規error/warningの増加なし。repo-wide debtは持ち込まず、修正範囲を広げていない。

## Scale evidence再確認

`e456/e7/s12/w12`の各 `grid-meta.json`、`map.svg`、`points.json`、asset導入履歴およびrepository/historyを再確認したが、画像pixelと会場実距離を対応づける根拠、既知scale値、`metersPerPixel`は見つからなかった。推測値は追加していない。

## 変更

- `tests/e2e/management.spec.ts`: Task 1現行契約に合わせ、pending状態でも削除button 4つがenabledであることを検証。
- 地図・route comparisonの対象snapshot 2枚のみ更新。
- `docs/status/progress.md`は更新していない。
