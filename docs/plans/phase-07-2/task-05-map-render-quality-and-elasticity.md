# Phase 7.2 Task 5: map画質原因の特定とelastic overscroll調整

## 目標

「次の目的地を検索」後のauto-fitされた地図がぼやける原因をasset/render/compositorのどこにあるか切り分け、vector sourceを維持したまま不必要な画質低下を解消する。同時にbounds外へ引いた時のelastic量を現行より弱くする。

## やってはいけないこと

- 「SVGだから低画質」と判断しない。
- 診断なしにmap.svgをPNG/WebPへ変換しない。
- pointermoveごとに`getBoundingClientRect()`等のlayout readを増やさない。
- inertiaを削除して硬いdragへ戻さない。
- bounds外へ永久に停止できるようにしない。
- Gallery画像zoomなど別用途の`GestureZoomController`へmap専用tuningを無条件適用しない。

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

必要な場合だけ:
- `apps/webapp/js/utils/pan-physics.ts`またはPhase 7.1で既に作成されたphysics module

## Step A: source SVG contractを先に固定する

C108の各`map.svg`をNode testでtextとして読む。

最低条件:

```text
<svg ... viewBox="...">
```

を持つこと。さらに`<image>`/`data:image`/external bitmap referenceの有無を報告する。

```js
for (const area of ["e456", "e7", "s12", "w12"]) {
  const svg = readFileSync(path, "utf8");
  assert.match(svg, /<svg\b/);
  assert.match(svg, /\bviewBox=/);
}
```

もしembedded bitmapが存在する場合は、その部分だけがscale時に粗くなる可能性をdocumentし、Taskを止めてasset生成経路を再評価する。存在しない場合はrender pathを修正する。

## Step B: compositor promotionを常時にしない

現在`.map-transform-layer`には`will-change: transform`が常時付いている。これをidle時は外し、gesture/inertia中だけopt-inする。

`GestureZoomController`へmapで使えるinteraction state callbackを追加する。

```js
new GestureZoomController(container, layer, {
  overscrollLimit: 18,
  onInteractionStateChange(active) {
    layer.classList.toggle("is-gesture-active", active);
  },
});
```

backward compatibilityのためoptionsはoptionalにする。

```js
constructor(container, img, options = {})
```

options:

```ts
interface GestureZoomOptions {
  overscrollLimit?: number;
  onInteractionStateChange?: (active: boolean) => void;
}
```

`DomRouteMapView`だけ`overscrollLimit: 18`を渡す。PDF/Gallery zoomは既存defaultを維持し、今回のmap tuningで挙動を変えない。

CSS:

```css
.map-transform-layer { will-change: auto; }
.map-transform-layer.is-gesture-active { will-change: transform; }
```

interaction activeの範囲:

- pointerdown〜全pointer release後のinertia/bounce終了までtrue。
- wheel zoom中のshort animation中true。
- reset/setTransform後、animationがなければfalse。

## Step C: elastic contractを18pxへ弱める

`applyRubberBand(value,min,max,overscrollLimit)`の数学式は維持してよい。map instanceへ18を渡し、hardcoded 32へ依存しない。

固定テスト:

```js
const controller = createMapController({ overscrollLimit: 18 });
// far outside drag
expect(controller.state.x).toBeGreaterThan(0);
expect(controller.state.x).toBeLessThanOrEqual(18);
```

通常bounds内:

```js
// 20px finger drag -> 20px map translation
expect(deltaX).toBeCloseTo(20, 5);
```

release後:

```js
flushRafUntilSettled();
expect(controller.state.x).toBe(boundaryX);
expect(controller.rafId).toBeNull();
```

## Step D: auto-fit画質E2E

Playwrightで「次の目的地を検索」→route auto-fitを行い、次を記録する。

- `devicePixelRatio`
- map source URLが`.svg`
- `<img>.naturalWidth/naturalHeight`
- transform scale
- stage width/height
- idle時computed `will-change`が`auto`

画質をpixel-perfect数値だけで判定しない。代表routeでbefore/after screenshotをreview artifactとして残し、意図した地図線/文字がzoom後にぼやけていないことを目視gateにする。

必要ならPlaywright screenshotを2枚固定する。

```text
map-auto-fit-vector.png
map-zoom-vector.png
```

snapshot更新はrender path変更で意図的に改善した場合だけ行う。

## 追加診断

`will-change`を外してもぼやける場合は、次の順で調べる。

1. parent CSS transform scaleが非常に大きくなっていないか。
2. `calculateFitTransform()`がnative SVG detailを超える意味のないscaleを返していないか。
3. browser `<img src="...svg">`のrasterization挙動が原因か。
4. 必要な場合だけinline SVG / `<object>`等のprototypeを独立branchで比較する。

Task 5の実装担当が4へ進む場合、既存pin/route coordinate systemを壊す大変更になるため、planへ追記してreviewを受ける。勝手にinline SVGへ置換しない。

## 手順

- [ ] **Step 1: SVG vector contract testを書く**
- [ ] **Step 2: C108 4areaでtestを実行しsource事実を記録する**
- [ ] **Step 3: GestureZoom optionsのRED testsを書く**
  - map-specific overscroll 18。
  - default instanceは既存挙動。
  - interaction state callback lifecycle。
- [ ] **Step 4: controller optionsを実装する**
- [ ] **Step 5: map viewへ18px + interaction classを接続する**
- [ ] **Step 6: persistent `will-change`を外す**
- [ ] **Step 7: bounds四辺testを維持/強化する**
  - e456/e7/s12/w12相当aspect ratioでleft/right/top/bottomへ到達可能。
- [ ] **Step 8: auto-fit/zoom E2Eとvisual artifactを追加する**
- [ ] **Step 9: mobile実機相当で比較する**
- [ ] **Step 10: verification**

```bash
npx vitest run --root . tests/gesture-zoom-controller.test.ts tests/route-map-viewport-layout.test.ts
npx vitest run --root . tests/map-svg-vector-contract.test.mjs
npx playwright test tests/e2e/map-render-quality.spec.ts
npm run test:webapp
npm run check:webapp
git diff --check
```

## 受入条件

- map sourceがvectorである場合、その事実をtestで固定し、PNG化しない。
- auto-fit後のぼやけが改善するか、少なくとも原因が再現可能なtest/diagnosticへ落ちる。
- mapのelastic overscrollは最大18px程度になる。
- bounds内pan/inertiaは軽さを失わない。
- release後は必ず合法boundsへ戻る。