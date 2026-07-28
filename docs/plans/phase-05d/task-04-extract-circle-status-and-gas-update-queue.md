# Phase 5D Task 4: Extract Circle Status and Pending GAS Updates

**Status:** PLANNED
**Depends on:** Task 3
**Commit candidate:** `refactor(circle-status): extract status and pending gas updates`

## Goal

purchase、hold、excluded、pending復帰、short-lived undo、purchaseに対応するpending GAS update、再送、破棄、background senderをCircle Status featureへ移す。`App`と`DataManager`からcircle statusのbusiness ruleとsync lifecycleを除く。

## Files

### Create

- `apps/webapp/js/features/circle-status/domain/circle-status-types.ts`
- `apps/webapp/js/features/circle-status/use-cases/change-circle-status.ts`
- `apps/webapp/js/features/circle-status/use-cases/undo-circle-status-change.ts`
- `apps/webapp/js/features/circle-status/use-cases/circle-status-actions.ts`
- `apps/webapp/js/features/circle-status/use-cases/pending-gas-update-actions.ts`
- `apps/webapp/js/features/circle-status/use-cases/pending-gas-update-queue.ts`
- `apps/webapp/js/features/circle-status/ui/circle-status-controller.ts`
- `apps/webapp/js/features/circle-status/ui/pending-gas-updates-controller.ts`
- `apps/webapp/js/features/circle-status/ui/pending-gas-updates-panel-model.ts`
- `apps/webapp/js/features/circle-status/public-api.ts`
- `tests/change-circle-status.test.ts`
- `tests/circle-status-controller.test.ts`
- `tests/pending-gas-updates-controller.test.ts`

### Move and rename

- `apps/webapp/js/state/circle-state-undo-service.ts`
  → `apps/webapp/js/features/circle-status/use-cases/short-lived-circle-status-undo.ts`
- `apps/webapp/js/state/gas-outbox-service.ts`
  → `apps/webapp/js/features/circle-status/infrastructure/local-storage-pending-gas-update-queue.ts`
- `apps/webapp/js/state/gas-sync-coordinator.ts`
  → `apps/webapp/js/features/circle-status/infrastructure/pending-gas-update-sender.ts`

### Replace and delete

- `apps/webapp/js/state/purchase-mutation-service.ts`
  - behaviorを`ChangeCircleStatus`へ移す
  - old class/fileをTask内で削除する
- `apps/webapp/js/ui/management-view-model.ts`
  - pending update panel types/functionsだけをnew panel modelへ移す
  - source/event-day/delete responsibilitiesはold fileに一時残す
- `apps/webapp/js/ui/management-events.ts`
  - `gas-retry-request`、`gas-discard-request` detailをfeature UIへ移す
  - remaining eventsはold fileに一時残す

### Modify

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/types/domain.ts`
- `apps/webapp/js/components/circle-detail-dialog.ts`
- `apps/webapp/js/components/outbox-panel.ts`
- `apps/webapp/js/components/comipath-settings.ts`
- `tests/purchase-mutation-service.test.ts`
- `tests/purchase-flow.test.ts`
- `tests/gas-outbox-service.test.ts`
- `tests/gas-sync-coordinator.test.ts`
- `tests/outbox-panel.test.ts`
- `tests/outbox-panel-app.test.ts`
- `scripts/webapp-architecture-legacy-allowlist.json`

## Preflight

```bash
test -e apps/webapp/js/state/purchase-mutation-service.ts
test -e apps/webapp/js/state/circle-state-undo-service.ts
test -e apps/webapp/js/state/gas-outbox-service.ts
test -e apps/webapp/js/state/gas-sync-coordinator.ts
test -e apps/webapp/js/ui/management-view-model.ts
test -e apps/webapp/js/ui/management-events.ts
test ! -e apps/webapp/js/features/circle-status/use-cases/change-circle-status.ts
```

## Interfaces

```ts
export type CircleStatus =
  | "pending"
  | "held"
  | "purchased"
  | "excluded";

export interface CircleStatusChange {
  readonly updatedState: LocalEventDayState;
  readonly previousStatus: CircleStatus;
  readonly currentStatus: CircleStatus;
  readonly undoToken: CircleStatusUndoToken | null;
  readonly pendingGasUpdateCreated: boolean;
}
```

```ts
export interface CircleStatusActions {
  changeStatus(input: {
    readonly eventDay: EventDayRef;
    readonly circleSpace: string;
    readonly newStatus: CircleStatus;
    readonly expectedSourceGeneration: string;
  }): CircleStatusChange;

