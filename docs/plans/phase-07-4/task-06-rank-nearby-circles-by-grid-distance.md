# Phase 7.4 タスク6: grid距離による周辺サークルランキング

## 目的

Task 5で得た任意grid originからDijkstraを一度だけ実行し、priority・hold条件を適用した候補をwalkable grid距離順に並べ、5 / 10 / 15 / 20件へ制限する。

## 対象外

- ユークリッド距離による近似。
- circleごとのDijkstra繰り返し。
- お品書きカード配置。
- Route GuidanceのALNS変更。

## 前提と依存関係

Task 2、Task 5完了。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts`
- `buildDistanceMap()`
- `rankCandidatesByGridDistance()`
- `planRouteFromGridIndex()`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/event-day/domain/event-day-types.ts`

## 対象ファイル

### 変更

- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- 必要なBrowserApplication接続
- routing test

### 作成

- `apps/webapp/js/features/route-guidance/ui/nearby-circle-model.ts`
- `tests/nearby-circle-ranking.test.ts`

### 削除

なし。

## 実装手順

1. `buildDistanceMap()`内部のDijkstra本体を、start index集合を受け取るprivate helperへ寄せる。既存`startSpace` APIは互換維持する。
2. 任意`startGridIndex`から同じdistance mapを作るexportを追加する。既存`planRouteFromGridIndex()`とgrid validation規則を一致させる。
3. 任意origin用のcandidate rankingを追加し、各circleのportal距離最小値で順位付けする。到達不能は`Infinity`として周辺表示model側で除外する。
4. `nearby-circle-model.ts`で処理順を固定する: selected area → 未購入 → hold条件 → priority完全一致filter → finite grid distance順 → limit 5 / 10 / 15 / 20。
5. 同距離は元候補順またはspace順の一つに固定し、毎renderで順番が揺れないようにする。
6. filter条件変更時は同じoriginで再計算する。distance mapを無意味にcircle数回作らない。

## テスト方針

- 直線距離ではAが近いがwalkable grid距離ではBが近いfixtureでBが先。
- Dijkstra本体の起動がcandidate数に比例して増えない。
- priority filterが距離sortより先に適用された結果、選択priority内の上位Nになる。
- holdは通常除外、includeHeldで復帰。
- purchasedは除外。
- unreachableは表示件数を消費しない。
- 5 / 10 / 15 / 20の上限。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-circle-ranking.test.ts tests/route-planner-contract.test.ts
npm run test:route-guidance
npm run check:webapp
git diff --check
```

## 受入条件

- 任意originから実際のwalkable grid距離順を返す。
- priority → distance → limitの順序が固定される。
- circleごとのroute計算を繰り返さない。
- 既存`buildDistanceMap(startSpace)`とRoute Guidanceの結果を壊さない。

## 予定コミットメッセージ

```text
feat(phase-07-4): rank nearby circles by grid distance
```
