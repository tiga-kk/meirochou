# Phase 6.1 Task 3: map viewport/stageとgesture境界・性能を修正

## 目標

固定縦長canvasと`object-fit: contain`中心のmap viewerを、実画像比率を持つstage + responsive viewportへ置き換える。横長地図の余白を減らしつつ最低220pxの操作領域を確保し、縦長地図でも不要な左右余白を作らず、最大約32pxのrubber-band overscrollと軽いpan/pinchを実現する。

## やってはいけないこと

- Canvas/WebGLへ全面移行しない。
- 地図画像、pin layer、route overlayを異なる座標boxへ分離しない。
- pointermoveごとに`getBoundingClientRect()`を読む実装へ戻さない。
- pan中に無制限に地図外を見せない。
- overscrollを完全hard clampして指の動きを不自然に止めない。
- `object-fit: contain`のletterboxを別の固定viewportへ残さない。
- route計算やALNSへviewer geometryを混ぜない。

## Files

**Modify:**
- `apps/webapp/index.html`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`

**Test:**
- `tests/gesture-zoom-controller.test.ts`
- `tests/route-map-viewport-layout.test.ts`（新規。既存model testへ統合する場合は同じ契約を保持）
- `tests/e2e/webapp.spec.ts`

## Interfaces

純粋geometry helperをRoute Guidance UI model側へ置く。

```ts
export interface MapViewportLayoutInput {
  viewportWidth: number;
  viewportMaxHeight: number;
  minimumInteractiveHeight: number;
  imageWidth: number;
  imageHeight: number;
}

export interface MapViewportLayout {
  viewportWidth: number;
  viewportHeight: number;
  stageWidth: number;
  stageHeight: number;
  initialX: number;
  initialY: number;
}

export function calculateMapViewportLayout(
  input: MapViewportLayoutInput,
): MapViewportLayout;
```

base scale 1のstageは常にviewportを最低一方向で満たし、初期表示でletterboxを作らない。

```text
naturalHeight = viewportWidth * imageHeight / imageWidth

if naturalHeight < minimumInteractiveHeight:
  viewportHeight = minimumInteractiveHeight
  stageHeight = minimumInteractiveHeight
  stageWidth = stageHeight * imageWidth / imageHeight
  initialX = (viewportWidth - stageWidth) / 2
  initialY = 0

else if naturalHeight <= viewportMaxHeight:
  viewportHeight = naturalHeight
  stageWidth = viewportWidth
  stageHeight = naturalHeight
  initialX = 0
  initialY = 0

else:
  viewportHeight = viewportMaxHeight
  stageWidth = viewportWidth
  stageHeight = naturalHeight
  initialX = 0
  initialY = (viewportHeight - stageHeight) / 2
```

つまり極端な横長mapは横方向へ、極端な縦長mapは縦方向へ初期scaleからpan可能とする。

Gesture helper:

```js
export function applyRubberBand(value, min, max, overscrollLimit = 32) {}
```

`GestureZoomController`は外部からstage layout/initial transform更新を受けられるようにする。既存`setTransform()`と`refreshLayout()`を無秩序に増やさず、1つの明示メソッドへまとめてよい。

## Steps

- [ ] **Step 1: viewport geometryのRED unit testを書く**

実C108比率と境界caseを固定する。

```ts
it("uses the natural aspect ratio when it fits the interaction range", () => {
  const layout = calculateMapViewportLayout({
    viewportWidth: 390,
    viewportMaxHeight: 520,
    minimumInteractiveHeight: 220,
    imageWidth: 2904,
    imageHeight: 2166,
  });
  expect(layout.viewportHeight).toBeGreaterThan(220);
  expect(layout.stageWidth).toBe(390);
  expect(layout.stageWidth / layout.stageHeight).toBeCloseTo(2904 / 2166);
});

it("covers a minimum-height viewport for an extremely wide map", () => {
  const layout = calculateMapViewportLayout({
    viewportWidth: 390,
    viewportMaxHeight: 520,
    minimumInteractiveHeight: 220,
    imageWidth: 4096,
    imageHeight: 1438,
  });
  expect(layout.viewportHeight).toBe(220);
  expect(layout.stageWidth).toBeGreaterThan(390);
  expect(layout.stageHeight).toBe(220);
  expect(layout.initialX).toBeLessThan(0);
});

