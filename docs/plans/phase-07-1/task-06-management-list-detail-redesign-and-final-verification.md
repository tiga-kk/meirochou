# Phase 7.1 Task 6: management list-detail redesign + 最終検証

## 目標

管理画面を、mobileではevent/day一覧→detail、desktopでは同じmodelを使うlist/detail 2-paneへ整理する。一覧rowから5個のaction buttonを取り除き、source/data/offline/GAS状態を短時間でscanできる構造にする。Phase 7.1全体のvisual/a11y/performance回帰もこのTaskで最終確認する。

## やってはいけないこと

- management専用のrepository/domain stateを新設しない。
- detail rowを選択しただけでevent/dayを暗黙に`開く`扱いにしない。
- mobileとdesktopで別のbusiness modelを作らない。
- row全体に5個のaction buttonを戻さない。
- full GAS URLをoverviewへ表示しない。
- `再読込`、offline準備、編集、削除の既存Use CaseをUI component自身から直接呼ばない。
- source manager/outbox/local deletionのlogicを新componentへ複製しない。
- desktop対応のため横scroll必須tableへしない。
- Task 5のanimationを管理layoutの必須機能にしない。motion.cssを外しても操作可能にする。

## 対象ファイル

**作成:**
- `apps/webapp/js/components/event-day-management-detail.ts`
- `tests/event-day-management-detail.test.ts`

**変更:**
- `apps/webapp/js/components/event-day-management-view.ts`
- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/js/app/browser-application.ts`（`openManagementDetail(ref)`接続の最小変更）
- `apps/webapp/js/shared/ui/management-events.ts`（detail requestをshared eventにする場合のみ）
- `apps/webapp/css/forms.css`
- `apps/webapp/css/motion.css`
- `tests/event-day-management-actions.test.ts`
- `tests/e2e/management.spec.ts`
- `tests/e2e/webapp.spec.ts`
- 意図して変化するmanagement snapshotのみ

## UI state contract

`ComipathSettings`が持つのはUI上のdetail selectionだけで、event/dayのbusiness stateではない。

```ts
private detailRef: EventDayRef | null = null;
```

`detailRef`は「管理画面で今detail表示しているrow」を表す。`row.selected`は「mainで現在使用中のevent/day」を表す。この二つを混同しない。

open時:

1. `detailRef`がまだ有効なら維持。
2. 無効なら`rows.find(row => row.selected)?.ref ?? rows[0]?.ref ?? null`。

rows更新時に`detailRef`のrowが消えた場合だけfallbackする。

## component責務

### `EventDayManagementView`

入力:

```ts
rows: readonly EventDayManagementRow[]
detailRef: EventDayRef | null
```

出力:

```text
event-day-detail-request { ref }
```

一覧rowは次だけを表示する。

```text
C108 / 1日目      使用中  ›
GAS / 配置シート1
532件  同期0件  お品書き521/532
```

未設定:

```text
C108 / 2日目              ›
未設定
```

一覧rowには`開く/再読込/オフライン準備/編集/削除`を並べない。

### `EventDayManagementDetail`

入力:

```ts
row: EventDayManagementRow | null
showAdvancedControls: boolean
sourceManagerModel: CircleDataSourcePanelModel | null
outboxPanelModel: OutboxPanelModel | null
optimizationTimeLimitMs: AlnsSearchTimeLimitMs
deleteOptions: readonly DeleteOptionViewModel[]
```

既存action eventをdispatchする。

```text
event-day-open-request
event-day-refresh-request
event-day-offline-request
event-day-edit-request
event-day-delete-request
optimization-time-limit-change
delete-option-select
```

`showAdvancedControls`は原則`row.selected === true`。非selected rowのdetailを見ているだけでは、active day専用の`source-manager`/`outbox-panel`を誤表示しない。

`編集`等のhandlerが対象refへ既存transitionした後、rows更新でそのrowがselectedになればadvanced controlsを表示できる。

## Mobile layout

breakpointは既存CSSと整合させ、原則`max-width: 719px`相当でmobile single-paneにする。既存breakpointがある場合は新しい値を増やさず再利用する。

### overview mode

```text
管理                              閉じる
イベント・日程

