# Phase 7.2 Task 7: target/catalog responsive layoutと情報重複解消

## 目標

地図の上下に「次の目的地」が重複して見える問題を解消し、catalog画像を主役にしつつ、portrait/landscape双方で目的地・距離・priority・購入操作を読みやすく配置する。

## 現状

`DomRouteGuidanceView.showNavigation()`は上部summaryへcurrent targetと`targetRouteLog`を描画する一方、`renderTargetDetails()`は下部detailへ`statusLabel`、space、distance等を描画する。Phase 7.1で一部metaを減らしたが、目的地conceptは上下に残っている。

catalog画像は`#tweet-embed-container`へ動的`<img alt="お品書き">`として追加されるため、`naturalWidth/naturalHeight`取得後にorientationを判定できる。

## やってはいけないこと

- portrait/landscapeで別DOM treeを作らない。
- 画像orientationだけで情報の読み上げ順を変えない。
- 360px未満や200% zoomで横2columnを強制しない。
- candidate preview時にcurrent target summaryをcandidateへ上書きしない。
- お品書き画像を固定heightでcropしない。`object-fit: contain`を維持する。
- distanceをweighted routing costへ戻さない。

## 対象ファイル

**作成:**
- `apps/webapp/js/features/route-guidance/ui/catalog-orientation.ts`
- `tests/catalog-orientation.test.ts`

**変更:**
- `apps/webapp/index.html`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/css/target.css`
- `apps/webapp/css/motion.css`
- `tests/navigation-view-model-split.test.ts`
- `tests/e2e/webapp.spec.ts`

## 情報の正本

通常案内中の上部summaryを唯一のnavigation summaryとする。

```text
現在地 東ア10a  →  東ア23a
約120m
```

DOM例:

```html
<div class="navigation-summary" aria-live="polite">
  <span class="navigation-summary-from">現在地 <strong id="target-start-space">...</strong></span>
  <span class="navigation-summary-arrow" aria-hidden="true">→</span>
  <strong id="target-space-heading">...</strong>
  <span id="target-route-log">約120m</span>
</div>
```

`target-route-log`へ`/ 次 ...`のような次々目的地情報を詰め込まない。現在のlegだけを表示する。

地図下部detailでは通常時に次の文言を再掲しない。

- `次の目的地`
- current target space（上部で既に明示済みなら、detailのmetadata titleとして小さく再掲しない）
- current route distance

下部detailの役割はcatalogとactionである。

```text
[ catalog image ]
priority / sheet / account
[購入済] [保留]
```

candidate preview中だけ、下部detailに`変更候補 東ア31b`を明示する。これはcurrent navigation summaryの重複ではなく、preview stateの識別子なので許可する。

## orientation判定

```ts
export type CatalogOrientation = "portrait" | "landscape" | "square" | "none";

export function classifyCatalogOrientation(input: {
  width: number;
  height: number;
  tolerance?: number;
}): CatalogOrientation;
```

規則:

- width/height不正または0 => `none`
- `width / height <= 0.88` => `portrait`
- `width / height >= 1.12` => `landscape`
- それ以外 => `square`

最終thresholdはtestで固定し、CSS側で再計算しない。

`renderTargetDetails()`でimg `load`時に`#next-target`またはdetail rootへ属性を付ける。

```text
data-catalog-orientation="portrait"
data-catalog-orientation="landscape"
data-catalog-orientation="square"
data-catalog-orientation="none"
```

新targetを描画するたび古い属性をresetしてから画像loadを待つ。

## layout contract

単一DOMに次のwrapperを使う。

```html
<div class="target-detail-layout">
  <div class="tweet-preview" id="tweet-embed-container"></div>
  <div class="target-detail-meta">...</div>
  <div class="target-detail-actions">...</div>
</div>
```

### portrait

viewport width >= 360pxかつ通常zoom時:

```css
#next-target[data-catalog-orientation="portrait"] .target-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(118px, 3fr);
  grid-template-areas:
    "catalog meta"
    "catalog actions";
}
```

catalogを概ね70%とし、右30%へmetadata/actionを縦配置する。実機でbutton幅が44px targetを満たせない場合は65/35まで広げてよい。

### landscape / square

画像をfull widthにし、その下にcompact metadata + action rowを置く。

```css
grid-template-columns: 1fr;
grid-template-areas: "catalog" "meta" "actions";
```

### narrow / 200% zoom

```css
@media (max-width: 359px) { /* always stack */ }
```

200% zoom時もhorizontal scrollを発生させないことをPlaywright/axe相当のlayout assertionで確認する。

## candidate previewとの整合

Task 3の`is-route-previewing`中:

- 上部summary: current target/current distanceを維持。
- detail: candidate catalogへ切り替えてよい。
- detail title: `変更候補 東ア31b`。
- candidate distanceをdetail内へ表示してよい。
- blue border/tintを維持。

これにより「今向かっている場所」と「変更候補」を同じ位置で上書きしない。

## 手順

- [ ] **Step 1: information hierarchy RED testを書く**
  - 通常時に`次の目的地`labelがnavigation card内で1箇所以下。
  - current distanceはsummaryに1箇所。
  - candidate時のみ`変更候補`がdetailへ出る。

- [ ] **Step 2: orientation pure testを書く**

```ts
expect(classifyCatalogOrientation({ width: 700, height: 1200 })).toBe("portrait");
expect(classifyCatalogOrientation({ width: 1200, height: 700 })).toBe("landscape");
```

- [ ] **Step 3: `index.html`をsingle detail layoutへ整理する**

- [ ] **Step 4: `showNavigation()`のsummary copyをcurrent legだけへ変更する**
  - `targetRouteLog`からnext-next destinationを除去。

- [ ] **Step 5: `renderTargetDetails()`へorientation lifecycleを追加する**
  - render前`none`。
  - img load後classify。
  - error/placeholderは`none`。

- [ ] **Step 6: portrait/landscape CSSを実装する**

- [ ] **Step 7: E2E fixtureを2種類用意する**
  - portrait catalog 700x1200。
  - landscape catalog 1200x700。

- [ ] **Step 8: visual snapshotを追加する**

```text
navigation-target-portrait-mobile.png
navigation-target-landscape-mobile.png
navigation-target-portrait-200-percent.png
```

- [ ] **Step 9: candidate preview snapshotも1件確認する**
  - current summaryとcandidate detailが同時に区別できる。

- [ ] **Step 10: verification**

```bash
npx vitest run --root . tests/catalog-orientation.test.ts tests/navigation-view-model-split.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "portrait|landscape|目的地|候補"
npm run test:webapp
npm run check:webapp
git diff --check
```

## 受入条件

- 通常案内で「次の目的地」とdistanceが上下に重複しない。
- portrait catalogは画像を主役にしながらmetadata/actionを同時に見られる。
- landscape catalogは無理な細長columnにせずfull-widthを使う。
- DOM/accessibility orderはorientationで変えない。
- candidate previewはcurrent targetと明確に区別できる。