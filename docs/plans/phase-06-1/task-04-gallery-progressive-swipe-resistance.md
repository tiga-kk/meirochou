# Phase 6.1 Task 4: Gallery swipeを非線形抵抗へ変更

## 目標

2列Galleryの外向きスワイプ方向制限と、Phase 6で実際に成立している購入までのfinger travelを維持しつつ、「最初は誤操作しにくく重いが、購入閾値へ近づくと軽くなる」表示追従へ変更する。

## やってはいけないこと

- 左列/右列の許可方向を変えない。
- 現行コードの購入成立距離を「raw delta基準だった」と誤認して短くしない。
- 新しい購入判定を表示translationへ依存させない。
- 一定係数を区間ごとに雑に切り替えて不連続な動きにしない。
- touchmoveごとにDOM geometryを再計算しない。
- 成功前にcardを永続的に削除しないPhase 6契約を壊さない。

## 対象ファイル

**変更:**
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`

**テスト:**
- `tests/gallery-swipe-action.test.ts`
- `tests/e2e/webapp.spec.ts`

## 現行Phase 6の成立距離

現行`setupSwipeAction()`は次の順で判定している。

```text
currentX = rawDelta * 0.6
visualThreshold = max(minimumThreshold ?? 100, min(cardWidth * 0.4, 180))
purchase if abs(currentX) > visualThreshold
```

したがって、Phase 6で実際に必要なfinger travelは次である。

```text
purchaseTriggerDistance = visualThreshold / 0.6
```

Phase 6.1では表示translationだけを非線形化し、この`purchaseTriggerDistance`を短くしない。新実装の購入判定はraw finger movementを使うが、閾値値そのものは上式で現行挙動と等価にする。

## インターフェース

```js
export function calculateSwipeTranslation(rawDelta, triggerDistance) {
  // signed display translation in px
}
```

要求する性質:

```text
ratio at small movement      ≈ 0.25-0.35
ratio around half trigger    ≈ 0.45-0.65
ratio near trigger           ≈ 0.85-0.95
```

`abs(rawDelta)`が増えるほど`abs(translation)`は単調増加する。符号は保持する。

## 手順

- [ ] **Step 1: 現行の実効購入閾値をRED testで固定する**

代表的なcard widthについて、旧実装の成立条件`abs(rawDelta * 0.6) > visualThreshold`と新しいraw thresholdが同じfinger travelを要求することを固定する。

```ts
const visualThreshold = Math.max(100, Math.min(width * 0.4, 180));
const purchaseTriggerDistance = visualThreshold / 0.6;

expect(purchaseTriggerDistance * 0.6).toBeCloseTo(visualThreshold);
```

境界は現行どおりstrict `>`を維持する。ちょうど閾値では購入せず、それを超えたときだけ購入するtestを追加する。

- [ ] **Step 2: pure translation functionのRED testを書く**

```ts
it("starts resistant and becomes progressively lighter", () => {
  const trigger = 180;
  const t20 = Math.abs(calculateSwipeTranslation(20, trigger));
  const t90 = Math.abs(calculateSwipeTranslation(90, trigger));
  const t170 = Math.abs(calculateSwipeTranslation(170, trigger));

  expect(t20 / 20).toBeLessThan(0.4);
  expect(t90 / 90).toBeGreaterThan(t20 / 20);
  expect(t170 / 170).toBeGreaterThan(t90 / 90);
  expect(t170 / 170).toBeLessThanOrEqual(0.95);
});
```

負方向でも対称になるtestを追加する。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/gallery-swipe-action.test.ts
```

- [ ] **Step 4: 単一の連続式を実装する**

推奨はnormalized progress `p = clamp(abs(rawDelta)/triggerDistance, 0, 1)`からsmoothstep等でratioを補間する方法。

```js
const eased = p * p * (3 - 2 * p);
const ratio = 0.28 + (0.9 - 0.28) * eased;
return Math.sign(rawDelta) * Math.abs(rawDelta) * ratio;
```

係数はtestと実機操作で微調整してよいが、開始重め・終盤軽め・連続・単調増加の性質は変えない。

- [ ] **Step 5: `setupSwipeAction()`へ接続する**

Phase 6のallowed direction、axis lock、callback onceを維持する。

`touchstart`時にcard widthから現行`visualThreshold`を一度計算し、`purchaseTriggerDistance = visualThreshold / 0.6`をcacheする。touchmoveでは表示transformだけ`calculateSwipeTranslation(rawDelta, purchaseTriggerDistance)`へ置き換える。

`touchend`の購入判定は次へ変更する。

```text
permitted && abs(rawDelta) > purchaseTriggerDistance
```

これは判定の入力をraw finger movementへ整理する変更であって、ユーザーが購入成立までに動かす実距離を短くする変更ではない。

- [ ] **Step 6: opacity等のfeedbackもraw progressへ合わせる**

「購入直前」を表すfeedbackが必要なら`abs(rawDelta) / purchaseTriggerDistance`を使う。非線形translationがたまたま旧`visualThreshold`を超えたことを購入可否やfeedbackの正本にしない。

- [ ] **Step 7: geometry readをgesture startへ寄せる**

triggerDistanceに必要なcard widthはtouchstart時に1回取得し、touchmoveではcached triggerを使う。

- [ ] **Step 8: E2Eで方向・成立距離・購入を再確認する**

- 左cardの右向き、右cardの左向きが購入を発生させない。
- 正しい外向きswipeで購入が1回だけ発生する。
- Phase 6の旧実装では購入しなかった短いraw movementで、Phase 6.1だけ購入が成立しない。
- purchase triggerを少し超えたraw movementで成立する。

- [ ] **Step 9: focused/full verification**

```bash
npx vitest run --root . tests/gallery-swipe-action.test.ts
npm run test:webapp
npm run test:e2e:ci -- --grep "一覧|スワイプ"
git diff --check
```

- [ ] **Step 10: commit**

```bash
git add apps/webapp/js/utils/gesture-zoom-controller.js \
  apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts \
  tests/gallery-swipe-action.test.ts tests/e2e/webapp.spec.ts
git commit -m "fix(gallery): ease swipe resistance toward purchase threshold"
```

## 受入条件

- swipe開始時はPhase 6より明確に重い。
- purchase trigger付近ではPhase 6の一定0.6より表示追従が軽く感じる。
- 正しい外向き方向制限は維持される。
- Phase 6と同じcard width/configなら、購入成立に必要なraw finger movementは実質同じである。
- 購入判定はraw finger movementと等価化した`purchaseTriggerDistance`で行い、display translationには依存しない。
- touchmove hot pathでcard widthを再読込しない。
