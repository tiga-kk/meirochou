# Phase 7.4 タスク11: 候補経路の連続表示とズーム連動線幅

## 目的

行き先変更候補の青線を連続した経路として表示し、赤/青経路線を拡大時に細くして通路を覆わないようにする。

## 対象外

- route pointsやDijkstraの変更。
- ALNSの変更。
- JavaScriptで毎frame route SVGを再生成すること。
- ユーザーが手動で線幅数値を設定する設定画面。

## 前提と依存関係

Task 10後に実装する。Task 12、Task 15、Task 17がzoom transform通知を再利用できるようにする。

## 読むべき文書と既存実装

- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `tests/route-overlay-contract.test.ts`
- `tests/gesture-zoom-controller.test.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 変更

- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `tests/route-overlay-contract.test.ts`
- `tests/gesture-zoom-controller.test.ts`
- `tests/e2e/webapp.spec.ts`

### 削除

なし。

## 実装手順

1. candidate routeのcomputed `stroke-dasharray`が破線である現状をRED/characterizationとして固定する。
2. `.route-overlay-candidate .route-overlay-line`から破線指定を外し、青い連続実線にする。
3. `GestureZoomController`に現在の`scale/x/y`をviewへ通知できる最小のcallbackまたはイベントを追加する。既存利用側はcallbackなしでも同じ挙動を維持する。
4. pointer pan/pinch/inertia中の通知は、既存のtransform style writeと同じRAF単位へまとめ、style更新より高頻度な同期callbackを発火しない。`setTransform()`、`reset()`、layout再適用でも最終的に表示へ反映された最新stateを通知する。
5. `DomRouteMapView`でzoom scaleからcurrent/candidate共通の画面上stroke幅を計算し、CSS custom property等でoverlayへ渡す。
6. scale=1付近では現行の視認性を維持し、scaleが増えるほど線幅を単調に小さくする。4px前後など読める下限を設ける。
7. zoom変更は描画styleだけを更新し、route points、route planning、SVG生成回数を増やさない。
8. moving cueの線幅もbase pathとの比率が不自然にならない範囲で同じscale情報へ追従させる。Task 12のアニメーション診断自体はこのTaskへ混ぜない。

## テスト方針

- candidateに`stroke-dasharray`がなく連続線になる。
- scale=1の線幅 > scale=4の線幅 >= 下限。
- current/candidateで同じ幅規則を使う。
- zoom callbackはprogrammaticな`setTransform`/`reset`と、pointer pan/pinch/inertiaの描画更新で最新stateを通知する。
- pointermoveを複数回発火しても、transform style writeと通知が既存RAF coalescingを超えて同期多重実行されない。
- zoom中にroute plannerや`buildRouteOverlaySvg()`を繰り返し呼ばない。

## 検証コマンド

```bash
npx vitest run --root . tests/route-overlay-contract.test.ts tests/gesture-zoom-controller.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "経路|候補|ズーム"
npm run check:webapp
git diff --check
```

## 受入条件

- 青候補線が途切れて見えない。
- 初期縮尺では現在程度の視認性がある。
- 拡大時には赤/青線が明確に細くなる。
- transform通知を追加してもpointermove hot pathのDOM layout readや同期多重描画を増やしていない。
- 線幅変更のためにroute再計算や常駐timerを追加していない。

## 予定コミットメッセージ

```text
fix(phase-07-4): adapt route lines to map zoom
```