it("clips and vertically centers an extremely tall map instead of letterboxing", () => {
  const layout = calculateMapViewportLayout({
    viewportWidth: 390,
    viewportMaxHeight: 520,
    minimumInteractiveHeight: 220,
    imageWidth: 1000,
    imageHeight: 2000,
  });
  expect(layout.viewportHeight).toBe(520);
  expect(layout.stageWidth).toBe(390);
  expect(layout.stageHeight).toBe(780);
  expect(layout.initialY).toBe(-130);
});
```

- [ ] **Step 2: rubber-bandのRED unit testを書く**

```ts
it("limits overscroll and increases resistance outside bounds", () => {
  const slightlyOutside = applyRubberBand(10, -200, 0, 32);
  const farOutside = applyRubberBand(200, -200, 0, 32);
  expect(slightlyOutside).toBeGreaterThan(0);
  expect(farOutside).toBeLessThanOrEqual(32);
  expect(farOutside - slightlyOutside).toBeLessThan(190);
});
```

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/gesture-zoom-controller.test.ts tests/route-map-viewport-layout.test.ts
```

- [ ] **Step 4: DOMをviewport + stageへ整理する**

`#navigation-map`をclip/gesture viewportとし、その直下の`#navigation-map-layer`を実画像比率stageにする。画像、pin layer、route overlayはstage全面を共有する。

画像へ`width:100%; height:100%; object-fit:contain`を使ってletterboxを作らない。stage自体が画像比率を持つ。

- [ ] **Step 5: image load/resizeでlayoutを一度計算して適用する**

`naturalWidth`/`naturalHeight`とviewport幅から`calculateMapViewportLayout()`を呼び、viewport height、stage size、initial transformを更新する。ResizeObserverでも再計算する。

横長cover時はinitialX、縦長clip時はinitialYを中央へ寄せる。area変更時は旧areaのpan/zoomをそのまま持ち越さず、新しいlayoutのbase transformから開始する。

- [ ] **Step 6: gesture hot pathのlayout readを排除する**

pointerdownで必要ならviewport originを1回取得し、そのgesture中はcached geometryを使う。pointermove/pinch move内の`getBoundingClientRect()`を残さない。

- [ ] **Step 7: panへrubber-bandを適用する**

proposed x/yを直接stateへ加算せず、現在scaleに対するmin/max boundsを求め、範囲外だけ`applyRubberBand()`へ通す。release/cancel/lostcaptureは既存settleへ接続する。

stageがviewportより小さくなるscaleは作らない。base scale 1ですでにcoverされるため、MIN_SCALEは1を維持できる設計を優先する。

- [ ] **Step 8: transform pathをcompositor-friendlyに保つ**

stageに`will-change: transform`を付け、transform更新は既存RAF coalescingの1回/描画frameを維持する。filter/box-shadow等をtransform layerへ追加しない。

- [ ] **Step 9: E2Eで横長・通常・縦長を確認する**

- 横長areaでviewport heightが220px以上かつ旧360px固定ではない。
- stage widthがviewportより大きいcaseで初期Xが中央。
- 縦長fixtureではstage heightがviewportより大きく、初期Yが中央。
- 初期表示に不要な薄茶letterboxがない。
- dragでoverscrollが約32pxを大きく超えない。
- release後にbound内へ戻る。
- pointercancel後に次のpanが可能。

- [ ] **Step 10: focused/full verification**

```bash
npx vitest run --root . tests/gesture-zoom-controller.test.ts tests/route-map-viewport-layout.test.ts
npm run test:webapp
npm run test:e2e:ci -- --grep "地図|map"
npm run check:webapp
git diff --check
```

- [ ] **Step 11: commit**

```bash
git add apps/webapp/index.html apps/webapp/css/target.css \
  apps/webapp/js/features/route-guidance/ui \
  apps/webapp/js/utils/gesture-zoom-controller.js tests
git commit -m "fix(map): align viewport and gestures with map geometry"
```

## 受入条件

- E456 4096x1438級の横長地図でもviewportは最低220pxで、地図は縦方向を埋め、横pan可能。
- 自然heightが220〜maxHeightに収まるmapは画像比率どおりのviewportになる。
- maxHeightを超える縦長mapは横幅を埋めたまま縦panでき、左右letterboxを作らない。
- 薄茶色の地図外領域は初期表示にはなく、drag時も最大約32px程度だけ見え、releaseで消える。
- pointermove hot pathにlayout readがない。
- transform反映は1 frame最大1回。
- pin/route/imageの座標がずれない。
