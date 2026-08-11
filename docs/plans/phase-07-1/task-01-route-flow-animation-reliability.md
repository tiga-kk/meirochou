# Phase 7.1 Task 1: current route flow animationの実動検証と修正

## 目標

current routeの赤いbase route上にあるflow表現を、`prefers-reduced-motion: no-preference`環境では実際に時間変化して見える状態へする。CSSに`animation-name`が設定されているだけで完了扱いしない。

## やってはいけないこと

- route計算、Dijkstra、ALNSをanimation frameごとに再実行しない。
- route SVGをanimation frameごとに再生成しない。
- `setInterval`や常駐JavaScript timerでdash offsetを更新しない。
- candidate routeへcurrent routeと同じloop animationを追加しない。
- reduced motion利用者へ常時flow animationを強制しない。
- 原因を再現せず、無条件に別animation方式へ全面置換しない。

## 対象ファイル

**変更候補:**
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `tests/e2e/webapp.spec.ts`
- `tests/route-planner-contract.test.ts`

**原則変更しない:**
- `grid-route-planner.ts`
- optimization関連file

## 現行interface

current route overlayは次を維持する。

```html
<svg data-route-kind="current">
  <polyline class="route-overlay-line" />
  <polyline class="route-flow-line" />
  <g class="route-endpoint route-start-marker">...</g>
  <g class="route-endpoint route-goal-marker">...</g>
</svg>
```

`route-flow-line.points`は`route-overlay-line.points`と同一順序で、`route.points[0]`がStart、末尾がGoalであることを変えない。

## 手順

- [ ] **Step 1: no-preferenceでdash offsetの時間変化を測るRED E2Eを追加する**

`tests/e2e/webapp.spec.ts`のroute表示flowで、current route表示後に次を確認する。

```ts
await page.emulateMedia({ reducedMotion: "no-preference" });
const flow = page.locator('[data-route-kind="current"] .route-flow-line');
await expect(flow).toBeVisible();

const before = await flow.evaluate((element) =>
  getComputedStyle(element).strokeDashoffset,
);
await page.waitForTimeout(300);
const after = await flow.evaluate((element) =>
  getComputedStyle(element).strokeDashoffset,
);
expect(after).not.toBe(before);
```

`animation-name`だけではなくcomputed valueが変わることを固定する。

- [ ] **Step 2: reduced motion contractを同じE2Eで固定する**

```ts
await page.emulateMedia({ reducedMotion: "reduce" });
await expect(flow).toHaveCSS("animation-name", "none");
await expect(page.locator('.route-start-marker')).toHaveText("S");
await expect(page.locator('.route-goal-marker')).toHaveText("G");
```

- [ ] **Step 3: focused E2Eを実行して現行挙動を分類する**

```bash
npx playwright test tests/e2e/webapp.spec.ts --grep "地図|経路|route"
```

分類:

1. computed dash offsetも変化しない → CSS animation適用経路を修正する。
2. computed dash offsetは変化する → 実装は動いているが視認性不足。Step 4のvisual調整だけを行う。
3. Chromiumでは変化するがproduction mobileで再現しない → browser差を記録し、同じCSS/SVG方式で互換な指定へ修正する。

- [ ] **Step 4: flowを視認可能な初期値へ調整する**

最初の候補:

```css
.route-flow-line {
  stroke: rgba(255, 255, 255, 0.92);
  stroke-width: 5;
  stroke-dasharray: 12 28;
  stroke-dashoffset: 0;
  animation: route-flow 0.8s linear infinite;
}

@keyframes route-flow {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -40; }
}
```

経路pointsは逆順にしない。視覚上の流れがGoal→Startに見える場合は`stroke-dashoffset`の符号だけを反転する。

- [ ] **Step 5: route overlay unit contractを確認する**

`tests/route-planner-contract.test.ts`でcurrent routeのみflow lineを持ち、candidate routeは持たないこと、S/Gがpointsの先頭/末尾に一致することを維持する。

- [ ] **Step 6: focused verification**

```bash
npx vitest run --root . tests/route-planner-contract.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "地図|経路|route"
npm run check:webapp
git diff --check
```

- [ ] **Step 7: commit**

```bash
git status --short
git add apps/webapp/css/target.css apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts tests/e2e/webapp.spec.ts tests/route-planner-contract.test.ts
git diff --cached --name-status
git diff --cached --check
git commit -m "fix(route-guidance): make route flow visibly animate"
```

実際に変更していないfileは`git add`対象から外す。

## 受入条件

- no-preferenceでcomputed `stroke-dashoffset`が300ms前後で変化する。
- current routeがStart→Goalへ流れて見える。
- reduced motionではloopが停止する。
- solid routeとS/Gはmotion設定に関係なく表示される。
- candidate routeは常時loopしない。
- route calculation回数がanimationによって増えない。
