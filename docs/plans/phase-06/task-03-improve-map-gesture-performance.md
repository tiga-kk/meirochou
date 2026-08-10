# Phase 6 Task 3: 地図ジェスチャーの操作性能を改善する

## 目的

地図の1本指パン、2本指ピンチ、マウスドラッグ、ホイールズームの入力経路を整理し、指へ遅れて付いてくる感覚や慣性中のもっさりを減らす。

## 対象外

- 地図画像の解像度変更
- 経路探索アルゴリズム変更
- WebGL/Canvasへの全面移行
- 外部ジェスチャーライブラリ導入

## 前提と依存関係

- Task 1、2完了後に実施する。
- 地図描画は既存DOM/CSS transformを維持する。

## 読むべき文書と既存実装

- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/css/target.css`
- `apps/webapp/css/gallery.css`

## 対象ファイル

### 作成

- `tests/gesture-zoom-controller.test.ts`

### 変更

- `apps/webapp/js/utils/gesture-zoom-controller.js`
- 必要なら`apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- 必要なら地図操作領域のCSS

### 削除

なし。

## 実装手順

1. `GestureZoomController`のtouch eventとmouse eventの別系統実装をPointer Events中心へ統合する。
2. active pointerを`pointerId`単位で保持し、1 pointerはpan、2 pointerはpinchとして同じtransform stateを更新する。
3. pointer captureを使い、ドラッグ中に指/ポインタが要素外へ出ても操作を継続できるようにする。
4. `pointerup`だけでなく`pointercancel`と`lostpointercapture`でも対応pointerをactive集合から除き、drag/pinch状態を解除または残ったpointerへ正しく縮退する。cancel後に`isDragging`相当の状態が残って慣性や次操作を阻害しないようにする。
5. pointer moveごとに直接複数回DOM transformを書かず、最新のstateを保持して`requestAnimationFrame()`で1フレーム最大1回だけ反映する。
6. 慣性処理中の各frameで`container.getBoundingClientRect()`とtransform済みimageの`getBoundingClientRect()`を繰り返さない。
7. container寸法、画像の基準寸法、現在scaleからpan境界を計算できる値を、初期化、画像ロード、transform fit、container resize等の必要なタイミングで更新する。
8. wheel zoomは既存と同じtransform stateへ統合する。
9. 地図操作領域の`touch-action: none`を維持し、それ以外の画面へ不要に広げない。
10. 公開されている`reset()`、`setTransform()`、`setMaxScale()`の既存利用を壊さない。`reset()`ではactive pointer、速度、予約済みRAFも通常開始可能な状態へ戻す。
11. テストでPointer Events入力とRAF flush後のtransform、最大scale、reset、複数moveのcoalescing、pointer cancellation後の復帰を確認する。

## テスト方針

- 連続した複数pointermoveでも、同一frame内のtransform DOM writeが1回へまとまる。
- 1 pointer panでx/yが期待方向へ更新される。
- 2 pointer pinchでscaleがMIN/MAX内に制限される。
- `pointercancel`/`lostpointercapture`後にactive pointerが残留せず、その後の新しいpanを開始できる。
- 2 pointer中に片方がcancelされた場合、残った1 pointerで不連続な巨大deltaを発生させない。
- `setTransform()`と`reset()`が既存契約を維持する。
- 慣性frame内でlayout readを毎frame行う実装へ戻らないことを、依存のspyまたは分離した境界計算関数で検証する。

## 検証コマンド

```bash
npx vitest run tests/gesture-zoom-controller.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

実機またはモバイルブラウザ相当で、地図のパン・ピンチと操作中断後の再操作を手動確認する。

## 受入条件

- touch/mouseの重複した主要pan実装がPointer Eventsへ統合されている。
- pointer moveのDOM反映がRAFへ集約されている。
- pointer cancel/capture喪失後に操作不能状態が残らない。
- 慣性各frameの不要なlayout readがない。
- 既存のmap fit、pin位置、wheel zoom、画像モーダルのzoomを壊さない。

## 予定コミットメッセージ

`perf(map): streamline pan and zoom gestures`
