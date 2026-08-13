# Phase 7.4 タスク14: 独立地図を元の縦横比で初期表示

## 目的

独立した周辺地図を一律の横長viewportへ切り取らず、各map bundleの縦横比と利用可能画面サイズに応じて地図全体を自然に初期表示する。

## 対象外

- 通常のRoute Guidance map layout全面変更。
- map bundle画像そのものの加工。
- 新しいzoom library。

## 前提と依存関係

Task 13後に実装する。Task 15のscreen-space card配置はこの最終viewport geometryを前提にする。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/css/maps.css`

## 対象ファイル

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/css/maps.css`
- `tests/e2e/webapp.spec.ts`
- 既存のmap layout focused test（適切なものがあれば）

### 削除

なし。

## 実装手順

1. standalone mapで`viewportMaxHeight: 520` / `minimumInteractiveHeight: 220`を固定利用している現状を切り離す。
2. dialog内のheader/controls/errorを除いた利用可能width/heightを測り、元画像aspect ratioを保った`contain`寸法を求める。
3. stage全体が初期viewport内に収まる`stageWidth/stageHeight/baseX/baseY`を`GestureZoomController.setLayout()`へ渡す。
4. 横長地図は幅優先、縦長地図は高さ優先とし、余白は許容するが初期cropは禁止する。
5. viewport/dialog resize時に同じ計算を再適用する。ResizeObserver等の既存仕組みで足りる場合は再利用する。
6. userがzoom/panした後に無関係なrenderで毎回resetしない。area変更・画像初回load・明示reset時だけfitをやり直す。
7. 通常route mapの`calculateMapViewportLayout()`契約は壊さない。

## テスト方針

- 横長fixtureで全画像がviewport内に収まる。
- 縦長fixtureで全画像がviewport内に収まり、横長窓にcropされない。
- stageと画像のaspect ratioが一致する。
- resize後もcontainを維持する。
- zoom/pan後の候補再描画だけでtransformが初期化されない。

## 検証コマンド

```bash
npx playwright test tests/e2e/webapp.spec.ts --grep "周辺地図|縦横比|地図"
npm run test:webapp
npm run check:webapp
git diff --check
```

## 受入条件

- 各areaの地図全体が初期状態で見える。
- 縦長/横長に応じてviewport内の地図寸法が変わる。
- 通常経路地図のlayoutを後退させていない。

## 予定コミットメッセージ

```text
fix(phase-07-4): fit standalone maps by aspect ratio
```