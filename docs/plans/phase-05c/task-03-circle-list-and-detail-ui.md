# Phase 5C Task 3: Circle List and Shared Detail UI

**Status:** Complete（レビュー修正済み。App/Map/Galleryへのイベント接続はTask 7で実施）
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

- [x] view modelが未購入をpending/held sectionへ分ける失敗testを書く。
- [x] purchased/excludedが未購入へ出ない失敗testを書く。
- [x] 全サークルに4状態が出る失敗testを書く。
- [ ] row全体のclickでdetailが開く失敗testを書く（実際のlist row wiringはTask 7へ移管）。
- [ ] map markerとlist rowが同じdetail componentへ同一circleを渡す失敗testを書く（実際のMap/Gallery wiringはTask 7へ移管）。
- [x] state別actionの失敗testを書く。
- [ ] action後に1回取消toastが出る失敗testを書く（toastとmutationの接続はTask 7へ移管）。
- [x] REDを確認する。

```bash
npx vitest run tests/circle-list-view-model.test.ts tests/circle-detail.test.ts
```

- [x] view modelを新state queryへ変更する。
- [x] Litのshared detail componentを実装する。
- [ ] actionをTask 1 mutation serviceへ接続する（componentは`action-selected` eventを発火し、consumerはTask 7へ移管）。
- [ ] heldをtargetへ選ぶ操作は、stateをpendingへ戻してからnavigation serviceへ渡す（Task 7へ移管）。
- [x] list rowへ全action buttonを並べない。
- [x] 44px tap target、focus return、Escape close、state textを実装する。
- [x] GREENを確認する。

```bash
npx vitest run tests/circle-list-view-model.test.ts tests/circle-detail.test.ts tests/settings-component.test.ts
npm run check:webapp
npm run build:webapp
git diff --check
```

## 実績

- pending/heldを分離し、purchased/excludedを未購入一覧から除外するview modelと、4状態をbadge付きで返す全サークルview modelを追加した。
- `CircleDetailDialog`は状態別action、state badge、距離・順路slot、Escape close、focus return、44px以上のbuttonを提供する。
- `その他`操作は常時全表示せず、メニューを開いた後だけ購入済み化・対象外化actionを表示するようレビュー修正した。
- `CircleStateUndoService`は1回限りのTTL tokenをmemoryで管理する。永続化とtoast/mutationの実接続はTask 7へ移管した。
- focused testは`circle-list-view-model`、`circle-detail`、`settings-component`の17件をGREENで確認した。
- `npm run test:e2e`は25 passed、既存visual snapshot差分6件、8 skipped。今回の差分は新コンポーネントをAppへ接続していないため、既存snapshotは更新していない。

## Acceptance criteria

- 未購入にpending/heldの2 sectionがある。
- 全サークルに4状態がある。
- map/listで同じdetailを使う。
- stateによって不正actionが表示されない。
- 短時間取消がcircle stateだけを戻す。
- 外部情報providerを実装していない。
