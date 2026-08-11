# Phase 7.1 Task 6: management list-detail redesign

## 目標

管理画面を、mobileではevent/day一覧→detail、desktopでは同じrow/modelを使うlist/detail 2-paneへ整理する。一覧rowから5個のaction buttonを取り除き、source/data/offline/GAS状態を短時間で確認できる構造にする。

このTaskでは管理の情報階層だけを変更し、event/dayの保存状態、repository、network/cache、既存Use Caseの意味を変更しない。Phase全体の最終検証と進捗確定はTask 7で行う。

## 現行実装の所有関係

- `EventDayManagementView`はoverview rowと5 actionを描画し、既存management eventをdispatchする。
- `ComipathSettings`はoverviewの下に`<details class="management-detail-surface">`を持ち、`event-day-selector`、`source-manager`、`outbox-panel`、最適化設定、削除UIを所有する。
- `BrowserApplication`がmanagement eventを受け、既存Use Caseへ接続する。
- `BrowserApplication`の`再読込`、`オフライン準備`、`編集`、`削除`handlerは現状、対象refへ`eventDayTransition.execute(ref)`してから処理する。

この所有関係を再利用する。新しい`EventDayManagementDetail` componentを作ることは必須ではない。まず`ComipathSettings`内でdetail selectionと既存detail controlsを再配置し、責務やrenderが明らかに肥大化する場合だけdetail表示をcomponentへ抽出する。

## やってはいけないこと

- management専用repository/domain stateを新設しない。
- detail rowを選択しただけでactive event/dayを変更しない。
- mobileとdesktopで別business modelを作らない。
- row全体に5個のaction buttonを戻さない。
- full GAS URLをoverviewへ表示しない。
- source manager/outbox/local deletionのlogicを新componentへ複製しない。
- existing action handlerが対象dayへ切り替えてから処理する挙動を、このUX整理のついでに変更しない。
- `event-day-management-actions.test.ts`の5 event contractを、代替testなしに削除しない。
- E2E helperから直接detailを開き、list→detailの本番UI経路を迂回して成功扱いしない。
- desktop対応のため横scroll必須tableを作らない。
- Task 5のmotionがなければ操作できない構造にしない。

## 対象ファイル

**主な変更:**
- `apps/webapp/js/components/event-day-management-view.ts`
- `apps/webapp/js/components/comipath-settings.ts`
- `apps/webapp/js/app/browser-application.ts`（既存`openManagementDetail()`へrefを渡す必要がある場合だけ最小変更）
- `apps/webapp/css/forms.css`
- `apps/webapp/css/motion.css`（mobile detail transitionを追加する場合のみ）
- `tests/event-day-management-actions.test.ts`
- `tests/e2e/management.spec.ts`

**条件付き作成:**
- `apps/webapp/js/components/event-day-management-detail.ts`
- `tests/event-day-management-detail.test.ts`

既存`ComipathSettings`内のprivate render/helperで責務が明確なら作成しない。

`management-events.ts`は既存eventで足りる限り変更しない。overviewからdetail selectionを親へ通知する小さな`event-day-detail-request { ref }`が必要な場合だけ追加する。

## UI state契約

`ComipathSettings`はUI上のdetail selectionだけを持つ。

```ts
private detailRef: EventDayRef | null = null;
```

または同等のprivate stateとする。

- `detailRef`: 管理画面で現在詳細を見ているrow。
- `row.selected`: mainで現在使用中のevent/day。

この二つを混同しない。

open時:

1. 既存`detailRef`が現在rowsに存在するなら維持してよい。
2. 無効なら`row.selected`、それもなければ先頭rowをdefault detail候補とする。
3. mobileではmanagementを開いた直後はoverviewを表示し、default detail候補を持っていても自動でdetail画面へ遷移しない。
4. desktopではlistとdefault detailを同時表示してよい。

rows更新でdetail対象が消えた場合だけfallbackする。

## action semantics

### detailを見る

row→detail requestは`detailRef`だけを変える。`eventDayTransition.execute()`、repository write、network requestを行わない。

### この日程を開く

既存`event-day-open-request`を使う。対象dayへ切り替え、managementを閉じ、mainへ戻る現行挙動を維持する。

### 再読込 / オフライン準備 / 編集 / 削除

既存event名と`{ ref }`を維持する。現行`BrowserApplication`はこれらのactionでも対象refへ切り替えてから既存Use Caseを実行するため、その挙動を維持する。

つまり「detailを見るだけではactive dayを変えない」と「action実行時にも絶対active dayを変えない」は同じ要求ではない。後者へ変更するのはPhase 7.1の範囲外の製品仕様変更とする。

### 未設定row

`設定する`を主actionにする。現行edit/source設定経路を再利用し、未設定day専用の別Use Caseを作らない。

## `EventDayManagementView`責務

入力は既存`rows`と、必要なら`detailRef`だけにする。

一覧row表示例:

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

rowはdetail requestだけを発火し、repository/network/cacheへ触らない。`使用中`はtextと`aria-current="true"`を維持する。

row全体をclick targetにする場合もkeyboard操作可能にする。buttonを使う場合、`button`数そのものではなく「overviewにbusiness actionが並んでいないこと」をtestする。

## detail表示責務

可能なら既存`ComipathSettings`が次をそのまま所有する。

- source summary / source-manager
- outbox
- optimization time limit
- delete options / dialog
- existing action event dispatch

detail rendererは選択rowに応じて見出し・status・actionを配置するだけとし、model変換やUse Caseを複製しない。

