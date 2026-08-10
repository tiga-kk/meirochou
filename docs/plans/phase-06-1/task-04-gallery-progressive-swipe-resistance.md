# Phase 6.1 Task 4: Gallery swipeを非線形抵抗へ変更

## 目標

2列Galleryの外向きスワイプ方向制限を維持しつつ、「最初は誤操作しにくく重いが、購入閾値へ近づくと軽くなる」操作感へ変更する。

## やってはいけないこと

- 左列/右列の許可方向を変えない。
- 購入判定を表示translationに依存させない。
- 一定係数を区間ごとに雑に切り替えて不連続な動きにしない。
- touchmoveごとにDOM geometryを再計算しない。
- 成功前にcardを永続的に削除しないPhase 6契約を壊さない。

## Files

**Modify:**
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`

**Test:**
- `tests/gallery-swipe-action.test.ts`
- `tests/e2e/webapp.spec.ts`

## Interfaces

```js
export function calculateSwipeTranslation(rawDelta, triggerDistance) {
  // signed translation in px
}
```

要求する性質:

```text
ratio at small movement      ≈ 0.25-0.35
ratio around half threshold  ≈ 0.45-0.65
ratio near trigger threshold ≈ 0.85-0.95
```

`abs(rawDelta)`が増えるほど`abs(translation)`は単調増加する。符号は保持する。

## Steps

- [ ] **Step 1: pure functionのRED testを書く**

```ts
it("starts resistant and becomes progressively lighter", () => {
  const trigger = 140;
  const t20 = Math.abs(calculateSwipeTranslation(20, trigger));
  const t70 = Math.abs(calculateSwipeTranslation(70, trigger));
  const t130 = Math.abs(calculateSwipeTranslation(130, trigger));

  expect(t20 / 20).toBeLessThan(0.4);
  expect(t70 / 70).toBeGreaterThan(t20 / 20);
  expect(t130 / 130).toBeGreaterThan(t70 / 70);
  expect(t130 / 130).toBeLessThanOrEqual(0.95);
});
```

負方向でも対称になるtestを追加する。

- [ ] **Step 2: REDを確認する**

```bash
npx vitest run --root . tests/gallery-swipe-action.test.ts
```

- [ ] **Step 3: 単一の連続式を実装する**

推奨はnormalized progress `p = clamp(abs(rawDelta)/triggerDistance, 0, 1)`からsmoothstep等でratioを補間する方法。

```js
const eased = p * p * (3 - 2 * p);
const ratio = 0.28 + (0.9 - 0.28) * eased;
return Math.sign(rawDelta) * Math.abs(rawDelta) * ratio;
```

係数はtestと実機操作で微調整してよいが、開始重め・終盤軽め・連続・単調増加の性質は変えない。

- [ ] **Step 4: `setupSwipeAction()`へ接続する**

Phase 6の`raw delta`、allowed direction、axis lock、callback once、threshold判定を維持する。表示transformだけ`calculateSwipeTranslation()`へ置き換える。

- [ ] **Step 5: geometry readをgesture startへ寄せる**

triggerDistanceに必要なcard widthはtouchstart時に1回取得し、touchmoveではcached triggerを使う。

- [ ] **Step 6: E2Eで方向と購入を再確認する**

左cardの右向き、右cardの左向きが購入を発生させないこと、正しい外向きswipeで購入が1回だけ発生することを維持する。

- [ ] **Step 7: focused/full verification**

```bash
npx vitest run --root . tests/gallery-swipe-action.test.ts
npm run test:webapp
npm run test:e2e:ci -- --grep "一覧|スワイプ"
git diff --check
```

- [ ] **Step 8: commit**

```bash
git add apps/webapp/js/utils/gesture-zoom-controller.js \
  apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts \
  tests/gallery-swipe-action.test.ts tests/e2e/webapp.spec.ts
git commit -m "fix(gallery): ease swipe resistance toward purchase threshold"
```

## 受入条件

- swipe開始時はPhase 6より明確に重い。
- trigger付近ではPhase 6の一定0.6より軽く感じる。
- 正しい外向き方向制限は維持される。
- 購入判定distance自体はraw finger movement基準のまま。
- touchmove hot pathでcard widthを再読込しない。
