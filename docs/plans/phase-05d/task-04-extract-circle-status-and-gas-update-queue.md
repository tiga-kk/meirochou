# Phase 5D Task 4: Extract Circle Status and Pending GAS Updates

**Status:** PLANNED
**Depends on:** Task 3.1 reviewed and merged into the Phase 5D branch
**Commit candidate:** `refactor(circle-status): extract status and pending gas updates`

## Goal

purchase、hold、excluded、pending復帰、short-lived undo、purchase取消、pending GAS updateの再送・破棄・background deliveryをCircle Status featureへ移す。

pending GAS updatesの永続正本は既存`LocalEventDayState.gasOutbox`だけとする。別のLocalStorage key、別queue database、別mutable collectionを作らない。

## Non-goals

- GAS request/response contract変更
- `gasOutbox` field名またはJSON shape変更
- LocalStorage schema変更
- route guidance algorithm変更
- source import/refresh UI移動
- generic event bus導入
- `LocalStoragePendingGasUpdateQueue`の作成

## Files

### Create

- `apps/webapp/js/features/circle-status/domain/circle-status-types.ts`
- `apps/webapp/js/features/circle-status/domain/apply-circle-status-change.ts`
- `apps/webapp/js/features/circle-status/domain/pending-gas-update-state.ts`
- `apps/webapp/js/features/circle-status/use-cases/change-circle-status.ts`
- `apps/webapp/js/features/circle-status/use-cases/undo-circle-status-change.ts`
- `apps/webapp/js/features/circle-status/use-cases/send-pending-gas-updates.ts`
- `apps/webapp/js/features/circle-status/use-cases/discard-pending-gas-updates.ts`
- `apps/webapp/js/features/circle-status/use-cases/pending-gas-update-delivery.ts`
- `apps/webapp/js/features/circle-status/use-cases/pending-gas-update-background-process.ts`
- `apps/webapp/js/features/circle-status/infrastructure/gas-pending-update-delivery.ts`
- `apps/webapp/js/features/circle-status/ui/circle-status-controller.ts`
- `apps/webapp/js/features/circle-status/ui/pending-gas-updates-controller.ts`
- `apps/webapp/js/features/circle-status/ui/pending-gas-updates-panel-model.ts`
- `apps/webapp/js/features/circle-status/public-api.ts`
- `tests/change-circle-status.test.ts`
- `tests/send-pending-gas-updates.test.ts`
- `tests/circle-status-controller.test.ts`
- `tests/pending-gas-updates-controller.test.ts`

### Move and rename

- `apps/webapp/js/state/circle-state-undo-service.ts`
  → `apps/webapp/js/features/circle-status/use-cases/short-lived-circle-status-undo.ts`

### Refactor then delete

- `apps/webapp/js/state/purchase-mutation-service.ts`
- `apps/webapp/js/state/gas-outbox-service.ts`
- `apps/webapp/js/state/gas-sync-coordinator.ts`

これらの保存・送信挙動をnew domain/Use Cases/infrastructureへ移した後、old filesを削除する。old path re-export shimを作らない。

### Modify

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/types/domain.ts`
- `apps/webapp/js/ui/management-view-model.ts`
- `apps/webapp/js/ui/management-events.ts`
- `apps/webapp/js/components/circle-detail-dialog.ts`
- `apps/webapp/js/components/outbox-panel.ts`
- `apps/webapp/js/components/comipath-settings.ts`
- existing purchase/outbox/sync tests
- `scripts/check-webapp-architecture.mjs`
- `scripts/webapp-architecture-legacy-allowlist.json`
- `package.json`

## Preflight

```bash
git status --short --branch

test -e apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository.ts
test -e apps/webapp/js/state/purchase-mutation-service.ts
test -e apps/webapp/js/state/circle-state-undo-service.ts
test -e apps/webapp/js/state/gas-outbox-service.ts
test -e apps/webapp/js/state/gas-sync-coordinator.ts
test ! -e apps/webapp/js/features/circle-status/use-cases/change-circle-status.ts
test ! -e apps/webapp/js/features/circle-status/infrastructure/local-storage-pending-gas-update-queue.ts

