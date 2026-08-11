# Phase 7.1 Task 3: map pan physics・bounds・inertia再設計

## 目標

地図panを「bounds内は指へ1:1追従」「release後は直近の移動履歴から自然に慣性移動」「bounds外dragだけ柔らかく抵抗」「release後は必ず地図内へ戻る」に統一する。同時にC108全areaで地図の四辺へ確実に到達できることをtest contractにする。

## やってはいけないこと

- GestureZoomController全体を地図libraryへ置換しない。
- pointermoveごとに`getBoundingClientRect()`、image natural size取得等のlayout readを追加しない。
- bounds内dragへ常時摩擦を掛けない。
- 最後の1回の`dx/dy`だけをrelease velocityとして使い続けない。
- frame rate固定の`vx *= 0.92`だけで時間経過を表現しない。
- inertiaがbounds外を走り続けてからbounceする挙動にしない。
- pointer release後にRAFが永久に残る設計へ戻さない。
- pinch/route fit/resizeの既存挙動を未検証のまま変更しない。

## 対象ファイル

**作成:**
- `apps/webapp/js/utils/gesture-pan-physics.js`
- `tests/gesture-pan-physics.test.ts`

**変更:**
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`（bounds/fit pure helperが必要な場合のみ）
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`（layout接続が必要な場合のみ）
- `tests/gesture-zoom-controller.test.ts`
- `tests/route-map-viewport-layout.test.ts`
- `tests/e2e/webapp.spec.ts`

## 新規pure interface

`gesture-pan-physics.js`はDOMへ依存しない。

```js
export const DEFAULT_PAN_PHYSICS = {
  velocityWindowMs: 100,
  minReleaseSpeedPxPerMs: 0.05,
  maxReleaseSpeedPxPerMs: 1.8,
  decelerationPxPerMs2: 0.0028,
  overscrollLimitPx: 24,
  settleDurationMs: 180,
};

export function calculatePanBounds({
  containerWidth,
  containerHeight,
  stageWidth,
  stageHeight,
  scale,
  baseX,
  baseY,
}) {
  return {
    x: { min, max },
    y: { min, max },
  };
}

export function applyElasticOverscroll(value, { min, max }, limitPx) {}

export function calculateReleaseVelocity(
  samples,
  nowMs,
  windowMs,
  maxSpeedPxPerMs,
) {
  return { vx, vy };
}

export function stepPanInertia({
  x,
  y,
  vx,
  vy,
  dtMs,
  bounds,
  decelerationPxPerMs2,
}) {
  return { x, y, vx, vy, done };
}
```

sample:

```js
{ x: number, y: number, timeMs: number }
```

`calculateReleaseVelocity()`は`nowMs - velocityWindowMs`以降の複数sampleから最古/最新のposition差とtime差を使う。2点未満または時間差0なら`{vx:0, vy:0}`を返す。vector速度全体を`maxReleaseSpeedPxPerMs`へclampする。

## bounds contract

scale後stageがviewportより大きい軸:

```text
max = 0
min = containerSize - stageSize * scale
```

stageがviewportより小さい軸は、その軸の`baseX/baseY`へ固定する。

ただし既存layoutがbase transformを含むため、実装時には`calculateMapViewportLayout()`の`initialX/initialY`と合わせ、scale=1のcentered startから左右/上下の端へ完全に移動できることをtestで確定する。式だけを先に正しいと決めず、C108比率testを正本にする。

## 手順

- [ ] **Step 1: pure bounds RED testsを書く**

`tests/gesture-pan-physics.test.ts`に最低限次を追加する。

```ts
it("aligns both horizontal edges for a wide stage", () => {
  const bounds = calculatePanBounds({
    containerWidth: 390,
    containerHeight: 220,
    stageWidth: 627,
    stageHeight: 220,
    scale: 1,
    baseX: (390 - 627) / 2,
    baseY: 0,
  });
  expect(bounds.x.max).toBe(0);
  expect(bounds.x.min).toBe(390 - 627);
});
```

同様にtall stage、viewportより小さい軸、scale>1を追加する。

- [ ] **Step 2: C108 regression testを追加する**

`e456/e7/s12/w12`の実image比率とmobile viewport幅を使い、scale=1で必要なpan軸の両端がreachableであることを固定する。

最低限`e456`ではleft/right、縦長areaではtop/bottomを確認する。

- [ ] **Step 3: elastic overscroll RED testsを書く**

contract:

```ts
expect(applyElasticOverscroll(10, { min: -200, max: 0 }, 24)).toBeGreaterThan(0);
expect(applyElasticOverscroll(10, { min: -200, max: 0 }, 24)).toBeLessThanOrEqual(24);
expect(applyElasticOverscroll(-100, { min: -200, max: 0 }, 24)).toBe(-100);
```

bounds内は完全1:1、bounds外だけ非線形抵抗になることを明示する。

- [ ] **Step 4: release velocity RED testsを書く**

100ms window内の複数sampleからvelocityを求める。

