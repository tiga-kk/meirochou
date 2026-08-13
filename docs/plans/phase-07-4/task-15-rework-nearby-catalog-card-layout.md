# Phase 7.4 タスク15: 周辺カードを画面座標で非重複配置

## 目的

周辺お品書きカードをズーム対象の地図stageから分離し、5件程度なら原則重ならない画面座標配置、選択カードの前面化、読みやすいleader lineを実現する。

## 対象外

- physics simulation。
- 外部layout library。
- 20件をどんな狭い画面でも絶対に非重複にする保証。
- お品書きOCRや画像内容解析。

## 前提と依存関係

Task 11のzoom transform通知、Task 13のcard selection/action契約、Task 14のstandalone viewport geometryが完了していること。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/nearby-catalog-layout.ts`
- `apps/webapp/css/maps.css`
- `tests/nearby-catalog-layout.test.ts`

## 対象ファイル

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/nearby-catalog-layout.ts`
- `apps/webapp/css/maps.css`
- `tests/nearby-catalog-layout.test.ts`
- `tests/e2e/webapp.spec.ts`

### 削除

なし。

## 実装手順

1. card layerをmap transform layerの外、viewport基準のscreen-space overlayへ移す。map image/pin anchorだけをzoom/panさせる。
2. current `scale/x/y/base layout`から各anchorのviewport座標を求める変換を一箇所にする。
3. card配置関数の入力をscreen-space anchors + viewport boundsへ変更する。
4. まず既配置cardと交差しない候補slotだけを評価し、その中からanchorに近くviewport内に収まる位置を選ぶ。
5. 5件の密集anchor fixtureで非重複配置できる候補slotを十分に用意する。固定8方向だけに限定しない。
6. 非重複候補がない狭いviewportだけ重なり最小のfallbackを選ぶ。
7. 選択cardへ高いz-indexを与える。非選択cardのDOM順は前面化の意味に使わない。
8. leader lineはmap anchorのviewport座標からcard境界の最近点へ引く。
9. lineは太い明色underlay + 濃色foreground等の高コントラスト二重線にし、画面上で追える幅にする。
10. pan/zoom中はTask 11で追加するzoom transform通知からcard/lineの位置だけ更新し、nearby Dijkstraやcandidate rankingを再実行しない。

## テスト方針

- 390px相当viewport、近接5anchorでcard矩形が互いに交差しない。
- 同一入力の配置は決定的。
- cardの`space`とanchor対応を失わない。
- 選択cardだけが最前面class/stateを持つ。
- pan/zoom後もleader line endpointが該当anchorへ追従する。
- lineのcomputed width/contrastが既存2px単線より強い。
- narrow fallbackでも全cardがviewport外へ完全消失しない。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-catalog-layout.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "周辺|カード|leader|お品書き"
npm run check:webapp
git diff --check
```

## 受入条件

- 通常の5件表示でカードが重ならない。
- カードの大きさがmap zoom倍率で巨大化しない。
- 選択cardを前面化できる。
- leader lineを地図上で追える。
- zoom/panがnearby距離計算を再実行しない。

## 予定コミットメッセージ

```text
fix(phase-07-4): rework nearby catalog card layout
```