  undoStatusChange(input: {
    readonly eventDay: EventDayRef;
    readonly undoToken: CircleStatusUndoToken;
  }): CircleStatusChange;
}
```

```ts
export interface PendingGasUpdateActions {
  sendPendingUpdates(eventDay: EventDayRef | null): Promise<GasSyncSummary>;
  discardPendingUpdates(input: {
    readonly eventDay: EventDayRef;
    readonly updateIds: readonly string[];
    readonly confirmationText: string;
  }): LocalEventDayState;
  startBackgroundSender(): void;
  stopBackgroundSender(): void;
}
```

```ts
export interface PendingGasUpdateQueue {
  enqueue(update: PendingGasUpdate): void;
  list(eventDay: EventDayRef | null): readonly PendingGasUpdate[];
  markAttempt(updateId: string, errorMessage: string | null): void;
  remove(updateIds: readonly string[]): void;
}
```

existing persisted `CircleVisitState`は`CircleStatus`へのcompatibility alias、`GasOutboxEntry`は`PendingGasUpdate`へのcompatibility aliasとしてTask 9まで残せる。JSON field名は変更しない。

## TDD procedure

- [ ] **Step 1: local-first purchaseのRED testを書く**

```ts
it("saves purchased status before requesting GAS delivery", () => {
  const calls: string[] = [];
  const changeCircleStatus = createChangeCircleStatusHarness({ calls });

  changeCircleStatus.execute({
    eventDay: ref,
    circleSpace: "A01",
    newStatus: "purchased",
    expectedSourceGeneration: "source-1",
  });

  expect(calls).toEqual([
    "save-event-day",
    "enqueue-pending-gas-update",
    "request-background-send",
  ]);
});
```

- [ ] **Step 2: non-purchase statusのRED testを書く**

held、excluded、pending復帰がpending GAS updateを作らないこと、purchase取消だけが`purchased: false` updateを作ることを検証する。

- [ ] **Step 3: stale source、undo expiry、queue retry/discardのRED testを書く**

confirmation textは既存の正確な文字列を維持する。raw GAS URLやsheet内容をerror modelへ出さない。

- [ ] **Step 4: ControllerのRED testを書く**

circle status result、circle progress refresh、route guidance continuation callback、pending update panel rendering、disposeをfake Viewで検証する。ControllerからDOM、LocalStorage、GAS clientを直接使用しない。

- [ ] **Step 5: REDを確認する**

```bash
npx vitest run --root . tests/change-circle-status.test.ts \
  tests/circle-status-controller.test.ts \
  tests/pending-gas-updates-controller.test.ts
```

- [ ] **Step 6: domain typeを明確な名前へ移す**

`CircleStatus`、`CircleStatusUndoToken`、`PendingGasUpdate`をfeature domainへ置く。persisted shapeとserialized valueを変更しない。

- [ ] **Step 7: existing undo/queue/senderをrename/moveする**

algorithmとretry timingを変えず、class/file名を責務に合わせる。moveとlogic変更は別commit stepではなく、同Task内の別diff blockとしてreview可能にする。

- [ ] **Step 8: `ChangeCircleStatus`を実装する**

`ActiveEventDaySession`、`EventDayRepository`、`PendingGasUpdateQueue`へ依存する。purchase updateはstate保存後だけenqueueする。save失敗時にqueueへ書かない。

- [ ] **Step 9: two Controllersを実装する**

- `CircleStatusController`: purchase、hold、exclude、restore、undo
- `PendingGasUpdatesController`: retry、discard、panel model

event detailは`unknown`からparserを通す。

- [ ] **Step 10: legacy applicationへ接続する**

purchase/hold buttons、circle detail events、pending GAS update panel eventsをnew Controllersへ接続する。route guidanceとの連携は`CircleStatusChangeListener` public contractで通知し、legacy App methodを直接呼ばない。

- [ ] **Step 11: dependency assemblyへsingletonを接続する**

queue、sender、actions、Controllersを一回ずつ生成する。background senderのstart/stopをapplication lifecycleへ接続する。

- [ ] **Step 12: DataManager compatibility methodsをdelegationへ変更する**

`addPurchased`、`addHold`、retry/discard等が残る場合はnew actionsへ委譲する。business branchを残さない。

- [ ] **Step 13: management filesを責務別に縮小する**

pending update modelとeventsをold generic filesから削除する。remaining source/event-day/delete codeだけを一時残す。

- [ ] **Step 14: allowlistを縮小する**

circle status、pending GAS updates、sync lifecycleに関するApp/DataManager violationsを削除する。

- [ ] **Step 15: focused verificationを実行する**

```bash
npx vitest run --root . tests/change-circle-status.test.ts \
  tests/circle-status-controller.test.ts \
  tests/pending-gas-updates-controller.test.ts \
  tests/purchase-mutation-service.test.ts tests/purchase-flow.test.ts \
  tests/gas-outbox-service.test.ts tests/gas-sync-coordinator.test.ts \
  tests/outbox-panel.test.ts tests/outbox-panel-app.test.ts
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

- [ ] **Step 17: commit**

```bash
git add -A apps/webapp/js/features/circle-status \
  apps/webapp/js/state/purchase-mutation-service.ts \
  apps/webapp/js/state/circle-state-undo-service.ts \
  apps/webapp/js/state/gas-outbox-service.ts \
  apps/webapp/js/state/gas-sync-coordinator.ts \
  apps/webapp/js/ui/management-view-model.ts \
  apps/webapp/js/ui/management-events.ts \
  apps/webapp/js/app.js apps/webapp/js/data-manager.ts \
  apps/webapp/js/app apps/webapp/js/types/domain.ts \
  apps/webapp/js/components tests \
  scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(circle-status): extract status and pending gas updates"
```

## Acceptance criteria

- circle status business ruleがApp/DataManagerに残らない。
- purchaseだけがexisting GAS update contractへ反映される。
- local-first、stale generation、undo expiry、retry/discard semanticsが維持される。
- pending GAS update queueとsenderのownerが一つである。
- generic management model/event fileからpending update責務が除かれる。
- new namesがcanonical naming rulesに従う。
