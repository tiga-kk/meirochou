# Phase 7.6 Task 8: gallery順を単純化しwall anchor補正とsale warningを追加

## 目的

galleryのpriority sortを廃止し、priorityは既存filterとcard表示だけに残す。通常サークルは従来space順、壁サークルはTask 7の`W_*`分類を使って同一areaの最寄りnon-wall point位置へsort上だけanchorする。

同時に、Task 6のsale mentionをgallery cardにも小さい`完売関連`badgeとして表示する。full X timelineは追加しない。

## 対象外

- priority filter削除。
- priority表示削除。
- galleryをALNS順/route距離順へすること。
- Dijkstra/grid距離によるgallery sort。
- `Circle.space` mutation。
- map pointの書換え。
- full X timeline/card内投稿本文。
- warningによる自動route/status変更。
- gallery専用global map asset loader/cache。
- `apps/webapp/index.html`のsort control再設計。

## 対象ファイル

### 変更

- `apps/webapp/js/features/circle-status/ui/gallery-view-model.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/css/gallery.css`
- `tests/gallery-view-model.test.ts`
- `tests/dom-route-guidance-view.test.ts`
- `tests/e2e/webapp.spec.ts`

### 新規作成

- `tests/gallery-ordering.test.ts`

### 変更しない

- `apps/webapp/index.html`

現行`index.html`には既にsort buttonがなくpriority filterだけがあるため、HTMLへsort controlを追加/削除しない。

## Interfaces

### pure gallery sort model

`gallery-view-model.ts`へ、Task 7の:

```ts
collectWallIdentifiers()
resolveCircleQueueClass()
```

を使うpure sort helperを追加する。

最低限の構造:

```ts
export interface GalleryLayoutPoint {
  readonly group_id?: string;
  readonly identifier: string;
  readonly number: string | number;
  readonly center_x: number;
  readonly center_y: number;
}

export interface GallerySortContext {
  readonly areas: readonly SpaceArea[];
  readonly pointsByAreaId: ReadonlyMap<
    string,
    readonly GalleryLayoutPoint[]
  >;
  readonly resolveAreaId: (space: string) => string | null;
}

export function sortGalleryCirclesByMapPosition<
  T extends { readonly space: string },
>(
  circles: readonly T[],
  context: GallerySortContext,
): T[];
```

helperは入力配列をmutationせずcopyを返す。

### sort key

normal circle:

```ts
{
  areaName,
  anchorIdentifier: ownIdentifier,
  anchorNumber: ownNumber,
  wallRank: 0,
  distanceSquared: 0,
  originalIdentifier,
  originalNumber,
  originalSpace,
}
```

wall circleでanchor取得成功:

```ts
{
  areaName,
  anchorIdentifier: nearestNormal.identifier,
  anchorNumber: Number(nearestNormal.number),
  wallRank: 1,
  distanceSquared,
  originalIdentifier,
  originalNumber,
  originalSpace,
}
```

比較順:

```text
areaName
-> anchorIdentifier
-> anchorNumber
-> wallRank        // anchor自身のnormalをwallより先にする
-> distanceSquared
-> originalIdentifier
-> originalNumber
-> originalSpace
```

wall circleのsource pointは`identifier:number`一致で探す。同じspace keyへ複数pointがある場合は、全source point × 全normal candidateの距離二乗の最小組を使う。

normal candidateは**同じareaのpoints**かつ、そのidentifierがwall identifier集合に含まれないpointだけ。

area/points/source point/normal candidateのいずれかが不足すれば、そのcircleは従来space keyへfallbackする。

### gallery point loader

`DomCircleGalleryView`はroute-guidance moduleをimportせず、optional callbackだけ受ける。

```ts
type LoadGalleryPoints = (
  area: unknown,
) => Promise<{
  readonly points: readonly GalleryLayoutPoint[];
}>;
```

JS実装上はstructural objectでよく、新しいpublic port fileは作らない。

`DomRouteGuidanceView` constructorを:

```js
constructor(mapAreaCatalog, routeMapAssetsLoader = null)
```

相当に拡張し、galleryへ:

```js
const loadGalleryPoints = routeMapAssetsLoader
  ? async (area) =>
      (await routeMapAssetsLoader.loadMapAssets(area)).points
  : null;

this.modalManager = new DomCircleGalleryView(
  mapAreaCatalog,
  loadGalleryPoints,
);
```

を渡す。

`BrowserApplication`のproduction生成は既存:

```ts
this.ui = new DomRouteGuidanceView(this.routeMapAreaCatalog);
```

