# Phase 7.2 Task 6: global Gallery・dynamic priority・tutorial replay

## 目標

headerの「一覧」を押したのに未訪問サークルが表示されない問題を修正し、全areaの未訪問catalogを一覧できるようにする。priority filterの`10/9/8/7`固定を廃止し、実データに適応させる。swipe操作説明animationは初回だけでなく利用者が再生できるようにする。

## 現状の原因

- `#gallery-filter-controls`はHTMLへpriority 10/9/8/7を固定している。
- header「一覧」は`showGalleryForArea(areaId)`を経由し、現在選択されているmap areaへscopeを絞る。
- そのareaに未訪問が0件でも、他areaに未訪問が残っていることがある。
- swipe hintはlocalStorage seen keyで一度だけ表示するため、過去版hintを見た端末では新animationを確認できない。

## やってはいけないこと

- unvisited dataを複製して別storeを作らない。
- priority filterへ新しい固定範囲を入れ直さない。
- priority未設定circleを通常一覧から消さない。
- header「一覧」を現在地areaへ暗黙scopeしない。
- hintをGalleryを開くたび強制表示しない。
- localStorage unavailableでGallery自体を壊さない。

## 対象ファイル

**作成:**
- `apps/webapp/js/features/circle-status/ui/gallery-view-model.ts`
- `tests/gallery-view-model.test.ts`

**変更:**
- `apps/webapp/index.html`
- `apps/webapp/js/app/bind-settings-shell-events.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/css/gallery.css`
- `apps/webapp/css/motion.css`
- `tests/e2e/webapp.spec.ts`
- Gallery関連の既存unit tests

## scope contract

```ts
export type GalleryScope =
  | { readonly kind: "all-unvisited" }
  | { readonly kind: "area"; readonly areaId: string }
  | { readonly kind: "hold"; readonly areaId?: string };
```

headerの`#btn-open-gallery`はareaIdを読まず、次を呼ぶ。

```ts
application.showGallery({ kind: "all-unvisited" });
```

既存のarea-specific呼び出しが別UIで必要なら`showGallery({kind:"area",areaId})`へ移す。

`DomCircleGalleryView.showGallery(scope)`はscopeごとにsourceを一度だけ選ぶ。

```ts
export function selectGalleryCircles(input: {
  scope: GalleryScope;
  unvisited: readonly Circle[];
  wantToBuy: readonly Circle[];
  holdSpaces: ReadonlySet<string>;
  resolveAreaId: (space: string) => string | null;
}): Circle[];
```

`all-unvisited`はarea filterなしで`unvisited`全件を返す。

## dynamic priority contract

```ts
export function collectGalleryPriorities(
  circles: readonly Circle[],
): number[];
```

規則:

- `Number(circle.priority)`がfiniteなものだけ。
- duplicate排除。
- 降順。
- 0や負値もデータとして有効なら表示する。現行domain validationが禁止している場合だけ除外する。
- priorityなしはbuttonを作らないがcircleはfilter未選択時に表示する。

例:

```ts
collectGalleryPriorities([
  { priority: 1 },
  { priority: 12 },
  { priority: 5 },
  { priority: 12 },
  { priority: undefined },
]);
// [12, 5, 1]
```

`index.html`から固定filter buttonsを削除し、`#gallery-filter-controls`は空containerと「すべて」状態だけを持つ。buttonsはGallery render時に生成する。

filter後に0件なら次を区別する。

```text
priority filterの結果0件: 「この条件に一致するサークルはありません」
全unvisited自体0件: 「未訪問サークルはありません」
area scope 0件: 「このエリアに未訪問サークルはありません」
```

## tutorial contract

hint versionを新しくする。

```js
this.hintKey = "comipath:ui:v2:gallery-swipe-hint-seen";
```

初回open時:

- 900ms程度のdemo card horizontal swipeを2回以内。
- 文言は実際の購入操作方向と一致。
- 3.5〜5秒で自動終了。
- tapでdismiss可能。

Gallery headerへ常設の小さい`操作方法`buttonを追加する。

```html
<button id="btn-gallery-help" type="button">操作方法</button>
```

manual replayはseen flagに関係なくhintを再生する。

API:

```js
showSwipeHint({ force = false } = {})
```

`force:false`はseen確認、`force:true`は常に表示する。

## 手順

- [ ] **Step 1: global scope RED testを書く**

```ts
expect(selectGalleryCircles({
  scope: { kind: "all-unvisited" },
  unvisited: [eastCircle, westCircle],
  ...
})).toEqual([eastCircle, westCircle]);
```

- [ ] **Step 2: priority RED testsを書く**
  - `[1,3,5,12]`を降順生成。
  - duplicate排除。
  - missing priorityはbuttonなし。

- [ ] **Step 3: pure modelを実装する**

- [ ] **Step 4: header一覧のevent contractをglobal scopeへ変更する**
  - `loc-ewsn`を読む処理を削除。

- [ ] **Step 5: fixed HTML filter buttonsを削除しdynamic renderへ変更する**

- [ ] **Step 6: empty stateをscope/filter別にする**

- [ ] **Step 7: tutorial RED testsを書く**
  - v2 unseenで自動表示。
  - seenで自動表示しない。
  - help buttonはseenでもforce replay。
  - storage exceptionでもforce replay可能。

- [ ] **Step 8: tutorial replayを実装する**

- [ ] **Step 9: E2Eを追加する**

fixture:

```text
East area: unvisited 0
West area: unvisited 2 (priority 12, 3)
```

現在地をEastにしたままheader「一覧」を押し、West 2件が表示されることを確認する。filter buttonsが`12`と`3`だけであることも確認する。

別fixtureでpriority `1,3,5,12`を入れ、4buttonが降順表示されることを確認する。

help buttonを押して`.gallery-swipe-hint-demo-card`へanimation-nameが付くことを確認する。

- [ ] **Step 10: verification**

```bash
npx vitest run --root . tests/gallery-view-model.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "一覧|Gallery|操作方法|priority"
npm run test:webapp
npm run check:webapp
git diff --check
```

## 受入条件

- header「一覧」は現在地areaに関係なく未訪問全件を表示する。
- 任意priority集合にUIが適応する。
- priority filter未選択時にpriorityなしcircleも表示される。
- swipe tutorialが新規利用者へ表示され、既存利用者も手動再生できる。