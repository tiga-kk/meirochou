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
- `apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-dialog-model.ts`
- `apps/webapp/js/components/storage-delete-dialog.ts`
- `tests/delete-local-data.test.ts`
- `tests/local-data-deletion-controller.test.ts`
- `tests/management-session.test.ts`
- `tests/e2e/management.spec.ts`

## Interfaces

`DeleteOptionViewModel`はpending outboxをbutton lockとしてではなくwarning metadataとして表現する。Phase 6.1では既存consumerへの変更を最小化するため`blocked`/`blockedReason` field自体は維持するが、pending countだけを理由にblockしない。

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

`buildDeleteOptions()`では4 scopeともpending GASの存在だけでは次になる。

```ts
{
  blocked: false,
  blockedReason: null,
  pendingDiscardCount: scopeに属するpending件数,
}
```

Use Case側の削除契約:

```ts
activity       => circleStates = {}, gasOutbox = []
circle-source  => source/circles reset, gasOutbox = []
event-day      => repository entry delete
all-event-days => all repository entries delete
```

`local-data-deletion-dialog-model.ts`はactive delete optionの`pendingDiscardCount`をconfirmation modelへコピーする。`storage-delete-dialog.ts`は0件より大きいときだけ破棄warningを表示する。

## Steps

- [ ] **Step 1: pending outbox付きUse Case削除のRED testを書く**

`tests/delete-local-data.test.ts`へ最低限次を追加する。

```ts
it("deletes all event days even when GAS outbox exists", async () => {
  await useCase.execute({ kind: "all-event-days" });
  expect(repository.listEventDaysForDeletion()).toEqual([]);
});

it("clears activity and its pending GAS outbox together", async () => {
  await useCase.execute({ kind: "activity", eventDay: ref });
  expect(repository.load(ref)?.circleStates).toEqual({});
  expect(repository.load(ref)?.gasOutbox).toEqual([]);
});

it("clears circle source and its pending GAS outbox together", async () => {
  await useCase.execute({ kind: "circle-source", eventDay: ref });
  expect(repository.load(ref)?.circles).toEqual([]);
  expect(repository.load(ref)?.gasOutbox).toEqual([]);
});
```

- [ ] **Step 2: delete option/dialog modelのRED testを書く**

`tests/management-session.test.ts`でpending countがあっても`blocked=false`、scopeに応じた`pendingDiscardCount`が入ることを固定する。

`tests/local-data-deletion-controller.test.ts`ではpendingを含むscopeでもconfirmation requestが`DeleteLocalDataUseCase`まで到達することを確認する。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . \
  tests/delete-local-data.test.ts \
  tests/local-data-deletion-controller.test.ts \
  tests/management-session.test.ts
```

現行`assertNoPendingUpdates()`またはpendingによる`blocked=true`のため失敗することを確認する。

- [ ] **Step 4: `buildDeleteOptions()`をwarning semanticsへ変更する**

scopeごとの`pendingDiscardCount`を次で固定する。

```text
circles/event-day/activity => selectedPendingCount
all-events                 => totalPendingCount
```

pending countだけを理由にbuttonをdisabledへしない。

- [ ] **Step 5: `DeleteLocalDataUseCase`からpending拒否を外し、scopeごとにqueueを整合させる**

`assertNoPendingUpdates()`を削除する。

- `activity`: 保存するnext stateを`circleStates:{}`, `gasOutbox:[]`にする。
- `circle-source`: `emptySourceState()`の戻り値で`gasOutbox:[]`にする。
- `event-day`: entry deleteによりqueueも削除される。
- `all-event-days`: 全entry deleteにより全queueも削除される。

route guidance snapshot/matrix cleanupの既存scope契約は変更しない。

- [ ] **Step 6: confirmation modelへ破棄件数を渡す**

`local-data-deletion-dialog-model.ts`の表示modelへ次を追加する。

```ts
readonly pendingDiscardCount: number;
```

`storage-delete-dialog.ts`では`pendingDiscardCount > 0`のときだけ次のwarningを表示する。

```text
この操作では未送信GAS同期 3件も破棄されます。
GAS側へは送信されません。
```

0件ならwarningを表示しない。confirm/cancelの既存二段階操作は維持する。

- [ ] **Step 7: E2Eを追加する**

`tests/e2e/management.spec.ts`で、pending outboxをseedした状態から次を確認する。

1. 「全日程データの削除」がenabled。
2. clickするとconfirmationにpending件数が出る。
3. cancelするとstate/outboxが維持される。
4. 再度開いてconfirmするとevent/day state、outbox、navigation snapshotが削除される。
5. GAS POSTは発生しない。

- [ ] **Step 8: focused/full verification**

```bash
npx vitest run --root . \
  tests/delete-local-data.test.ts \
  tests/local-data-deletion-controller.test.ts \
  tests/management-session.test.ts
npm run test:webapp
npx playwright test tests/e2e/management.spec.ts --grep "全日程|削除"
npm run check:webapp
git diff --check
```

- [ ] **Step 9: commit**

```bash
git add apps/webapp/js/shared/ui/management-view-model.ts \
  apps/webapp/js/features/local-data-deletion/use-cases/delete-local-data.ts \
  apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-dialog-model.ts \
  apps/webapp/js/components/storage-delete-dialog.ts \
  tests/delete-local-data.test.ts \
  tests/local-data-deletion-controller.test.ts \
  tests/management-session.test.ts \
  tests/e2e/management.spec.ts
git commit -m "fix(storage): allow explicit deletion with pending GAS updates"
```

## 受入条件

- pending GAS queueがあっても全日程削除buttonを押せる。
- queue破棄件数をconfirmationで確認できる。
- cancel時はqueue/dataとも変化しない。
- confirm時は削除scopeに属するqueueが残らない。
- remote GAS送信は発生しない。
