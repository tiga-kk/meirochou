# Phase 7.1 Task 5: 分離可能なmotion experiment群

## 目標

操作理解と状態feedbackを補助する短いmotionを複数導入し、好みに合わない演出を後から個別に削除できるよう、animation定義を`motion.css`へ隔離する。常時動く装飾を増やすことは目的にしない。

## やってはいけないこと

- motion libraryを追加しない。
- animationのためだけにglobal state storeを追加しない。
- `width`、`height`、`top`、`left`等を毎frame animateしてlayout負荷を増やさない。
- 購入/保留等の操作をanimation完了までblockしない。
- 同じ画面で多数のelementを長時間stagger animationしない。
- reduced motion時に大きなtranslate/scaleやloopを残さない。
- Task 1のroute flow definitionを`motion.css`へ移して責務を混ぜない。route flowはroute表示の必須表現として`target.css`に残す。

## 対象ファイル

**作成:**
- `apps/webapp/css/motion.css`

**変更:**
- `apps/webapp/index.html`（`motion.css`を最後に読み込む）
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/components/comipath-settings.ts`（Task 4でwrapper未追加の場合のみ）
- `apps/webapp/js/components/async-operation-indicator.ts`
- `apps/webapp/css/gallery.css`（animation定義を移す場合）
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/management.spec.ts`
- Gallery/indicatorの既存unit test

## CSS分離contract

`index.html`で既存CSSの後に読み込む。

```html
<link rel="stylesheet" href="./css/motion.css" />
```

`motion.css`は次のsectionを明確に分ける。

```css
/* Experiment A: gallery swipe hint */
/* Experiment B: management entry */
/* Experiment C: purchase/hold feedback */
/* Experiment D: route endpoint emphasis */
/* Experiment E: async completion */
/* Reduced motion overrides */
```

各experimentは専用class名で有効になる。別experimentのselectorへ依存させない。

## Experiment A: Gallery初回swipe hint

現行の`← →`文字間隔pulseを、実際の横swipeを模倣する短いdemoへ変える。

markup例:

```html
<div class="gallery-swipe-hint">
  <strong>外側へスワイプして購入済みにできます</strong>
  <div class="gallery-swipe-hint-demo" aria-hidden="true">
    <span class="gallery-swipe-hint-card"></span>
    <span class="gallery-swipe-hint-arrow">→</span>
  </div>
</div>
```

cardは0→14px→0→-14px→0程度を1〜2回だけ動く。全animationは約1.6秒以内で終了し、hint自体は現行どおり最大約3.5秒で消えてよい。

localStorage key `comipath:ui:v1:gallery-swipe-hint-seen`は維持する。初回だけ自動表示し、tapで即dismissできる。

## Experiment B: management entry

Task 4でbackgroundはopen直後から完全opaqueにする。animateするのは`.management-surface-content`だけ。

初期値:

```css
#settings-area.show .management-surface-content {
  animation: management-enter 200ms cubic-bezier(.2,.8,.2,1) both;
}

@keyframes management-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

背景opacityはanimateしない。

## Experiment C: purchase/hold feedback

既にGallery itemには`.is-purchasing`がある。新しいJS stateを作らず、このclassへ短いvisual feedbackを付ける。

```css
.gallery-item.is-purchasing {
  animation: gallery-purchase-feedback 180ms ease-out both;
}
```

大きく飛ばさず、scale 1→0.97程度とopacityの軽い変化に留める。action完了処理自体を待たせない。

mainの`購入済`/`保留`buttonについて既存press feedbackが十分なら重複追加しない。

## Experiment D: route endpoint emphasis

`buildRouteOverlaySvg()`はroute更新ごとにS/G markerを新規生成するため、`.route-endpoint`へ一回だけ200ms前後の軽いscale/opacity emphasisを適用できる。

常時loopさせない。route flow loopとは別物として扱う。

## Experiment E: async completion

`async-operation-indicator`のsuccess/error出現とsuccess消失を短いopacity/translateで補助する。successの1500ms auto-hide contractは変えない。

## reduced motion

`motion.css`末尾で一括overrideする。

```css
@media (prefers-reduced-motion: reduce) {
  .gallery-swipe-hint-demo,
  #settings-area.show .management-surface-content,
  .gallery-item.is-purchasing,
  .route-endpoint,
  .async-operation-indicator.success,
  .async-operation-indicator.error {
    animation: none !important;
    transform: none !important;
  }
}
```

必要なstatusはtext/solid visualで残ること。

## 手順

- [ ] **Step 1: `motion.css`が独立loadされるRED testを追加する**

public tree/buildで`css/motion.css`が存在し、indexから参照されることを確認する。Vite buildで通常CSS assetとしてhashされる構成なら、既存build方式に合わせてimport先を調整する。

- [ ] **Step 2: Gallery hint markup/testを更新する**

初回openでhintが1個表示され、`.gallery-swipe-hint-demo`が存在し、no-preferenceでanimation-nameを持つことを確認する。

二回目openではhintが自動表示されない既存contractを維持する。

- [ ] **Step 3: Gallery hintを実swipe模倣へ変更する**

`letter-spacing`の往復を主motionにしない。`transform: translateX()`中心へ変更する。

- [ ] **Step 4: management entry animationを追加する**

Task 4のopaque surface contractを壊さず、contentだけを200ms程度animateする。open直後の最初のframeでもcornerからmainが見えないことをTask 4 E2Eで再確認する。

- [ ] **Step 5: purchase feedbackを追加する**

`.is-purchasing`の既存lifecycleだけを使用する。JSに`setTimeout`を新設してclassを管理しない。

- [ ] **Step 6: route marker one-shot emphasisを追加する**

`.route-endpoint`生成時に自動で一度再生されるCSS animationとし、current routeの更新時だけ自然に再生されることを確認する。

- [ ] **Step 7: async completion animationを追加する**

status transitionの既存timerを変えず、CSSだけでenter/exitの視覚feedbackを追加する。exitを本当にanimateするためDOM保持時間を増やす必要があるなら、1500ms contractを変えない範囲で最小変更し、その理由をtestへ固定する。

- [ ] **Step 8: reduced motion E2Eを追加する**

```ts
await page.emulateMedia({ reducedMotion: "reduce" });
```

Gallery hint textは表示されてもdemo motionは停止する。managementは即表示される。S/G、status text、purchase stateは失われない。

- [ ] **Step 9: animation performanceを確認する**

新規keyframesが`transform`/`opacity`中心であることをreviewし、layout property animationを導入していないことを確認する。

- [ ] **Step 10: verification**

```bash
npm run test:webapp
npx playwright test tests/e2e/webapp.spec.ts tests/e2e/management.spec.ts --grep "swipe|管理|motion|reduced|購入"
npm run build:webapp
node scripts/audit-public-tree.mjs
npm run check:webapp
git diff --check
```

- [ ] **Step 11: commit**

```bash
git status --short
git add apps/webapp/css/motion.css apps/webapp/index.html apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts <実際に変更したcomponent/test>
git diff --cached --name-status
git diff --cached --check
git commit -m "feat(ui): add isolated motion feedback experiments"
```

## 受入条件

- Gallery初回hintが実際の横swipeを短いmotionで示す。
- hintは一度だけ自動表示される。
- management content、purchase、route marker、async statusに短いfeedbackが追加される。
- animation定義は原則`motion.css`へ集約される。
- 各experimentが別classで独立し、個別削除できる。
- reduced motionでは非必須animationが停止/縮小する。
- animationのためにoperation完了を遅らせない。
