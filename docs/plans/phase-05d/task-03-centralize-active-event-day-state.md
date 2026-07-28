# Phase 5D Task 3: Centralize Active Event/Day State

**Status:** PLANNED
**Depends on:** Task 2
**Commit candidate:** `refactor(event-day): centralize active event day state`

## Goal

`DataManager`が保持するactive ref、active persisted state、circle派生配列、last opened accessを`ActiveEventDaySession`、`ActiveEventDayReader`、`EventDayRepository`へ移す。mutable正本を一つにし、Task終了時点では`DataManager`をread-compatible delegatorとして残す。

## Corrected source paths

- Move sourceは`apps/webapp/js/data/event-day-key.ts`
- `apps/webapp/js/state/event-day-key.ts`は存在しない
- existing concrete repositoryは`apps/webapp/js/state/event-day-repository.ts`

## Files

### Create

- `apps/webapp/js/features/event-day/domain/event-day-types.ts`
- `apps/webapp/js/features/event-day/use-cases/active-event-day-session.ts`
- `apps/webapp/js/features/event-day/use-cases/active-event-day-reader.ts`
- `apps/webapp/js/features/event-day/use-cases/event-day-repository.ts`
- `apps/webapp/js/features/event-day/public-api.ts`
- `tests/active-event-day-session.test.ts`
- `tests/active-event-day-reader.test.ts`

### Move

- `apps/webapp/js/data/event-day-key.ts` → `apps/webapp/js/features/event-day/domain/event-day-key.ts`

### Replace and delete

- `apps/webapp/js/state/event-day-repository.ts`
  - behaviorを`LocalStorageEventDayRepository`へ移す
  - old fileをTask内で削除する
  - old path re-export shimを作らない

### Modify

- `apps/webapp/js/data-manager.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/types/domain.ts`
- `tests/event-day-key.test.ts`
- `tests/event-day-repository.test.ts`
- `tests/data-manager-event-day.test.ts`
- `tests/event-day-transition-service.test.ts`
- `tests/storage-deletion-service.test.ts`
- `scripts/webapp-architecture-legacy-allowlist.json`

## Preflight

```bash
test -e apps/webapp/js/data/event-day-key.ts
test -e apps/webapp/js/state/event-day-repository.ts
test ! -e apps/webapp/js/state/event-day-key.ts
test ! -e apps/webapp/js/features/event-day/domain/event-day-key.ts
test ! -e apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository.ts
```

## Interfaces

```ts
export interface ActiveEventDaySnapshot {
  readonly ref: EventDayRef;
  readonly state: LocalEventDayState;
}

export interface ActiveEventDaySession {
  getActiveEventDay(): ActiveEventDaySnapshot | null;
  setActiveEventDay(ref: EventDayRef, state: LocalEventDayState): void;
  replaceActiveEventDayState(state: LocalEventDayState): void;
  clearActiveEventDay(): void;
  subscribe(
    listener: (snapshot: ActiveEventDaySnapshot | null) => void,
  ): () => void;
}
```

```ts
export interface ActiveEventDayReader {
  getAllCircles(): readonly Circle[];
  getPendingCircles(): readonly Circle[];
  getPurchasedCircleSpaces(): readonly string[];
  getHeldCircleSpaces(): readonly string[];
  getCircleStatus(space: string): CircleStatus;
}
```

```ts
export interface EventDayRepository {
  load(ref: EventDayRef): LocalEventDayState | null;
  save(ref: EventDayRef, state: LocalEventDayState): void;
  saveAndRememberLastOpened(
    ref: EventDayRef,
    state: LocalEventDayState,
  ): void;
  listEventDays(): readonly EventDayRef[];
  getLastOpenedEventDay(): EventDayRef | null;
  rememberLastOpenedEventDay(ref: EventDayRef): void;
  deleteEventDay(ref: EventDayRef): void;
  listEventDaysForDeletion(): readonly {
    readonly ref: EventDayRef;
    readonly state: LocalEventDayState;
  }[];
  deleteAllEventDays(
    expected: readonly {
      readonly ref: EventDayRef;
      readonly sourceGeneration: string;
    }[],
  ): void;
}
```

`LocalStorageEventDayRepository`はexisting rollback、schema migration、strict deletion behaviorを変更せずに上記interfaceを実装する。

`CircleStatus`はTask 4で正式移行する。Task 3ではexisting `CircleVisitState`へのtype aliasをfeature boundaryへ置き、永続値を変更しない。