から:

```ts
this.ui = new DomRouteGuidanceView(
  this.routeMapAreaCatalog,
  this.routeMapAssetsLoader,
);
```

相当へ変更する。新しいloader instanceは作らない。

### async gallery sort

`DomCircleGalleryView`は:

```js
this.galleryPointsByAreaId = new Map();
this.galleryRenderGeneration = 0;
```

を持つ。

`showGallery(scope)`:

1. currentTargetsを既存通り確定。
2. generationを増やす。
3. points未取得でもpriorityなしの従来space順で即時render。
4. currentTargetsに必要なdistinct areaだけ`loadGalleryPoints(area)`。
5. 成功したareaを`galleryPointsByAreaId`へcache。
6. await後にgenerationが同じ、かつgalleryがopenなら一度だけ再render。
7. load failureは`console.warn`まで。元space順を維持。

`hideGalleryModal()`でgenerationを増やし、close後のstale load completionによる再renderを無効化する。

### dead priority sort state削除

`DomCircleGalleryView`から次を削除する。

```text
btnSortSpace
btnSortPriority
sortMode
changeSortMode()
sort button event listener
sortTargets()内のpriority comparator
```

`galleryPriority()`はfilterとcard表示で引き続き使うため削除しない。

### sale mention badge

Task 6で`DomRouteGuidanceView`へ入るmention space setをgalleryにもdelegateする。

`DomCircleGalleryView`:

```js
setSaleMentionSpaces(spaces) {
  this.saleMentionSpaces = new Set(spaces);
  this.applySaleMentionBadges();
}
```

を持つ。

card生成時、mention対象なら`circle-info`内へ:

```html
<span
  class="gallery-sale-mention"
  aria-label="完売・売り切れ関連投稿あり"
>
  完売関連
</span>
```

相当を1個だけ追加する。

`applySaleMentionBadges()`は既存`.gallery-item[data-space]`へ差分反映し、warningだけで`renderGallery()`を呼ばない。badge updateでcard orderを変えない。

## 実装手順

- [ ] **Step 1: priority sort廃止のpure REDを書く**

`tests/gallery-view-model.test.ts`へ:

```ts
test("priority differences do not change gallery order", () => {
  const result = sortGalleryCirclesByMapPosition(
    [
      { space: "東イ2", priority: 100 },
      { space: "東ア1", priority: 1 },
    ],
    contextWithoutPoints,
  );

  expect(result.map((circle) => circle.space)).toEqual([
    "東ア1",
    "東イ2",
  ]);
});
```

priority値を逆転しても同じ順を要求する。

- [ ] **Step 2: wall anchorのpure REDを書く**

synthetic same-area points:

```ts
const points = [
  {
    group_id: "W_all",
    identifier: "ア",
    number: 90,
    center_x: 0,
    center_y: 0,
  },
  {
    group_id: "I_01",
    identifier: "イ",
    number: 10,
    center_x: 10,
    center_y: 0,
  },
  {
    group_id: "I_02",
    identifier: "ウ",
    number: 10,
    center_x: 100,
    center_y: 0,
  },
];
```

で`東ア90`が`東イ10`へanchorし:

```ts
expect(spaces).toEqual([
  "東イ10",
  "東ア90",
  "東ウ10",
]);
```

を要求する。

同じtest fileへ:
- multiple wall同anchorのdistance tie-break。
- cross-area pointを候補にしない。
- source pointなしfallback。
- normal candidateなしfallback。
- input array mutationなし。

を追加する。

- [ ] **Step 3: pure REDを実行する**

```bash
npx vitest run --root . tests/gallery-view-model.test.ts
```

期待: helper未実装でFAIL。

- [ ] **Step 4: `gallery-view-model.ts`へ最小sort helperを実装する**

Task 7 shared helperをimportし、上記sort keyだけを実装する。Dijkstra/route moduleをimportしない。

- [ ] **Step 5: pure sortをGREENにする**

```bash
npx vitest run --root . tests/gallery-view-model.test.ts
```

期待: PASS。

- [ ] **Step 6: DOM galleryのREDを書く**

`tests/gallery-ordering.test.ts`で:
- `DomCircleGalleryView`をpriorityの異なるcirclesで開いてもspace順。
- priority filterを押すと対象priorityだけ残る。
- loader resolve前はfallback space順。
- loader resolve後にwall anchor順へ一度更新。
- loader reject時もmodal/gridが利用可能。
- close後にlate resolveしてもDOMを再renderしない。
- mention setで`gallery-sale-mention`が1個追加/削除される。
- badge updateでitem DOM orderが変わらない。
- full X post本文用DOMを作らない。

