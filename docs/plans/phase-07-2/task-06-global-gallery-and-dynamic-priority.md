# Phase 7.2 Task 6: global Gallery・dynamic priority・tutorial replay

## 目標

headerの「一覧」を押したのに未訪問サークルが表示されない問題を修正し、全areaの未訪問catalogを一覧できるようにする。priority filterの`10/9/8/7`固定を廃止し、実データに適応させる。swipe操作説明animationは初回だけでなく利用者が再生できるようにする。

## 現状の原因

- `#gallery-filter-controls`はHTMLへpriority 10/9/8/7を固定している。
- header「一覧」は`showGalleryForArea(areaId)`を経由し、現在選択されているmap areaへscopeを絞る。
- そのareaに未訪問が0件でも、他areaに未訪問が残っていることがある。
- 現行filterはpriorityを数値化できない場合に`0`相当へ寄せる処理があり、将来priority `0`を有効値として扱うと「未設定」と「0」を混同し得る。
- swipe hintはlocalStorage seen keyで一度だけ表示するため、過去版hintを見た端末では新animationを確認できない。

## やってはいけないこと

- unvisited dataを複製して別storeを作らない。
- priority filterへ新しい固定範囲を入れ直さない。
- priority未設定circleを通常一覧から消さない。
- priority未設定を数値`0`と同一扱いしない。
- header「一覧」を現在地areaへ暗黙scopeしない。
- hintをGalleryを開くたび強制表示しない。
- localStorage unavailableでGallery自体や手動helpを壊さない。

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

headerの`#btn-open-gallery`は`loc-ewsn`を読まず、次を呼ぶ。

```ts
application.showGallery({ kind: "all-unvisited" });
```

既存のarea-specific/hold呼び出しが別UIで必要なら対応するscopeへ移す。既存call siteを一括でglobalへ変えない。

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

`all-unvisited`はarea filterなしで`unvisited`全件を返す。表示用の並び替えは既存`sortTargets()`相当の責務を維持し、source selectionと混同しない。

## dynamic priority contract

```ts
export function collectGalleryPriorities(
  circles: readonly Circle[],
): number[];
```

規則:

- priorityが未設定、空文字、非数値ならpriorityなしとして扱う。
- 明示された値を`Number(...)`で変換し、finiteなものだけを候補にする。
- duplicate排除。
- 降順。
- 0や負値も現行GAS contractではfinite値として受理されるため、有効値として表示・filterできるようにする。後からdomain validationで禁止する場合は、そのvalidation変更を別仕様として扱う。
- priorityなしはbuttonを作らないが、filter未選択時にはcircleを表示する。
- priority `0` filterを選択した時、priority未設定circleを一致扱いしない。

例:

```ts
collectGalleryPriorities([
  { priority: 1 },
  { priority: 12 },
  { priority: 0 },
  { priority: 12 },
  { priority: undefined },
]);
// [12, 1, 0]
```

filter判定も同じ正規化規則を使う。現在のように`NaN ? 0 : value`として未設定を0へ畳み込まない。

`index.html`から固定filter buttonsを削除し、`#gallery-filter-controls`は空containerと必要な静的labelだけを持つ。buttonsはGallery render時に生成する。

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

API:

```js
showSwipeHint({ force = false } = {})
```

- `force:false`: storageが読める場合はseenを確認し、unseenだけ自動表示する。storage access自体が失敗した場合はGalleryを壊さず、自動hintを省略してよい。
- `force:true`: seen flagやstorage access可否に依存せず表示する。手動helpは常にこの経路を使う。
- force表示後にstorageへ書けなくても、表示自体は成功扱いにする。

## テスト方針

### scope

- East未訪問0、West未訪問2のfixtureで、現在地Eastのままheader「一覧」を開いてWest 2件が見える。
- area-specific/holdの既存callerは従来scopeを維持する。

### priority

- `[1,3,5,12]`を`[12,5,3,1]`へ生成。
- duplicate排除。
- `undefined`、`""`、非数値はbuttonなし。
- `0`と`-1`は明示値としてbutton生成。
- priority `0` filter時にmissing priorityを含めない。
- filter未選択ならmissing priorityも表示する。

### tutorial

- v2 unseenで自動表示。
- seenで自動表示しない。
- help buttonはseenでもforce replay。
- localStorage read/write例外でもhelp buttonのforce replayは表示される。

## 手順

- [ ] **Step 1: global scope RED testを書く**
- [ ] **Step 2: priority RED testsを書く。特に`0`とmissingの非同一性を固定する**
- [ ] **Step 3: pure gallery modelを実装する**
- [ ] **Step 4: header一覧のevent contractをglobal scopeへ変更し、`loc-ewsn`依存を削除する**
- [ ] **Step 5: fixed HTML filter buttonsを削除しdynamic renderへ変更する**
- [ ] **Step 6: empty stateをscope/filter別にする**
- [ ] **Step 7: tutorial RED testsを書く**
- [ ] **Step 8: versioned auto hint + storage非依存のmanual replayを実装する**
- [ ] **Step 9: E2Eでglobal一覧、任意priority、manual helpを本番UIから確認する**
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
- 任意のfinite priority集合にUIが適応し、`0`とmissingを混同しない。
- priority filter未選択時にpriorityなしcircleも表示される。
- area-specific/holdの既存Gallery flowをglobal化の副作用で壊さない。
- swipe tutorialが新規利用者へ表示され、既存利用者もstorage状態に関係なく手動再生できる。