```ts
const velocity = calculateReleaseVelocity([
  { x: 0, y: 0, timeMs: 0 },
  { x: 30, y: 0, timeMs: 40 },
  { x: 80, y: 0, timeMs: 90 },
], 100, 100, 1.8);
expect(velocity.vx).toBeGreaterThan(0.7);
```

release直前の最後のdeltaが小さくても、それ以前のsampleを含む速度が残るcaseを必ず追加する。

- [ ] **Step 5: dtベースinertia RED testsを書く**

16ms step×複数回と32ms step×半分の回数で、同程度の総時間後のpositionが許容誤差内になることを確認する。frame count固定physicsへ戻らないためのtestである。

またinertiaがboundsへ到達した場合、positionをboundsにclampし、その軸velocityを0にする。

- [ ] **Step 6: pure moduleを最小実装する**

`DEFAULT_PAN_PHYSICS`を唯一の初期parameter正本にする。controller内へ同じ数値literalを重複させない。

- [ ] **Step 7: GestureZoomControllerへsample bufferを接続する**

pointerdown:

- 既存inertia/settleをcancel。
- layout readは現在どおりdrag開始時だけ。
- sample bufferを現在position/timeで初期化。

pointermove(single pointer):

- `dx/dy`をそのままstateへ加算。
- bounds内は1:1。
- bounds外のみ`applyElasticOverscroll()`。
- transform updateを1 RAFへcoalesce。
- `{state.x,state.y,event.timeStamp}`をsample bufferへ追加し、100msより古いsampleを捨てる。

pointerup:

- `calculateReleaseVelocity()`を呼ぶ。
- bounds外ならinertiaではなくsettleを開始。
- bounds内ならmin speed以上の時だけinertia開始。

- [ ] **Step 8: inertia loopをtime-basedへ変更する**

`requestAnimationFrame(timestamp)`のtimestamp差から`dtMs`を算出する。極端なbackground復帰でjumpしないよう、1 stepの`dtMs`は最大32msへclampしてよい。

`stepPanInertia()`が`done`を返したらRAFを再登録しない。

- [ ] **Step 9: bounds外releaseのsettleを実装する**

`settleDurationMs=180`を使用し、release時positionからnearest boundsへ`easeOutCubic`相当で戻す。

```js
const eased = 1 - Math.pow(1 - progress, 3);
```

settle中にpointerdownされたら即cancelする。完了時はpositionをexact boundaryへsnapし、RAFをnullにする。

- [ ] **Step 10: pinch/wheel/route fitをboundsへ統一する**

- pinch scale後のx/yも同じbounds helperを使う。
- wheel zoom後のx/yもboundsを満たす。
- `setTransform()`でroute fit transformを入れる時は、scale適用後boundsへclampする。
- `reset()`はbase transformを維持する。

- [ ] **Step 11: controller regression testsを更新する**

最低限:

- bounds内drag 40px → stateも40px動く。
- 最後のpointer deltaが小さくてもrelease後にinertia継続。
- inertiaは数frame後も移動し、その後停止。
- left/right/top/bottom edgeで外へ止まらない。
- elastic overscrollは24px以下。
- settle終了後`rafId === null`。
- pointerdownでinertia cancel。
- pinch後もbounds内。
- same layout再適用でtransform保持。

- [ ] **Step 12: E2Eで実地図端と慣性を固定する**

`tests/e2e/webapp.spec.ts`でe456等を表示し、pointer dragにより左端/右端が到達可能であることをtransform/element boxから確認する。

release後100〜200msにtransformがrelease時から追加移動し、その後停止することを確認する。pixel完全一致ではなく、方向と停止をcontractにする。

- [ ] **Step 13: performance確認**

pointermove中に`getBoundingClientRect()`が毎event呼ばれない既存unit testを維持する。可能なら20回pointermoveでlayout read回数がdrag開始時の1回のままであることをassertする。

- [ ] **Step 14: verification**

```bash
npx vitest run --root . tests/gesture-pan-physics.test.ts tests/gesture-zoom-controller.test.ts tests/route-map-viewport-layout.test.ts
npm run test:webapp
npx playwright test tests/e2e/webapp.spec.ts --grep "地図|map|pan|慣性"
npm run check:webapp
git diff --check
```

- [ ] **Step 15: commit**

```bash
git status --short
git add apps/webapp/js/utils/gesture-pan-physics.js apps/webapp/js/utils/gesture-zoom-controller.js tests/gesture-pan-physics.test.ts tests/gesture-zoom-controller.test.ts <実際に変更したviewport/map/E2E files>
git diff --cached --name-status
git diff --cached --check
git commit -m "fix(map): make pan bounds and inertia feel natural"
```

## 受入条件

- bounds内panは常に1:1。
- velocityは直近100msの複数sampleから算出する。
- inertiaはdtベースでframe frequency差へ過度に依存しない。
- initial max speed 1.8px/ms、deceleration 0.0028px/ms²、overscroll 24px、settle 180msを一箇所で調整できる。
- C108各areaで全端へ到達できる。
- bounds外へreleaseしても地図外で停止しない。
- idle時にRAFが残らない。
- pinch/wheel/route fitの既存機能が回帰しない。
