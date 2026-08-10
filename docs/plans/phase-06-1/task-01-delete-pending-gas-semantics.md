# Phase 6.1 Task 1: 削除scopeとpending GAS outboxの意味を修正

## 目標

未送信GAS同期が存在しても、ユーザーが明示したローカル削除を実行できるようにする。削除scopeと意味的に結び付くoutboxは削除対象へ含め、実行前に破棄件数を明示する。

## やってはいけないこと

- 削除前にGAS送信成功を必須にしない。
- pending outboxを黙って捨てない。
- 削除後に旧source/旧activityに属するoutboxを残さない。
- GAS remote stateをローカル削除に合わせて自動改変しない。
- unrelatedなLocalStorage schema変更を行わない。

## Files

**Modify:**
- `apps/webapp/js/shared/ui/management-view-model.ts`
- `apps/webapp/js/features/local-data-deletion/use-cases/delete-local-data.ts`
- `apps/webapp/js/components/storage-delete-dialog.ts`
- 必要なら`apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-dialog-model.ts`

**Test:**
- 既存local-data-deletion関連test
- 既存management view model関連test
- `tests/e2e/management.spec.ts`

## Interfaces

`DeleteOptionViewModel`はpending outboxをbutton lockとしてではなくwarningとして表現する。

```ts
export interface DeleteOptionViewModel {
  readonly scope: DeleteScope;
  readonly label: string;
  readonly consequence: string;
  readonly blocked: boolean;
  readonly blockedReason: string | null;
  readonly pendingDiscardCount: number;
}
```

Phase 6.1で`blocked`を完全削除しても既存consumerが安全に追従できるなら削除してよい。ただしpending countを理由に`blocked=true`へしないことが本質である。

Use Case側の削除契約:

```ts
activity     => circleStates = {}, gasOutbox = []
circle-source => source/circles reset, gasOutbox = []
event-day    => repository entry delete
all-event-days => all repository entries delete
```

## Steps

- [ ] **Step 1: pending outbox付き削除のRED testを書く**

少なくとも次を固定する。

```ts
it("deletes all event days even when GAS outbox exists", async () => {
  // two event/day states, one or more pending GAS entries
  await useCase.execute({ kind: "all-event-days" });
  expect(repository.listEventDaysForDeletion()).toEqual([]);
});

it("clears activity and its pending GAS outbox together", async () => {
  await useCase.execute({ kind: "activity", eventDay: ref });
  expect(repository.load(ref)?.circleStates).toEqual({});
  expect(repository.load(ref)?.gasOutbox).toEqual([]);
});
```

- [ ] **Step 2: REDを確認する**

Run:

```bash
npm run test:webapp -- --runInBand
```

少なくとも現行`assertNoPendingUpdates()`またはblocked modelにより失敗することを確認する。

- [ ] **Step 3: `buildDeleteOptions()`をwarning semanticsへ変更する**

`selectedPendingCount`/`totalPendingCount`から`pendingDiscardCount`を作る。pending countだけを理由にbuttonをdisabledへしない。

- [ ] **Step 4: `DeleteLocalDataUseCase`からpending拒否を外し、scopeごとにqueueを整合させる**

`activity`と`circle-source`では保存するnext stateの`gasOutbox`を空配列にする。`event-day`/`all-event-days`はentry削除によりqueueも消えることをtestで固定する。

- [ ] **Step 5: confirmationに破棄件数を表示する**

例:

```text
この操作では未送信GAS同期 3件も破棄されます。
GAS側へは送信されません。
```

0件ならこのwarningを表示しない。

- [ ] **Step 6: E2Eを追加する**

`tests/e2e/management.spec.ts`で、pending outboxをseedした状態から「全日程データの削除」がenabledであること、confirmationに件数が出ること、confirm後に初期状態へ戻ることをproduction DOM wiringで確認する。

- [ ] **Step 7: focused/full verification**

```bash
npm run test:webapp
npm run test:e2e:ci -- --grep "全日程|削除"
npm run check:webapp
git diff --check
```

- [ ] **Step 8: commit**

```bash
git add apps/webapp/js/shared/ui/management-view-model.ts \
  apps/webapp/js/features/local-data-deletion \
  apps/webapp/js/components/storage-delete-dialog.ts \
  tests
git commit -m "fix(storage): allow explicit deletion with pending GAS updates"
```

## 受入条件

- pending GAS queueがあっても全日程削除buttonを押せる。
- queue破棄件数をconfirmation前に確認できる。
- cancel時はqueue/dataとも変化しない。
- confirm時は削除scopeに属するqueueが残らない。
- remote GAS送信は発生しない。
