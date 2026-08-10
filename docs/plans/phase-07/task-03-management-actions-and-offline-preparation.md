# Phase 7 Task 3: 再読込・編集・offline準備・削除actionを一覧へ接続

## 目標

Task 2のevent/day overviewを操作の起点にし、既存Use Caseを再利用して`開く`、`再読込`、`オフライン準備`、`編集`、`削除`をevent/day単位で実行できるようにする。ローカル削除後には、そのscopeで不要になったcatalog cacheもbest-effortで整理する。

## やってはいけないこと

- row componentにbusiness logicを入れない。
- `再読込`でsource URL/sheetを毎回再入力させない。
- source変更時にpending GAS queueを新sourceへ暗黙移行しない。
- offline準備失敗でsource dataやpurchase stateをrollbackしない。
- offline保存をpage load時に自動で全件開始しない。
- catalog cache削除失敗をローカルデータ削除の失敗へ昇格させない。
- ローカル削除後にrepositoryから消えたstateだけを読んで削除対象catalog URLを復元しようとしない。候補URLは削除実行前に収集する。
- あるevent/dayを削除しただけで、別event/dayも参照している同一catalog URLをCache Storageから消さない。
- cleanup対象の残存参照を確認できない場合に、推測で共有cacheを削除しない。

## Files

**Create:**
- `apps/webapp/js/app/delete-local-data-with-catalog-cleanup.ts`

**Modify:**
- `apps/webapp/js/components/event-day-management-view.ts`
- `apps/webapp/js/components/circle-data-source-panel.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts`
- `apps/webapp/js/features/catalog-offline/use-cases/cache-event-day-catalogs.ts`
- `apps/webapp/js/features/catalog-offline/use-cases/get-catalog-offline-status.ts`
- `apps/webapp/js/features/catalog-offline/public-api.ts`
- `apps/webapp/js/shared/ui/management-events.ts`

**Test:**
- `tests/delete-local-data-with-catalog-cleanup.test.ts`
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

Deletion wrapperは既存`DeleteLocalDataOperation`と同じinterfaceを実装する。

```ts
export class DeleteLocalDataWithCatalogCleanup
  implements DeleteLocalDataOperation {
  constructor(
    private readonly inner: DeleteLocalDataOperation,
    private readonly repository: EventDayRepository,
    private readonly offlineCache: CatalogOfflineCachePort,
  ) {}

  execute(scope: LocalDataDeletionScope): Promise<void>;
}
```

`execute()`は次の順序を守る。

1. 削除前に、scopeから消える可能性があるcatalog URLを`candidateUrls`としてsnapshotする。
2. `inner.execute(scope)`を実行する。失敗した場合はcache cleanupを行わず、その失敗をそのまま返す。
3. local deletion成功後、repositoryに残る全event/dayのcurrent catalog URL unionを`remainingReferencedUrls`として取得する。
4. `candidateUrls - remainingReferencedUrls`だけを`offlineCache.remove()`へ渡す。
5. cache remove失敗はdiagnosticへ残してよいが、成功済みlocal deletionを失敗へ変えない。

同じcatalog URLはevent/dayを跨いで共有できるため、「削除scopeに含まれていたURL」だけでは削除条件にならない。local deletion後に他stateからも参照されなくなったURLだけをcleanup対象にする。

local deletion後の残存参照確認自体が失敗した場合はfail-closedとし、その回のcache cleanupをskipする。共有cacheを誤削除するより、不要cacheが一時的に残る方を選ぶ。

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

- [ ] **Step 6: deletion cache cleanupのRED testを書く**

少なくともevent-day、共有URL、all-event-daysを固定する。

```ts
it("removes only URLs no longer referenced after event-day deletion", async () => {
  // dayA: [sharedUrl, onlyA]
  // dayB: [sharedUrl]
  await operation.execute({ kind: "event-day", eventDay: dayA });

  expect(inner.execute).toHaveBeenCalledWith({
    kind: "event-day",
    eventDay: dayA,
  });
  expect(offlineCache.remove).toHaveBeenCalledWith([onlyA]);
  expect(offlineCache.remove).not.toHaveBeenCalledWith(
    expect.arrayContaining([sharedUrl]),
  );
});

it("does not roll back successful local deletion when cache cleanup fails", async () => {
  offlineCache.remove.mockRejectedValue(new Error("quota/cache failure"));
  await expect(operation.execute({ kind: "all-event-days" })).resolves.toBeUndefined();
  expect(inner.execute).toHaveBeenCalledTimes(1);
});
```

