# Phase 5D Task 4: Circle State and Sync Extraction

**Status:** PLANNED
**Depends on:** Task 3
**Commit candidate:** `refactor(circle-state): extract mutations and sync commands`

## Goal

purchase、hold、excluded、pending復帰、短時間undo、GAS purchase mutation、outbox flushをCircle State featureへ移す。`App`と`DataManager`はcircle mutationの業務分岐を持たない。

## Files

### Create

- `apps/webapp/js/features/circle-state/domain/circle-state.ts`
- `apps/webapp/js/features/circle-state/application/change-circle-state.ts`
- `apps/webapp/js/features/circle-state/application/undo-circle-state.ts`
- `apps/webapp/js/features/circle-state/application/circle-state-commands.ts`
- `apps/webapp/js/features/circle-state/ports/circle-state-port.ts`
- `apps/webapp/js/features/circle-state/presentation/circle-state-controller.ts`
- `apps/webapp/js/features/circle-state/index.ts`
- `tests/circle-state-use-cases.test.ts`
- `tests/circle-state-controller.test.ts`

### Move

- `apps/webapp/js/state/purchase-mutation-service.ts` → `apps/webapp/js/features/circle-state/infrastructure/purchase-mutation-adapter.ts`
- `apps/webapp/js/state/circle-state-undo-service.ts` → `apps/webapp/js/features/circle-state/application/circle-state-undo-service.ts`
- `apps/webapp/js/state/gas-outbox-service.ts` → `apps/webapp/js/features/circle-state/infrastructure/gas-outbox-adapter.ts`
- `apps/webapp/js/state/gas-sync-coordinator.ts` → `apps/webapp/js/features/circle-state/infrastructure/gas-sync-coordinator.ts`

### Modify

- `apps/webapp/js/app.js`
- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/app/composition-root.ts`
- relevant purchase/outbox/sync tests
- `scripts/webapp-architecture-legacy-allowlist.json`

## Interfaces

```ts
export interface CircleStateChangeResult {
  readonly state: LocalEventDayState;
  readonly before: CircleVisitState;
  readonly after: CircleVisitState;
  readonly undoToken: CircleStateUndoToken | null;
  readonly outboxQueued: boolean;
}

export interface CircleStateCommands {
  change(input: {
    readonly ref: EventDayRef;
    readonly space: string;
    readonly nextState: CircleVisitState;
    readonly expectedSourceGeneration: string;
  }): CircleStateChangeResult;

  undo(input: {
    readonly ref: EventDayRef;
    readonly token: CircleStateUndoToken;
  }): CircleStateChangeResult;
}
```

`EventDayRef`、`LocalEventDayState`、`CircleVisitState`、`CircleStateUndoToken`、`GasOutboxEntry`、`GasSyncSummary`はTask開始時点の既存domain型を再利用する。

```ts
export interface GasOutboxCommands {
  retry(ref: EventDayRef | null): Promise<GasSyncSummary>;
  discard(input: {
    readonly ref: EventDayRef;
    readonly ids: readonly string[];
    readonly confirmation: string;
  }): LocalEventDayState;
  start(): void;
  dispose(): void;
}
```

```ts
export interface CircleStateController {
  purchaseCurrent(space: string): Promise<void>;
  holdCurrent(space: string): Promise<void>;
  setExcluded(space: string): Promise<void>;
  restorePending(space: string): Promise<void>;
  undo(token: string): Promise<void>;
  dispose(): void;
}
```

ControllerのView dependencyは次の最小contractにする。

```ts
export interface CircleStateView {
  showMutationResult(model: CircleStateResultViewModel): void;
  showError(message: string): void;
  refreshCounts(): void;
}
```

## TDD Procedure

- [ ] **Step 1: Use CaseのRED testを書く**

purchaseがLocalStorage stateとoutboxをlocal-first順序で更新し、hold/excludedはGAS outboxへ追加しないことを検証する。

```ts
it("persists purchase before requesting outbox delivery", () => {
  const order: string[] = [];
  const harness = createCircleStateHarness({ order });

  harness.commands.change({
    ref,
    space: "A01",
    nextState: "purchased",
    expectedSourceGeneration: "source-1",
  });

  expect(order).toEqual(["save-state", "enqueue-outbox", "request-flush"]);
});
```

- [ ] **Step 2: ControllerのRED testを書く**

UI message、count refresh、navigation callbackの呼出し順をfakeで固定する。ControllerからDOMを直接触らない。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/circle-state-use-cases.test.ts tests/circle-state-controller.test.ts
```

- [ ] **Step 4: existing serviceをfeatureへmoveする**

public behaviorとerror class名を維持する。移動に伴うimport変更以外のalgorithm変更を混ぜない。

- [ ] **Step 5: Circle State Commandsを実装する**

`ActiveEventDaySession`とPortを使い、成功後のstateをsessionへ反映する。DataManagerのarray再構築を呼ばない。

- [ ] **Step 6: ControllerをAppへ接続する**

`btn-purchased`、`btn-hold`、circle detailのstate change eventをControllerへ渡す。navigation継続はNavigation featureの公開callback contractで通知し、App methodを直接呼ばない形へ準備する。

- [ ] **Step 7: DataManager compatibility methodを委譲する**

既存test互換の`addPurchased`、`addHold`等が必要な間はCommandsへ委譲する。mutation implementationを残さない。

- [ ] **Step 8: sync lifecycle ownershipをcomposition rootへ移す**

coordinatorは1 instanceだけ生成し、App lifecycleのstart/disposeから公開contract経由で起動・停止する。

- [ ] **Step 9: allowlistを縮小する**

purchase、hold、outbox、syncに関するDataManager/App違反を削除する。

- [ ] **Step 10: focused testを実行する**

```bash
npx vitest run --root . tests/circle-state-use-cases.test.ts \
  tests/circle-state-controller.test.ts tests/purchase-mutation-service.test.ts \
  tests/purchase-flow.test.ts tests/gas-outbox-service.test.ts \
  tests/gas-sync-coordinator.test.ts
```

- [ ] **Step 11: regressionを実行する**

```bash
node scripts/check-webapp-architecture.mjs
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run test:e2e -- --grep "purchase|hold|circle"
git diff --check
```

- [ ] **Step 12: commit**

```bash
git add apps/webapp/js/features/circle-state apps/webapp/js/app.js \
  apps/webapp/js/data-manager.ts apps/webapp/js/app/composition-root.ts \
  tests scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(circle-state): extract mutations and sync commands"
```

## Acceptance Criteria

- circle state mutationのbusiness ruleがAppとDataManagerに残らない。
- purchaseだけが既存GAS outbox契約へ反映される。
- local-first順序、stale generation、undo semanticsが維持される。
- sync coordinatorがsingletonでdispose可能である。
- controllerはDOM、LocalStorage、GAS clientを直接利用しない。
