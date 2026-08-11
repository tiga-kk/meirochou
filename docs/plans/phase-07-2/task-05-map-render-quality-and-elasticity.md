# Phase 7.2 Task 5: map画質原因の特定とelastic overscroll調整

## 目標

「次の目的地を検索」後のauto-fit地図がぼやける原因をasset、描画、compositorの順に切り分け、vector sourceを維持したまま不必要な画質低下を解消する。同時にbounds外へ引いた時のelastic量を現行より弱くする。

## やってはいけないこと

- 「SVGだから低画質」と判断しない。
- 診断なしにmap.svgをPNG/WebPへ変換しない。
- pointermoveごとに`getBoundingClientRect()`等のlayout readを増やさない。
- inertiaを削除して硬いdragへ戻さない。
- bounds外へ永久に停止できるようにしない。
- Gallery/PDF画像zoomなど別用途の`GestureZoomController`へmap専用tuningを無条件適用しない。
- 画質改善の仮説だけを理由に、共有controllerへ新しいcallback/APIを先回りして追加しない。

## 対象ファイル

**作成:**
- `tests/map-svg-vector-contract.test.mjs`
- `tests/e2e/map-render-quality.spec.ts`

**変更:**
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/css/target.css`
- `tests/gesture-zoom-controller.test.ts`
- `tests/route-map-viewport-layout.test.ts`

`onInteractionStateChange`等の追加APIは、後述の比較で必要性が実証された場合だけ変更対象へ追加する。

## Step A: source SVG contractを先に固定する

C108の各`map.svg`をNode testでtextとして読み、最低限`<svg>`と`viewBox`を確認する。`<image>`、`data:image`、external bitmap referenceがある場合は、その事実も出力・assertする。

embedded bitmapが見つかってもTask全体を停止しない。

- asset由来の画質問題候補として記録する。
- overscroll調整、bounds回帰、CSS/compositor比較など独立して実施できる項目は続行する。
- bitmap部分の再生成が必要なら、そのasset所有Taskだけを未解決として最終報告へ残す。根拠なく別形式へ変換しない。

## Step B: persistent `will-change`を最小変更で比較する

現行`.map-transform-layer`は`will-change: transform`を常時指定している。まず追加APIを作らず、idle時のpersistent `will-change`を外した状態で次を比較する。

- auto-fit直後
- 1段階zoom後
- pinch/pan中
- 操作終了後

画質が改善し、gesture性能に有意な回帰が無ければ、その最小変更を採用する。

gesture中だけpromotionが必要だと再現できた場合に限り、既存`GestureZoomController`へoptionalなinteraction callback等を追加してよい。その場合は次を同時に満たす。

- optionsはoptionalで既存callerの挙動を変えない。
- map instanceだけがinteraction classを使う。
- pointerdown〜inertia/bounce終了までのlifecycleをtestする。
- wheel/reset/setTransformでactive状態が残留しない。

「念のため」callbackを追加してはいけない。

## Step C: map専用overscroll limitを18pxへ弱める

`applyRubberBand(value,min,max,overscrollLimit)`の数式は維持してよい。必要なのはmap instanceだけ18pxを使えることなので、`GestureZoomController`へ最小のoptional設定を追加する。

例:

```js
new GestureZoomController(container, layer, {
  overscrollLimit: 18,
});
```

constructorは既存2引数callerを維持する。

```js
constructor(container, img, options = {})
```

PDF/Gallery zoomはdefault値を維持する。

固定する性質:

- far outside dragでもmapの視覚的overscrollが概ね18pxを超えない。
- bounds内panはfinger deltaへ1:1追従する。
- release後は既存inertia/bounceで合法boundsへ収束する。
- left/right/top/bottomの各端へ到達可能なことを壊さない。

## Step D: auto-fit画質E2E

Playwrightで「次の目的地を検索」→route auto-fitを行い、少なくとも次を記録する。

- `devicePixelRatio`
- map source URL
- `<img>.naturalWidth/naturalHeight`
- transform scale
- stage width/height
- computed `will-change`

画質そのものをDOM数値だけで合格にしない。代表routeのbefore/after screenshotを比較し、地図線・文字がauto-fit/zoom後に不必要にぼやけないことを人間が確認できるartifactを残す。

visual snapshotを自動更新して「改善したこと」にしない。

## 追加診断の順序

persistent `will-change`を外しても再現する場合は次の順で調べる。

1. parent transform scaleが異常に大きくないか。
2. `calculateFitTransform()`やmax scaleが意味のない拡大を許していないか。
3. source SVG自身にbitmap等の非vector要素が無いか。
4. browserの`<img src="...svg">` rasterization/compositingが原因か。
5. それでも必要な場合だけinline SVG / `<object>`等を別案として比較する。

5はpin/route座標系へ大きく影響するため、このTaskの通常実装へ勝手に含めない。必要性と影響範囲を文書へ追記してから別Taskとして扱う。

## 手順

- [ ] **Step 1: SVG vector contract testを書く**
- [ ] **Step 2: C108 4areaでsource事実を確認する**
- [ ] **Step 3: persistent `will-change`を外した最小比較を行う**
- [ ] **Step 4: map専用`overscrollLimit: 18`のRED testを書く**
  - default callerは既存値。
  - map callerは18。
  - bounds内1:1。
  - release後settle。
- [ ] **Step 5: controllerのoptional overscroll設定を実装し、map viewだけへ接続する**
- [ ] **Step 6: e456/e7/s12/w12相当aspect ratioで四辺到達testを維持する**
- [ ] **Step 7: auto-fit/zoom E2Eとvisual artifactを追加する**
- [ ] **Step 8: persistent `will-change`除去で性能回帰が再現した場合だけinteraction状態APIを追加する**
- [ ] **Step 9: focused verification**

```bash
npx vitest run --root . tests/gesture-zoom-controller.test.ts tests/route-map-viewport-layout.test.ts
npx vitest run --root . tests/map-svg-vector-contract.test.mjs
npx playwright test tests/e2e/map-render-quality.spec.ts
npm run test:webapp
npm run check:webapp
git diff --check
```

## 受入条件

- map sourceのvector/bitmap構成がtestで確認できる。
- auto-fit後のぼやけが改善するか、未解決なら原因候補と再現条件が絞られている。
- 根拠なくasset形式や描画方式を置換しない。
- mapのelastic overscrollは最大18px程度になる。
- bounds内pan/inertiaの既存操作感を壊さない。
- release後は必ず合法boundsへ戻る。
- 共有controllerへ追加したAPIは、実測上必要なものだけである。