`all-event-days`では削除前の全stateからcatalog URL unionをdedupeして取得し、local deletion後のremaining setが空なら全candidate URLをcleanupできる。`activity`はcircle source自体を保持するためcatalog cacheを削除しない。`circle-source`と`event-day`は対象dayのURLをcandidateにするが、別dayからの残存参照を差し引いてからremoveする。

残存参照取得がthrowしたcaseでは`offlineCache.remove`を呼ばず、local deletion自体は成功として維持するtestも追加する。

- [ ] **Step 7: `削除`をPhase 6.1 deletion flowへ接続する**

composition rootで既存`DeleteLocalDataUseCase`を`DeleteLocalDataWithCatalogCleanup`でwrapし、`LocalDataDeletionController`へ同じ`DeleteLocalDataOperation`として注入する。management UI内へ別の削除ロジックを作らない。

- [ ] **Step 8: action実装をcontroller/applicationへ接続する**

BrowserApplicationが巨大化する場合はevent bindingだけを薄いcontrollerへ分離してよいが、新しいgeneric Manager/Facadeを作らない。

- [ ] **Step 9: offline preparationのpartial failureを表示する**

failed URLsはconsoleだけでなく件数としてUIへ残す。個別URLの一覧表示はdetailで必要な場合だけにし、overview rowには`47 / 52`のようなsummaryを表示する。

- [ ] **Step 10: E2Eを追加する**

- day1→day2 `開く`。
- GAS `再読込`で保存済みsourceを使用。
- offline準備でprogress更新。
- network failureを混ぜても成功cache維持。
- edit sourceのpending queue guard。
- delete confirmation。
- event-day/all-event-days削除後に、その時点で他dayから参照されていないcatalog cacheが残らない。
- 共有URLを持つ2日程で片方だけ削除しても、残る日程の共有URLはofflineで読める。
- cache cleanup failureまたは残存参照確認failureをinjectしてもlocal deletion結果は維持される。

- [ ] **Step 11: verification**

```bash
npx vitest run --root . tests/delete-local-data-with-catalog-cleanup.test.ts tests/event-day-management-actions.test.ts
npm run test:webapp
npx playwright test tests/e2e/management.spec.ts tests/e2e/catalog-offline.spec.ts
npm run check:webapp
git diff --check
```

- [ ] **Step 12: commit**

```bash
git add apps/webapp/js/components/event-day-management-view.ts \
  apps/webapp/js/components/circle-data-source-panel.ts \
  apps/webapp/js/app/delete-local-data-with-catalog-cleanup.ts \
  apps/webapp/js/app/browser-application.ts \
  apps/webapp/js/app/assemble-comipath-application.ts \
  apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller.ts \
  apps/webapp/js/features/catalog-offline \
  apps/webapp/js/shared/ui/management-events.ts \
  tests/delete-local-data-with-catalog-cleanup.test.ts \
  tests/event-day-management-actions.test.ts \
  tests/e2e/management.spec.ts tests/e2e/catalog-offline.spec.ts
git commit -m "feat(management): connect event day actions and offline preparation"
```

## 受入条件

- 一覧から5つの主要actionへ到達できる。
- GAS再読込は保存済みsourceを使う。
- CSV再読込は過去Fileを捏造せずfile pickerへ誘導する。
- offline準備はprogress/partial failureを表示する。
- source変更時に旧pending queueが新sourceへ送られない。
- 削除はPhase 6.1の共通deletion semanticsを再利用する。
- `circle-source`/`event-day`/`all-event-days`削除後は、他event/dayから参照されていないcatalog cacheだけをbest-effortで整理する。
- 共有catalog URLは参照するevent/dayが1つでも残る限り削除されない。
- cache cleanup failureはlocal deletion成功を取り消さない。