[C108 / 1日目    使用中       ›]
 GAS / 配置シート1
 532件  同期0件  お品書き521/532

[C108 / 2日目                 ›]
 未設定
```

rowの主要tap targetは44px以上。`使用中`は色だけでなくtextと`aria-current`で示す。

### detail mode

```text
‹ イベント・日程
C108 / 1日目                 使用中

データソース
GAS / 配置シート1
[再読込] [編集]

オフライン
521 / 532 保存済み
[オフライン準備]

GAS同期
0件待ち

巡回設定
探索時間 [3秒 v]

データ管理
[この日程を削除]

非使用中の日程なら
[この日程を開く]
```

`detail back`はmanagementを閉じずoverviewへ戻る。

未設定rowでは`設定する`をprimary actionにし、offline/reload/delete等の成立しないactionを並べない。

## Desktop layout

既存management最大幅760pxが狭すぎて2-paneを作れない場合、management contentだけ`min(1120px, 100%)`程度まで広げてよい。main側のmax width tokenは変更しない。

```text
┌ event/day list 360px ┬ detail minmax(0,1fr) ┐
│ C108 day1            │ C108 / 1日目          │
│ C108 day2            │ sections...           │
└──────────────────────┴────────────────────────┘
```

mobileと同じ`rows`/`detailRef`を使用する。desktop専用repository queryを追加しない。

## 手順

- [ ] **Step 1: list/detail state unit RED testsを書く**

`ComipathSettings`またはpure helper testで次を固定する。

- open時は使用中rowをdetail defaultにする。
- detailRefを別rowへ変えても`row.selected`は変化しない。
- rows更新でdetail rowが残るなら維持する。
- detail rowが削除されたら使用中rowまたは先頭へfallbackする。

- [ ] **Step 2: EventDayManagementViewのaction過密を検出するRED testを書く**

既存`tests/event-day-management-actions.test.ts`を、一覧rowが5actionをdispatchするtestからdetail requestだけをdispatchするtestへ変更する。

```ts
expect(view.querySelectorAll('.event-day-management-row button')).toHaveLength(1);
```

button以外にrow clickを使う場合も、keyboard操作可能な明示controlを残す。

- [ ] **Step 3: `event-day-detail-request`を実装する**

`EventDayManagementView`はrepository/networkを触らず、対象`ref`だけを親へ渡す。

selected rowは`aria-current="true"`と`使用中`textを維持する。

- [ ] **Step 4: EventDayManagementDetailのRED unit testsを書く**

configured selected row:

- source/offline/GAS countを表示。
- refresh/offline/edit/delete eventが正しいrefで1回dispatch。
- `この日程を開く`は表示しない。

configured nonselected row:

- `この日程を開く`を表示。
- active day専用source-manager/outboxを表示しない。

unconfigured row:

- `設定する`だけをprimary actionとして表示。
- offline準備/reloadを表示しない。

- [ ] **Step 5: detail componentを実装する**

section headingとactionを意味単位で分ける。大量のborder/cardを増やさず、separatorとspacing中心でhierarchyを作る。

source labelは既存`sourceLabel/sourceEndpointSummary`を使い、完全GAS URLを表示しない。

- [ ] **Step 6: ComipathSettingsをoverview/detail shellへ変更する**

現在の`event-day-management-view + <details class="management-detail-surface">`構造をlist/detail layoutへ置換する。

既存source-manager/outbox/storage-delete-dialogのcomponent自体は再利用する。削除dialogはdetail treeの奥に埋めてfocus controllerを壊さない配置にする。

- [ ] **Step 7: BrowserApplicationの`openManagementDetail()`へrefを渡す**

現行:

```ts
private openManagementDetail(): void
```

を必要なら次へする。

```ts
private openManagementDetail(ref?: EventDayRef): void
```

settings component側public method:

```ts
openDetail(ref?: EventDayRef): void
```

`refresh/edit/delete` handlerは対象refを渡す。UI detail selectionだけを設定し、Use Case ownershipはBrowserApplicationに維持する。

- [ ] **Step 8: mobile list→detail→back E2Eを追加する**

```text
管理open
→ day2 row 詳細
→ day2 detail表示、mainのactive dayはday1のまま
→ 戻る
→ overview
→ day2 detail
→ この日程を開く
→ management close、main active dayがday2
```

「detailを見るだけ」と「開く」を区別することが最重要contract。

- [ ] **Step 9: existing actions E2Eをdetail経由へ更新する**

- GAS再読込
- CSV編集/file picker
- offline準備progress
- delete confirmation
- outbox retry/discard

旧row action selectorを使うtestはdetail actionへ移す。

- [ ] **Step 10: desktop 2-pane E2Eを追加する**

desktop viewportでlistとdetailが同時に見え、rowを切り替えてもmain active dayは`開く`まで変わらないことを確認する。

横scroll tableを要求しない。

- [ ] **Step 11: Task 5 motionをdetail transitionへ接続する**

mobile overview→detail/backで`motion.css`の専用classを使用する。JSがanimationendを待ってstate transitionしない。DOM stateは即切替え、motionは視覚補助だけにする。

reduced motionではtransitionをnone/fadeへする。

- [ ] **Step 12: visual hierarchyを調整する**

規則:

- event/day title > source > count/status > actionの順に視覚強度を下げる。
- primary色をすべてのbuttonへ使わない。
- deleteはdetail下部へ隔離する。
- statusは色だけでなくtextを持つ。
- mono fontはcount/source machine valueに限定する。
- default shadowを増やさない。

- [ ] **Step 13: 意図したsnapshotだけ更新する**

managementのoverview/detail snapshotを個別に取得する。Phase 7から残っていたsnapshot差分についても、新レイアウトで正しい基準を確立する場合は、各snapshotの変更理由をcommit/reportへ記録する。

`--update-snapshots`全体実行で無関係snapshotを一括acceptしない。

- [ ] **Step 14: Phase 7.1総合E2E**

最低限次を1回のCI相当runで通す。

- current route flow actual time change。
- navigation summary重複なし。
- C108 map edge + inertia。
- Gallery swipe hint。
- management full遮蔽/background lock。
- mobile list/detail/open。
- desktop 2-pane。
- offline準備。
- GAS再読込。
- delete/cache cleanup。
- reduced motion。
- 200% zoom。

- [ ] **Step 15: performance regression確認**

map pan中:

- pointermoveごとのlayout readなし。
- 1frameあたりtransform writeは最大1回へcoalesce。
- idle時RAFなし。

motion:

- 新規animationは原則transform/opacity。
- management open時に下層をpaintし続ける必要のないopaque surface。

- [ ] **Step 16: full verification**

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

既存flakyが出た場合はretry成功だけでPhase 7.1をGREEN扱いせず、Phase 7.1変更との因果を切り分けてprogressへ記録する。

- [ ] **Step 17: docs/progressを実態へ更新する**

`docs/status/progress.md`のPhase 7.1をTask単位で更新し、実装commit SHA、検証結果、残件を記録する。未完了test/visual issueを完了扱いしない。

- [ ] **Step 18: commit**

```bash
git status --short
git add apps/webapp/js/components/event-day-management-view.ts apps/webapp/js/components/event-day-management-detail.ts apps/webapp/js/components/comipath-settings.ts apps/webapp/css/forms.css apps/webapp/css/motion.css tests/event-day-management-actions.test.ts tests/event-day-management-detail.test.ts tests/e2e/management.spec.ts <実際に変更したapplication/test/snapshot/docs>
git diff --cached --name-status
git diff --cached --check
git commit -m "refactor(management): use responsive list detail navigation"
```

## 受入条件

- mobile overview rowに5actionを常設しない。
- mobileはlist→detail→backが明確。
- detailを見るだけではmain active dayを変更しない。
- `この日程を開く`で初めてexisting event-day transitionを行い、managementを閉じる。
- desktopは同じmodelで2-pane。
- unconfigured dayは設定開始actionを明確にする。
- configured dayの再読込/offline準備/編集/削除が既存Use Caseへ接続される。
- managementの下層mainが見えない。
- reduced motion/keyboard/200% zoom/safe-areaを維持する。
- Phase 7.1の全Task contractを総合E2Eで確認する。
- full verificationが成功するか、失敗が既知残件として具体的に記録される。
