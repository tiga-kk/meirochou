# Phase 5C Task 3: Circle List and Shared Detail UI

**Status:** Not started  
**Depends on:** Phase 5C Tasks 1-2  
**Commit candidate:** `feat(ui): add circle states and shared detail actions`

## Goal

`未購入`と`全サークル`の一覧を新stateへ対応させ、map markerとlist rowから同じcircle detailを開く。状態に応じた操作を提供する。

## Required UI

### 未購入

- `巡回対象`: pending
- `保留中`: held
- purchasedとexcludedは表示しない

### 全サークル

- pending、held、purchased、excludedをbadge付きで表示する

### Detail actions

pending:

```text
ここを目的地にする
保留にする
その他 → 購入済みにする
その他 → 今回は対象外にする
```

held:

```text
ここを目的地にする
保留を解除
その他 → 購入済みにする
その他 → 今回は対象外にする
```

purchased:

```text
購入を取り消す
```

excluded:

```text
巡回対象に戻す
```

detailにはspace、識別情報、state badge、memo/menu、現在距離、順路位置を表示できるslotを用意する。外部情報取得は実装しない。

## TDD procedure

- [ ] view modelが未購入をpending/held sectionへ分ける失敗testを書く。
- [ ] purchased/excludedが未購入へ出ない失敗testを書く。
- [ ] 全サークルに4状態が出る失敗testを書く。
- [ ] row全体のclickでdetailが開く失敗testを書く。
- [ ] map markerとlist rowが同じdetail componentへ同一circleを渡す失敗testを書く。
- [ ] state別actionの失敗testを書く。
- [ ] action後に1回取消toastが出る失敗testを書く。
- [ ] REDを確認する。

```bash
npx vitest run tests/circle-list-view-model.test.ts tests/circle-detail.test.ts
```

- [ ] view modelを新state queryへ変更する。
- [ ] Litのshared detail componentを実装する。
- [ ] actionをTask 1 mutation serviceへ接続する。
- [ ] heldをtargetへ選ぶ操作は、stateをpendingへ戻してからnavigation serviceへ渡す。
- [ ] list rowへ全action buttonを並べない。
- [ ] 44px tap target、focus return、Escape close、state textを実装する。
- [ ] GREENを確認する。

```bash
npx vitest run tests/circle-list-view-model.test.ts tests/circle-detail.test.ts tests/settings-component.test.ts
npm run check:webapp
npm run build:webapp
git diff --check
```

## Acceptance criteria

- 未購入にpending/heldの2 sectionがある。
- 全サークルに4状態がある。
- map/listで同じdetailを使う。
- stateによって不正actionが表示されない。
- 短時間取消がcircle stateだけを戻す。
- 外部情報providerを実装していない。
