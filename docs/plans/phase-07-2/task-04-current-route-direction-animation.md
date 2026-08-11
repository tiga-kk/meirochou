# Phase 7.2 Task 4: current routeを知覚可能なStart→Goal animationへ修正

## 目標

赤current routeが実機で静止画に見える問題を解消し、StartからGoalへ進む方向を一目で理解できる「ビューン」としたflow cueへする。

## 現状

Phase 7.1では`.route-flow-line`のcomputed `strokeDashoffset`が時間変化することをE2Eで確認した。しかしproduction CSSの見た目はPhase 6.1とほぼ同じで、細い白dashが赤線上を移動するだけなので、実機では動きが知覚しづらい。

## やってはいけないこと

- animationのためにroute pointsを毎frame再計算しない。
- `requestAnimationFrame`でDOM attributeを毎frame更新しない。
- candidate青線へ同じcurrent flowを付けない。
- reduced-motion利用者へ移動animationを強制しない。
- Start/Goalの意味を色だけに依存させない。`S`/`G`文字を維持する。

## 対象ファイル

**変更:**
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/css/target.css`
- `apps/webapp/css/motion.css`
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

## SVG構造

current routeは次のlayer順を固定する。

```text
route-overlay-line      solid red base
route-flow-comet        bright moving short segments
route-flow-direction    static/dynamic direction cue
route-start-marker      S
route-goal-marker       G
```

candidate routeは`route-overlay-line`のみで、既存の青dash contractを維持する。

`route-flow-direction`は実装を単純にするため、polyline終端へSVG marker arrowheadを付けてよい。arrowheadはGoal方向を常時示すため、reduced-motionでも残す。

## CSS contract

目安値は次から開始し、実機previewで微調整してよい。ただし変更した最終値をtest/documentへ固定する。

```css
.route-flow-comet {
  fill: none;
  stroke: rgba(255, 255, 255, 0.96);
  stroke-width: 5;
  stroke-linecap: round;
  stroke-dasharray: 14 72;
  animation: route-flow-comet 0.72s linear infinite;
}

@keyframes route-flow-comet {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -86; }
}
```

必要なら同じpathを0.18s程度ずらしたsecond highlightにしてcomet感を出してよいが、animation layerは最大2本までとする。

Start/Goal:

- `S`: dark circle + white S。
- `G`: dark/primary ring + white G。current route描画直後に1回だけ短いpulseを許可。
- `G`をStartより1〜2px大きくしてよい。

## reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .route-flow-comet { animation: none; }
  .route-goal-marker { animation: none; }
}
```

cometは停止してよいが、arrowheadとS/Gは残す。

## テスト契約

Phase 7.1の「animation-nameが存在」「dashoffsetが変化」だけでは不足とする。

E2Eではcurrent route表示後に少なくとも3時点をsamplingする。

```ts
const offsets = [];
for (let i = 0; i < 3; i += 1) {
  offsets.push(await flow.evaluate((el) => getComputedStyle(el).strokeDashoffset));
  await page.waitForTimeout(180);
}
expect(new Set(offsets).size).toBeGreaterThan(1);
```

さらに:

- flow stroke widthがbaseより細く、opacityが十分高い。
- `marker-end`または`.route-flow-direction`がcurrent routeに存在。
- S/G双方があり、Goal方向cueが存在。
- candidateには`.route-flow-comet`が0件。
- reduced motionではanimation-name `none`、direction cueは残る。

visual testはcurrent route全体のsnapshotを1枚だけ更新し、animation中のランダムframe差分を避けるためsnapshot時はanimationを一時pauseして方向cue/S/Gの静的構造を確認する。

## 手順

- [ ] **Step 1: route overlay contract RED testを変更する**
  - currentにcomet/direction/S/G。
  - candidateにcometなし。

- [ ] **Step 2: unit test REDを確認する**

```bash
npx vitest run --root . tests/route-overlay-contract.test.ts
```

- [ ] **Step 3: SVG layer/markerを実装する**

- [ ] **Step 4: CSSを知覚しやすいcometへ変更する**

- [ ] **Step 5: E2Eを3-sample + direction cueへ強化する**

- [ ] **Step 6: reduced-motion E2Eを維持する**

- [ ] **Step 7: mobile viewportで実機相当確認する**
  - 360〜430px幅。
  - map全体表示時と2倍程度zoom時。
  - 明るい/暗い地図部分の両方でflowが見える。

- [ ] **Step 8: verification**

```bash
npx vitest run --root . tests/route-overlay-contract.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "route flow|経路"
npm run test:webapp
npm run check:webapp
git diff --check
```

## 受入条件

- CSS値だけでなく、人間がStart→Goal方向を視認できる。
- GoalがStartと明確に区別できる。
- candidate blue routeとcurrent red routeを見間違えない。
- reduced-motionでも方向情報を失わない。