active day専用の`source-manager`/`outbox-panel`は、非selected rowを眺めているだけの時にそのrow用と誤認させない。非selected detailではactive専用controlsを隠すか「現在使用中の日程の設定」であることが明確な場合だけ表示する。基本は隠す。

## Mobile layout

既存breakpointを優先して再利用する。

### overview

```text
管理                              閉じる
イベント・日程

[C108 / 1日目    使用中       ›]
 GAS / 配置シート1
 532件  同期0件  お品書き521/532

[C108 / 2日目                 ›]
 未設定
```

### detail

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
探索時間 [3秒]

データ管理
[この日程を削除]
```

非selected configured rowでは`この日程を開く`を明示する。未設定rowでは`設定する`を主actionにする。

backはmanagementを閉じずoverviewへ戻る。

## Desktop layout

同じ`rows`と`detailRef`でlist/detailを同時表示する。既存760px上限が実用上不足する場合だけmanagement content幅を広げ、main側tokenは変更しない。

```text
┌ event/day list ┬ detail ┐
│ C108 day1      │ C108 / 1日目
│ C108 day2      │ sections...
└────────────────┴────────┘
```

## 手順

- [ ] **Step 1: detail selectionのRED testを追加する**

- mobile overviewでrowを選ぶとdetailへ進む。
- detail selectionだけでは`row.selected`/active dayが変わらない。
- backでoverviewへ戻る。
- rows更新で対象が残る限りdetailRefを維持する。
- 対象row削除時だけfallbackする。

- [ ] **Step 2: overview action過密のRED testを追加する**

既存5 actionをoverviewから取り除き、row操作がdetail requestだけになることを確認する。DOM button数の固定だけでなく、`event-day-open/refresh/offline/edit/delete-request`がoverview row clickだけでは発火しないことを確認する。

- [ ] **Step 3: `EventDayManagementView`を最小変更する**

row model表示を維持し、detail requestだけを親へ渡す。source label/count/offline error等の既存model情報を失わない。

- [ ] **Step 4: `ComipathSettings`へoverview/detail stateを追加する**

既存`<details>`をmobile/desktop list-detail shellへ置換する。まず同component内のprivate render methodで実装し、必要性が確認できた場合だけ新detail componentへ抽出する。

- [ ] **Step 5: 既存action event contractをdetail側へ移す**

overviewから削除した5 actionのevent contract testをdetail側へ移植し、正しい`ref`で1回dispatchされることを維持する。test削除だけで終わらせない。

- [ ] **Step 6: BrowserApplication接続を最小調整する**

既存handlerは維持する。`refresh/edit/delete`等の処理後に対象detailを開く必要がある場合、既存`openManagementDetail()`を`openManagementDetail(ref?)`相当に広げてよい。

新しいdetail selection eventをBrowserApplicationのbusiness eventとして扱う必要がなければ、settings内部だけで完結させる。

- [ ] **Step 7: E2E helperをlist/detail検証用に分ける**

現行`tests/e2e/management.spec.ts`の`openSettings()`はmanagementを開いた後に`.management-detail-surface`を自動で開く。新UXではこのhelperをそのまま使うとoverview→detailの本番経路を迂回し、偽陽性になり得る。

少なくとも次を分ける。

- management overviewを開くだけのhelper
- active detailへ実UI操作で進むhelper

list/detail自体をtestするcaseではpublic methodや直接state設定でdetailへ入らない。

- [ ] **Step 8: mobile E2Eを追加/更新する**

```text
管理open
→ day2 row detail
→ day2 detail表示、main active dayはday1のまま
→ back
→ overview
→ day2 detail
→ この日程を開く
→ management close、main active dayがday2
```

さらに既存のGAS再読込、CSV編集、offline準備、delete、outbox操作をdetail経由へ更新する。

非selected rowの`再読込`等を押した場合は、現行handlerどおり対象dayがactiveになってから処理されることを少なくとも代表caseで確認する。

- [ ] **Step 9: desktop 2-pane E2Eを追加する**

listとdetailが同時に見え、row切替だけではmain active dayが変わらないことを確認する。横scroll tableを要求しない。

- [ ] **Step 10: keyboard / 200% zoom / nested dialogを確認する**

- row→detail→backがkeyboardで操作可能。
- 44px targetを維持。
- source diff/delete/outbox dialogのfocus containmentを維持。
- 200% zoomで主要actionへ到達できる。

- [ ] **Step 11: targeted verification**

```bash
npm run test:webapp
npx playwright test tests/e2e/management.spec.ts
npm run check:webapp
git diff --check
```

- [ ] **Step 12: implementation commit**

production code/test/snapshotのうち、このTaskで実際に変更したものだけをstageする。`docs/status/progress.md`へこのcommit自身のSHAを同じcommit内で書こうとしない。進捗確定はTask 7で行う。

## 受入条件

- mobile overview rowに5 business actionを常設しない。
- mobileはlist→detail→backが明確。
- detailを見るだけではactive dayを変更しない。
- `この日程を開く`は既存event-day transitionを行いmanagementを閉じる。
- `再読込`、offline準備、編集、削除は既存BrowserApplication handler/Use Caseへ接続され、既存の対象day切替 semanticsを独断変更しない。
- unconfigured dayは既存設定経路へ接続する。
- desktopは同じmodel/stateで2-pane。
- active day専用source/outbox controlsを非selected row用と誤表示しない。
- nested modal、keyboard、200% zoom、safe-areaが回帰しない。
- 新detail componentを作る場合、その必要性が既存`ComipathSettings`の責務分割から説明できる。
