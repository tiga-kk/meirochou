# Phase 7.1 Task 1: current route flowの実動検証と最小修正

## 目標

current routeの赤いsolid route上にあるflow表現について、`prefers-reduced-motion: no-preference`で実際に時間変化していることを検証し、実機で静止して見えた原因だけを最小修正する。CSSに`animation-name`が存在するだけでは完了扱いしない。

## やってはいけないこと

- route計算、Dijkstra、ALNSをanimation frameごとに再実行しない。
- route SVGをanimation frameごとに再生成しない。
- `setInterval`等の常駐JavaScript timerでdash offsetを更新しない。
- candidate routeへcurrent routeと同じloop animationを追加しない。
- reduced motion利用者へloop animationを強制しない。
- 原因を再現せず、別animation方式や`route-overlay-svg.ts`を無条件に変更しない。
- 視認性調整値を計画書の候補値どおりにすること自体を目的にしない。

## 対象ファイル

**まず確認:**
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `tests/e2e/webapp.spec.ts`
- `tests/route-planner-contract.test.ts`

**変更候補:**
- 原則として`apps/webapp/css/target.css`と、必要なE2E/testだけ。
- `route-overlay-svg.ts`はcurrent routeのflow polyline生成やS/Gの構造に実際の不具合がある場合だけ変更する。

## 維持する表示契約

current route overlayは次を維持する。

```html
<svg data-route-kind="current">
  <polyline class="route-overlay-line" />
  <polyline class="route-flow-line" />
  <g class="route-endpoint route-start-marker">...</g>
  <g class="route-endpoint route-goal-marker">...</g>
</svg>
```

`route-flow-line.points`はbase lineと同じ順序で、`route.points[0]`がStart、末尾がGoalである。candidate routeはflow lineとS/Gを持たない現行契約を維持する。

## 手順

- [ ] **Step 1: no-preferenceで時間変化を証明するRED E2Eを追加する**

current route表示後に初期`strokeDashoffset`を取得し、その後は固定300msの一点比較だけに依存せず、最大約1秒の範囲でcomputed valueが変化することをpollする。

概念例:

```ts
await page.emulateMedia({ reducedMotion: "no-preference" });
const flow = page.locator('[data-route-kind="current"] .route-flow-line');
await expect(flow).toBeVisible();
const before = await flow.evaluate((element) =>
  getComputedStyle(element).strokeDashoffset,
);
await expect
  .poll(() =>
    flow.evaluate((element) => getComputedStyle(element).strokeDashoffset),
  )
  .not.toBe(before);
```

animation durationの将来調整によって偶然同じ位相を測るtestにしない。

- [ ] **Step 2: reduced motion契約を固定する**

`reduce`ではflow loopが停止し、solid routeとS/Gが残ることを確認する。S/Gの存在だけでなくcurrent route自体が可視であることも確認する。

- [ ] **Step 3: focused E2Eを実行して現行挙動を分類する**

```bash
npx playwright test tests/e2e/webapp.spec.ts --grep "地図|経路|route"
```

分類:

1. computed dash offsetも変化しない → CSS適用経路、SVG property、media queryを調査して修正する。
2. computed dash offsetは変化するが実画面では静止して見える → animation方式は維持し、dash間隔・線幅・速度・コントラストのうち必要最小限を調整する。
3. Chromiumでは成立するが対象mobile browserだけ再現しない → browser差を再現できる根拠を残し、同じCSS/SVG方式の範囲で互換な指定へ直す。

- [ ] **Step 4: 視認性を必要最小限だけ調整する**

現行値を出発点にする。`stroke-dasharray`、`stroke-width`、duration、`stroke-dashoffset`終点は実画面でStart→Goal方向が識別できる範囲で調整してよいが、計画時の特定数値を受入条件にはしない。

経路pointsを逆順にしない。方向だけが逆に見える場合はdash offsetの符号を確認する。

- [ ] **Step 5: overlay構造の回帰を確認する**

既存testで、current routeのみflow lineを持つこと、candidate routeは持たないこと、S/Gがpointsの先頭/末尾へ対応することを維持する。不足するassertionだけ追加し、同じ構造testを重複させない。

- [ ] **Step 6: focused verification**

```bash
npx vitest run --root . tests/route-planner-contract.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "地図|経路|route"
npm run check:webapp
git diff --check
```

- [ ] **Step 7: commit**

実際に変更したfileだけをstageしてcommitする。CSSだけで修正できた場合に`route-overlay-svg.ts`を触らない。

## 受入条件

- no-preferenceでcomputed `stroke-dashoffset`が実時間で変化する。
- current routeがStart→Goal方向のflowとして視認できる。
- reduced motionではloopが停止し、solid routeとS/Gが残る。
- candidate routeは常時loopしない。
- route calculation回数やroute SVG生成回数がanimation timerによって増えない。
