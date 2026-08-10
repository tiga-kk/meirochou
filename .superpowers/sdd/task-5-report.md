# Phase 6.1 Task 5 report

## Scale evidence調査

結論: 4 areaすべてで、画像pixelと会場実距離を対応づける根拠をrepository/historyから確認できなかった。推測値は追加していない。

| areaId | 確認できた資料 | source-image pixels | 対応する実距離 | 判定 |
| --- | --- | ---: | ---: | --- |
| e456 | `grid-meta.json`、`map.svg`、`points.json`、asset導入commit `0fb306d` | 4096 x 1438 | なし | missing |
| e7 | `grid-meta.json`、`map.svg`、`points.json`、asset導入commit `0fb306d` | 1848 x 1982 | なし | missing |
| s12 | `grid-meta.json`、`map.svg`、`points.json`、asset導入commit `0fb306d` | 1872 x 972 | なし | missing |
| w12 | `grid-meta.json`、`map.svg`、`points.json`、asset導入commit `0fb306d` | 2904 x 2166 | なし | missing |

履歴全体を`metersPerPixel`およびscale・実寸関連語で調査したが、既知scale値、会場実距離、地図生成時の実寸基準は見つからなかった。

## 実装範囲

- `RouteResult.physicalPixelLength`を追加。`route.points`の連続点間Euclidean長をunweighted source-image pixel lengthとして、`planRoute()`と`planRouteFromGridIndex()`の双方から返す。
- `cost`のweighted routing計算とcrowded multiplierは変更していない。
- current route overlayへbase line、ordered pointsのflow line、先頭/末尾由来のS/G markerを追加。
- candidate overlayにはflowを追加していない。
- flowはCSS/SVG animationのみで、JS RAF/timerや毎frame DOM・route再計算は追加していない。`prefers-reduced-motion: reduce`では停止する。
- manifest/parser/runtime/m表示のscale依存部分は未実装。

## 変更ファイルとcommit

実装commit: `0116677` (`feat(route-guidance): show route direction cues`)

- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-types.ts`
- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/task10-demo-route-regression.test.mjs`
- `tests/e2e/webapp.spec.ts`

## テスト結果

- `npx vitest run --root . tests/route-overlay-contract.test.ts tests/task10-demo-route-regression.test.mjs`: PASS（2 files / 5 tests）
- `npx biome check`（変更TS・E2E対象）: PASS
- `npm run check:webapp`: PASS（architecture 152 files、typecheck）
- `npm run build:webapp && npm run verify:webapp:build`: PASS
- `git diff --check`: PASS
- `npx playwright test tests/e2e/webapp.spec.ts --grep "経路|Start|Goal|route"`: 1 PASS、2 FAIL。失敗は既存snapshot不一致（`navigation-map-catalog`、`route-comparison`）。追加したS/G・flow・reduced-motion・candidate flowなしのassertionは到達した。
- `node --test tests/task10-demo-route-regression.test.mjs`: FAIL。既存テストがTypeScriptを直接importし、Node 22の`.ts`拡張子エラーで起動前に停止。
- `npm run test:webapp`: runnerヘッダ後に結果サマリーを出さず終了するため、focused suiteとcheck/buildで代替確認した。

## 受入条件

- weighted `cost`とunweighted `physicalPixelLength`: 実装・focused test PASS。
- current routeのbase/flow/S/G、candidate flowなし: 実装・contract/E2E assertion PASS。
- reduced-motion停止: CSSとE2E assertionを追加。
- JS frame loop、毎frame DOM再生成、route再計算なし: コード確認済み。
- 物理m表示と4 areaのscale contract: 未達（根拠不足のため正しく保留）。

## blocked

`BLOCKED: physical scale evidence missing (e456, e7, s12, w12)`

scale根拠が揃うまで、推測`metersPerPixel`、manifest/parser/runtime contract、整数m表示は追加しない。