npm run test:webapp
npm run check:webapp
npm run build:webapp
```

Task 3.1のacceptance criteriaを満たさない場合は開始しない。

## Final contracts

```ts
export type CircleStatus =
  | "pending"
  | "held"
  | "purchased"
  | "excluded";
```

```ts
export interface ChangeCircleStatusInput {
  readonly eventDay: EventDayRef;
  readonly circleSpace: string;
  readonly nextStatus: CircleStatus;
  readonly expectedSourceGeneration: string;
  readonly changedAt: string;
}
```

```ts
export interface ChangeCircleStatusResult {
  readonly state: LocalEventDayState;
  readonly previousStatus: CircleStatus;
  readonly currentStatus: CircleStatus;
  readonly undoToken: CircleStatusUndoToken | null;
  readonly pendingGasUpdateId: string | null;
}
```

```ts
export interface PendingGasUpdateDelivery {
  deliver(update: PendingGasUpdate): Promise<void>;
}
```

```ts
export interface PendingGasUpdateBackgroundProcess {
  start(): void;
  requestSend(): void;
  stop(): void;
}
```

Use Casesは`EventDayRepository`と`ActiveEventDaySession`へ依存する。LocalStorage class、GAS client concrete classをimportしない。

## Persistence transaction

purchaseまたはpurchase取消の処理順序を固定する。

1. current stateをRepositoryからloadする。
2. event/day、circle、source generationを検証する。
3. `circleStates`を更新したnext stateを作る。
4. 必要なら同じnext stateの`gasOutbox`へpending updateをappendする。
5. next stateをRepositoryへ一回saveする。
6. active event/dayならSessionをnext stateへreplaceする。
7. save成功後にbackground processへ`requestSend()`する。
8. View/route guidanceへresultを通知する。

statusとpending updateを別々のLocalStorage writeで保存しない。save失敗時はstatusとpending updateの両方が未反映でなければならない。

## Delivery transaction

送信成功:

1. latest stateをload
2. source generationとentry identityを再検証
3. GAS delivery
4. entryを`gasOutbox`からremoveしたstateをsave
5. active event/dayならSessionを更新

送信失敗:

1. raw response/body/URLを保存しない
2. safe categoryだけを`lastError`へ設定
3. `attempts`をincrement
4. updated stateをsave
5. queueを保持

## TDD procedure

- [ ] **Step 1: atomic local-first RED testを書く**

call orderではなくpersisted stateを検証する。

```ts
const result = changeCircleStatus.execute(input);

expect(savedState.circleStates["A01"]).toBe("purchased");
expect(savedState.gasOutbox).toHaveLength(1);
expect(result.pendingGasUpdateId).toBe(savedState.gasOutbox[0].id);
expect(backgroundProcess.requestSend).toHaveBeenCalledAfter(repository.save);
```

saveをthrowさせた場合はSession更新と`requestSend()`が0回であることも確認する。

- [ ] **Step 2: non-purchase transitionsのRED testを書く**

- pending → held: outbox追加なし
- pending → excluded: outbox追加なし
- held/excluded → pending: outbox追加なし
- pending/held → purchased: `purchased: true`
- purchased → pending/held/excluded: `purchased: false`

- [ ] **Step 3: stale/undo RED testsを書く**

- source generation mismatch拒否
- missing circle拒否
- expired undo拒否
- wrong previous/current statusのundo拒否
- duplicate/replayed undo拒否

- [ ] **Step 4: delivery RED testsを書く**

- success removes only delivered entry
- failure keeps entry and increments attempts
- event/day changed during network wait does not corrupt latest state
- source generation changed during wait rejects stale result
- `stop()` prevents subsequent online/retry callbacks

- [ ] **Step 5: Controller RED testsを書く**

unknown input parser、View refresh、route guidance callback、retry/discard confirmation、stop後stale callback拒否をfake Viewで検証する。ControllerからDOM global、Repository concrete、GAS clientを直接使わない。

- [ ] **Step 6: REDを確認する**

```bash
npx vitest run --root . \
  tests/change-circle-status.test.ts \
  tests/send-pending-gas-updates.test.ts \
  tests/circle-status-controller.test.ts \
  tests/pending-gas-updates-controller.test.ts