を要求する。

- [ ] **Step 7: DOM REDを確認する**

```bash
npx vitest run --root . tests/gallery-ordering.test.ts
```

期待: FAIL。

- [ ] **Step 8: dead sort stateを削除しpoint loader/cacheを追加する**

`DomCircleGalleryView`からsort button refs/mode/eventsを削除する。`sortTargets()`はpure helper呼び出しへ縮める。

gallery openをnetwork待ちでblockせず、fallback -> async補正とする。

- [ ] **Step 9: sale badgeを最小実装する**

`gallery.css`へbadgeを追加する。cardの高さ/幅を大きく変えるabsolute overlayは避け、`circle-info`の既存inline情報として小さく収める。色だけで意味を伝えない。

- [ ] **Step 10: DOM testをGREENにする**

```bash
npx vitest run --root . \
  tests/gallery-view-model.test.ts \
  tests/gallery-ordering.test.ts
```

期待: PASS。

- [ ] **Step 11: production loader wiringのREDを追加する**

`tests/dom-route-guidance-view.test.ts`でfake `routeMapAssetsLoader.loadMapAssets()`を渡し、gallery open時に対象areaのloaderが呼ばれpointsがmodalへ届くことを証明する。

- [ ] **Step 12: `DomRouteGuidanceView` / `BrowserApplication`へ既存loaderを通す**

新instance/global cacheを作らず、BrowserApplication所有の`routeMapAssetsLoader`を既存UI constructor経路へ1本通す。

- [ ] **Step 13: sale mention setをgalleryへdelegateする**

Task 6で追加済みの`DomRouteGuidanceView` warning更新経路から`modalManager.setSaleMentionSpaces()`も呼ぶ。BrowserApplicationにgallery専用subscriptionを増やさない。

- [ ] **Step 14: focused integrationをGREENにする**

```bash
npx vitest run --root . \
  tests/wall-circle-classification.test.ts \
  tests/gallery-view-model.test.ts \
  tests/gallery-ordering.test.ts \
  tests/dom-route-guidance-view.test.ts \
  tests/prepare-route-optimization.test.ts
```

期待: 全PASS。

- [ ] **Step 15: production E2E RED/GREENを追加する**

`tests/e2e/webapp.spec.ts`へ最低限:
1. priorityが異なる2circleでも一覧がspace順。
2. priority filterはまだ機能。
3. C108/synthetic wall fixtureでwallがnearest normal anchor位置へ並ぶ。
4. sale mention fixture後、galleryに`完売関連`badgeは出るが投稿本文timelineは出ない。
5. badge後もcard orderとswipe/purchase actionが維持。

CIではYahoo raw endpointを呼ばずTask 6同様normalized `/api/x-posts`をinterceptする。

- [ ] **Step 16: focused E2Eとweb buildを実行する**

```bash
npx playwright test tests/e2e/webapp.spec.ts --project=mobile-chromium
npm run check:webapp
npm run build:webapp
git diff --check
```

期待: 全PASS。

- [ ] **Step 17: commit**

```bash
git add \
  apps/webapp/js/features/circle-status/ui/gallery-view-model.ts \
  apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts \
  apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts \
  apps/webapp/js/app/browser-application.ts \
  apps/webapp/css/gallery.css \
  tests/gallery-view-model.test.ts \
  tests/gallery-ordering.test.ts \
  tests/dom-route-guidance-view.test.ts \
  tests/e2e/webapp.spec.ts
git commit -m "feat(phase-07-6): simplify gallery ordering"
```

## 受入条件

- priority sort廃止。
- priority filterとpriority表示は維持。
- normal circleは従来space順。
- wallはTask 7と同じ`W_*` classificationを使用。
- wallのsort anchorはsame-area nearest non-wall point。
- nearestは`center_x/center_y`距離二乗で、Dijkstraなし。
- normal anchorをwallより先にし、tie-breakは決定論的。
- cross-area anchorなし。
- points/load failureは元space順fallback。
- gallery openをasset取得失敗で阻害しない。
- `Circle.space` / map / route / ALNS state mutationなし。
- existing routeMapAssetsLoaderを再利用し、新loader/cacheなし。
- sale mentionは小さい`完売関連`badgeだけ。
- full X timelineをgalleryへ追加しない。
- warning updateでsort/order/swipe/purchase semanticsを変えない。
- production E2Eでloader wiringと表示順を証明する。