## TDD procedure

- [ ] **Step 1: single source of truthのRED testを書く**

```ts
it("derives every list from the current active state", () => {
  const session = createActiveEventDaySession();
  const reader = createActiveEventDayReader(session);

  session.setActiveEventDay(ref, stateWithStatuses({
    A01: "purchased",
    A02: "held",
  }));

  expect(reader.getPurchasedCircleSpaces()).toEqual(["A01"]);
  expect(reader.getHeldCircleSpaces()).toEqual(["A02"]);

  session.replaceActiveEventDayState(stateWithStatuses({
    A02: "purchased",
  }));

  expect(reader.getPurchasedCircleSpaces()).toEqual(["A02"]);
  expect(reader.getHeldCircleSpaces()).toEqual([]);
});
```

- [ ] **Step 2: subscription lifecycleのRED testを書く**

set、replace、clearでlistenerが一回呼ばれ、unsubscribe後は呼ばれないことを検証する。snapshot内部のref/stateをcallerがmutateできないことも検証する。

- [ ] **Step 3: repository contractのRED testを書く**

existing migration、rollback、last opened、strict deletionをnew class名とmethod名で固定する。

- [ ] **Step 4: REDを確認する**

```bash
npx vitest run --root . tests/active-event-day-session.test.ts \
  tests/active-event-day-reader.test.ts \
  tests/event-day-repository.test.ts
```

- [ ] **Step 5: event/day domain typeを移す**

`EventDayRef`、registry-related type、active snapshotに必要なtypeを`event-day-types.ts`へ移す。`types/domain.ts`にはTask 9までのcompatibility re-exportだけを残す。duplicate interfaceを作らない。

- [ ] **Step 6: key builderをcorrect sourceからmoveする**

`data/event-day-key.ts`を`domain/event-day-key.ts`へmoveし、全production/test importを更新する。old path shimを作らない。

- [ ] **Step 7: repositoryを明確な名前へ置換する**

existing `EventDayRepository` concrete classを`LocalStorageEventDayRepository`へrename/moveする。interfaceとconcrete classを同じ名前にしない。

- [ ] **Step 8: sessionとreaderを実装する**

sessionだけがactive ref/stateをmutableに保持する。readerは毎回session snapshotから派生値を作る。`purchasedList`、`holdList`、`wantToBuy`を保存正本にしない。

- [ ] **Step 9: dependency assemblyへ接続する**

`assemble-comipath-application.ts`でrepository、session、readerをそれぞれ一回生成し、legacy application/DataManagerへ注入する。

- [ ] **Step 10: DataManagerをdelegatorへ変更する**

legacy test互換のgetterだけを残す。

```ts
get activeRef(): EventDayRef | null {
  return this.activeEventDaySession.getActiveEventDay()?.ref ?? null;
}

get wantToBuy(): Circle[] {
  return [...this.activeEventDayReader.getAllCircles()];
}
```

public setterを追加しない。existing callerはsessionまたはUse Caseへ変更する。

- [ ] **Step 11: allowlistを縮小する**

active event/day、repository、derived arraysに関するDataManager violationsを削除する。

- [ ] **Step 12: focused verificationを実行する**

```bash
npx vitest run --root . tests/active-event-day-session.test.ts \
  tests/active-event-day-reader.test.ts \
  tests/event-day-repository.test.ts \
  tests/data-manager-event-day.test.ts \
  tests/event-day-transition-service.test.ts \
  tests/storage-deletion-service.test.ts
node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 13: regressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

- [ ] **Step 14: commit**

```bash
git add -A apps/webapp/js/features/event-day \
  apps/webapp/js/data/event-day-key.ts \
  apps/webapp/js/state/event-day-repository.ts \
  apps/webapp/js/data-manager.ts apps/webapp/js/app \
  apps/webapp/js/types/domain.ts tests \
  scripts/webapp-architecture-legacy-allowlist.json
git commit -m "refactor(event-day): centralize active event day state"
```

## Acceptance criteria

- active event/dayのmutable正本が一つである。
- derived circle listsが独立mutable arrayではない。
- LocalStorage keyはconcrete repositoryだけが知る。
- source path mismatchが解消されている。
- old event-day repository pathとold event-day-key pathが残らない。
- schema migration、rollback、last opened、deletion behaviorが維持される。