```

- [ ] **Step 7: domain transitionsを実装する**

`apply-circle-status-change.ts`と`pending-gas-update-state.ts`をpure functionsとして実装する。Date、crypto、Repository、GASをimportしない。

- [ ] **Step 8: ChangeCircleStatusとundoを実装する**

Repository load/save、Session replace、clock/ID factory interface、background process requestの順序を明示する。一回のstatus変更でrepository saveは一回だけ。

- [ ] **Step 9: delivery infrastructureを分離する**

`GasPendingUpdateDelivery`だけがexisting GAS request client/protocolを知る。public APIからexportしない。raw transport errorをsafe categoryへ変換する。

- [ ] **Step 10: sender/background processを実装する**

EventDayRepositoryの`listEventDays()`と`load()`でpersisted outboxを列挙する。別queue storeを作らない。online listener、in-flight process、stop lifecycleを一つのownerへ置く。

- [ ] **Step 11: Controllersをproduction eventsへ接続する**

purchase、hold、exclude、restore、undo、retry、discard eventsをnew Controllersへbindする。route guidanceとの連携はcircle-status public result/callbackだけを使う。

- [ ] **Step 12: legacy filesをdelegatorにしてから削除する**

一時delegationでexisting testsをGREENにし、production callerを0にしてold purchase/outbox/sync filesを削除する。

- [ ] **Step 13: public APIを確認する**

public APIはdomain typesとcapability interfacesだけをexportする。`GasPendingUpdateDelivery` concrete classやDOM Viewをexportしない。

- [ ] **Step 14: test scriptとarchitecture checkerを更新する**

新しいtest filesを`test:webapp`へ登録する。Use Case concrete import、public API concrete export、new vague namesをarchitecture checkerで拒否する。

- [ ] **Step 15: focused verificationを実行する**

```bash
npx vitest run --root . \
  tests/change-circle-status.test.ts \
  tests/send-pending-gas-updates.test.ts \
  tests/circle-status-controller.test.ts \
  tests/pending-gas-updates-controller.test.ts \
  tests/purchase-mutation-service.test.ts \
  tests/purchase-flow.test.ts \
  tests/gas-outbox-service.test.ts \
  tests/gas-sync-coordinator.test.ts \
  tests/outbox-panel.test.ts \
  tests/outbox-panel-app.test.ts

node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 16: regressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npx playwright test --grep "purchase|hold|pending GAS"
git diff --check
```

- [ ] **Step 17: self-reviewする**

```bash
rg 'local-storage-pending-gas-update|LocalStoragePendingGasUpdate' apps/webapp/js tests
rg 'gasOutbox' apps/webapp/js/features/circle-status
rg 'GasPendingUpdateDelivery' apps/webapp/js/features/circle-status/public-api.ts
```

Expected:

- separate LocalStorage queueは0
- persisted queue accessはevent/day state経由
- concrete delivery exportは0

- [ ] **Step 18: commit**

```bash
git add -A \
  apps/webapp/js/features/circle-status \
  apps/webapp/js/state \
  apps/webapp/js/app.js \
  apps/webapp/js/data-manager.ts \
  apps/webapp/js/app \
  apps/webapp/js/types/domain.ts \
  apps/webapp/js/ui \
  apps/webapp/js/components \
  tests scripts package.json

git commit -m "refactor(circle-status): extract status and pending gas updates"
```

## Acceptance criteria

- circle status business ruleがApp/DataManagerに残らない。
- pending GAS updatesの永続正本が`LocalEventDayState.gasOutbox`だけである。
- statusとoutbox appendが一回のrepository saveでatomicに保存される。
- save失敗時にbackground deliveryが開始されない。
- senderがseparate LocalStorage queueを持たない。
- GAS concrete implementationがInfrastructureにあり、public APIからexportされない。
- local-first、stale generation、undo expiry、retry/discard semanticsが維持される。
- background senderのstart/stop ownerが一つである。
- new testsが通常`test:webapp`で実行される。
