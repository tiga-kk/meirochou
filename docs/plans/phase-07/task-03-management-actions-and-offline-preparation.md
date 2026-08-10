# Phase 7 Task 3: 再読込・編集・offline準備・削除actionを一覧へ接続

## 目標

Task 2のevent/day overviewを操作の起点にし、既存Use Caseを再利用して`開く`、`再読込`、`オフライン準備`、`編集`、`削除`をevent/day単位で実行できるようにする。

## やってはいけないこと

- row componentにbusiness logicを入れない。
- `再読込`でsource URL/sheetを毎回再入力させない。
- source変更時にpending GAS queueを新sourceへ暗黙移行しない。
- offline準備失敗でsource dataやpurchase stateをrollbackしない。
- offline保存をpage load時に自動で全件開始しない。

## Files

**Modify:**
- `apps/webapp/js/components/event-day-management-view.ts`
- `apps/webapp/js/components/circle-data-source-panel.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts`
- `apps/webapp/js/features/local-data-deletion/...`の既存公開操作
- `apps/webapp/js/features/catalog-offline/...`
- `apps/webapp/js/shared/ui/management-events.ts`

**Test:**
- `tests/event-day-management-actions.test.ts`
- `tests/e2e/management.spec.ts`
- `tests/e2e/catalog-offline.spec.ts`

## Interfaces

Management events:

```ts
type EventDayManagementActionDetail = { ref: EventDayRef };

"event-day-open-request"
"event-day-refresh-request"
"event-day-offline-request"
"event-day-edit-request"
"event-day-delete-request"
```

Offline action result:

```ts
interface OfflinePreparationResult {
  cachedCount: number;
  totalCount: number;
  failedCount: number;
}
```

## Steps

- [ ] **Step 1: action dispatch/ownershipのRED testを書く**

各buttonが正しい`ref`で1回だけeventを発火し、component自身がrepository/network/cacheを触らないことを固定する。

- [ ] **Step 2: `開く`のproduction integration RED testを書く**

rowから別dayを開くと既存`SwitchEventDayUseCase`/active sessionを通ってmain navigationへ戻り、選択dayが変わることを確認する。

- [ ] **Step 3: `再読込`のRED testを書く**

configured GAS rowでは保存済み`gasUrl + sheetName`を使って既存preview flowを開始し、source editorを開かなくてもdiff確認へ進めることを固定する。CSV sourceはbrowser file selectionが必要なので、`再読込`ではfile pickerへ誘導し、存在しない過去File objectを自動再利用しない。

- [ ] **Step 4: `オフライン準備`のRED testを書く**

current source circlesからcatalog URLを収集し、Cache Use Caseへ渡し、Phase 6.1 async indicatorへprogressを投影する。

```text
お品書きを保存中 31 / 52
→ お品書き 47 / 52 保存済み、5件失敗
```

- [ ] **Step 5: `編集`のRED testを書く**

GAS rowでは完全URL/sheetをdetail editorへ読み込む。pending GAS queue > 0でsourceを変更しようとした場合、既存queueを処理/破棄する明示確認なしにapplyできないことを固定する。

- [ ] **Step 6: `削除`をPhase 6.1 deletion flowへ接続する**

row refをscopeへ渡し、pending discard warningを含む既存confirmationを再利用する。別の削除ロジックをmanagement UI内へ作らない。

- [ ] **Step 7: action実装をcontroller/applicationへ接続する**

BrowserApplicationが巨大化する場合はevent bindingだけを薄いcontrollerへ分離してよいが、新しいgeneric Manager/Facadeを作らない。

- [ ] **Step 8: offline preparationのpartial failureを表示する**

failed URLsはconsoleだけでなく件数としてUIへ残す。個別URLの一覧表示はdetailで必要な場合だけにし、overview rowには`47 / 52`のようなsummaryを表示する。

- [ ] **Step 9: E2Eを追加する**

- day1→day2 `開く`。
- GAS `再読込`で保存済みsourceを使用。
- offline準備でprogress更新。
- network failureを混ぜても成功cache維持。
- edit sourceのpending queue guard。
- delete confirmation。

- [ ] **Step 10: verification**

```bash
npx vitest run --root . tests/event-day-management-actions.test.ts
npm run test:webapp
npm run test:e2e:ci -- --grep "管理|再読込|オフライン"
npm run check:webapp
git diff --check
```

- [ ] **Step 11: commit**

```bash
git add apps/webapp/js/components apps/webapp/js/app \
  apps/webapp/js/features/circle-data-source \
  apps/webapp/js/features/catalog-offline \
  apps/webapp/js/shared/ui/management-events.ts tests
git commit -m "feat(management): connect event day actions and offline preparation"
```

## 受入条件

- 一覧から5つの主要actionへ到達できる。
- GAS再読込は保存済みsourceを使う。
- CSV再読込は過去Fileを捏造せずfile pickerへ誘導する。
- offline準備はprogress/partial failureを表示する。
- source変更時に旧pending queueが新sourceへ送られない。
- 削除はPhase 6.1の共通deletion semanticsを再利用する。
