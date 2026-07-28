# Phase 5D Task 3: Active Event Day Session

**Status:** PLANNED
**Depends on:** Task 2
**Commit candidate:** `refactor(event-day): centralize active session state`

## Goal

`DataManager`が保持するactive event/day、derived circle list、open/switch stateを`ActiveEventDaySession`へ移し、mutable正本を一つにする。Task終了時点では`DataManager`をcompatibility facadeとして残す。

## Files

### Create

- `apps/webapp/js/features/event-day/domain/event-day.ts`
- `apps/webapp/js/features/event-day/application/active-event-day-session.ts`
- `apps/webapp/js/features/event-day/application/event-day-queries.ts`
- `apps/webapp/js/features/event-day/ports/event-day-state-port.ts`
- `apps/webapp/js/features/event-day/infrastructure/local-event-day-state-adapter.ts`
- `apps/webapp/js/features/event-day/index.ts`
- `tests/active-event-day-session.test.ts`

### Move

- `apps/webapp/js/state/event-day-key.ts` → `apps/webapp/js/features/event-day/domain/event-day-key.ts`

### Modify

- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/state/event-day-repository.ts`
- `apps/webapp/js/types/domain.ts`
- import元tests
- `scripts/webapp-architecture-legacy-allowlist.json`

## Interfaces

```ts
export interface ActiveEventDaySnapshot {
  readonly ref: EventDayRef;
  readonly state: LocalEventDayState;
}

export interface ActiveEventDaySession {
  current(): ActiveEventDaySnapshot | null;
  activate(ref: EventDayRef, state: LocalEventDayState): void;
  replaceState(state: LocalEventDayState): void;
  clear(): void;
  subscribe(listener: (snapshot: ActiveEventDaySnapshot | null) => void): () => void;
}
```

```ts
export interface EventDayQueries {
  circles(): readonly Circle[];
  pendingCircles(): readonly Circle[];
  purchasedSpaces(): readonly string[];
  heldSpaces(): readonly string[];
  circleState(space: string): CircleVisitState;
}
```

```ts
export interface EventDayStatePort {
  load(ref: EventDayRef): LocalEventDayState | null;
  save(ref: EventDayRef, state: LocalEventDayState): void;
  saveWithLastOpened(ref: EventDayRef, state: LocalEventDayState): void;
  list(): readonly EventDayRef[];
  getLastOpened(): EventDayRef | null;
  setLastOpened(ref: EventDayRef): void;
  deleteState(ref: EventDayRef): void;
  listForDeletionStrict(): readonly {
    readonly ref: EventDayRef;
    readonly state: LocalEventDayState;
  }[];
  deleteAllFailureSafe(expected: readonly {
    readonly ref: EventDayRef;
    readonly sourceGeneration: string;
  }[]): void;
}
```

型はTask開始時点の`apps/webapp/js/types/domain.ts`にある`EventDayRef`、`LocalEventDayState`、`Circle`、`CircleVisitState`を再利用し、同義のduplicate型を作らない。LocalStorage keyはinfrastructure adapterだけが知る。

## TDD Procedure

- [ ] **Step 1: sessionの単一正本testを書く**

```ts
it("derives lists from the active state without mutable duplicate arrays", () => {
  const session = createActiveEventDaySession();
  session.activate(ref, stateWith({
    A01: "purchased",
    A02: "held",
  }));

  const queries = createEventDayQueries(session);

  expect(queries.purchasedSpaces()).toEqual(["A01"]);
  expect(queries.heldSpaces()).toEqual(["A02"]);

  session.replaceState(stateWith({
    A02: "purchased",
  }));

  expect(queries.purchasedSpaces()).toEqual(["A02"]);
  expect(queries.heldSpaces()).toEqual([]);
});
```

- [ ] **Step 2: subscriptionとdispose testを書く**

listenerはactivate、replace、clearで1回だけ呼ばれ、unsubscribe後は呼ばれないことを検証する。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/active-event-day-session.test.ts
```

- [ ] **Step 4: Domain typeとPortを作成する**

既存型の意味を変更せず、feature rootからre-exportする。duplicate型定義を作らない。

- [ ] **Step 5: DataManagerをsession委譲へ変更する**

`activeRef`、`activeState`、`wantToBuy`、`purchasedList`、`holdList`を独立mutable正本として更新しない。compatibility getterでsession queryを返す。

```ts
get activeRef(): EventDayRef | null {
  return this.activeSession.current()?.ref ?? null;
}

get wantToBuy(): Circle[] {
  return [...this.eventDayQueries.circles()];
}
```

setter互換が必要な箇所は本Task内でcallerをsession APIへ変更し、公開setterを追加しない。

- [ ] **Step 6: repository adapterを接続する**

`composition-root.ts`でLocalStorage-backed port、session、queriesを一度だけ生成し、legacy DataManagerへ注入する。

- [ ] **Step 7: event-day keyのimportを更新する**

move後に旧pathをre-exportするshimは作らない。全production/test importを新pathへ変更する。

- [ ] **Step 8: allowlistを縮小する**

active stateとevent-day repositoryに関するDataManager違反を削除する。

- [ ] **Step 9: focused testを実行する**

```bash
npx vitest run --root . tests/active-event-day-session.test.ts \
  tests/event-day-repository.test.ts tests/data-manager-event-day.test.ts \
  tests/event-day-transition-service.test.ts
```

- [ ] **Step 10: regressionを実行する**

```bash
node scripts/check-webapp-architecture.mjs
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

- [ ] **Step 11: commit**

```bash
git add apps/webapp/js/features/event-day apps/webapp/js/data-manager.ts \
  apps/webapp/js/state/event-day-repository.ts apps/webapp/js/types/domain.ts \
  tests scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(event-day): centralize active session state"
```

## Acceptance Criteria

- active event/dayのmutable正本がsessionに一つだけある。
- derived listがstate更新後に自動で一致する。
- DataManager compatibility getterが配列を正本として保持しない。
- LocalStorage schema、last opened、migration behaviorが変わらない。
- event/day関連testとfull regressionが成功する。
