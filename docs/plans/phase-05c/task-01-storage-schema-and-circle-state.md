# Phase 5C Task 1: Storage Schema and Exclusive Circle State

**Status:** 完了（レビュー修正・検証済み）
**Depends on:** Phase 5C entry gate  
**Commit candidate:** `feat(state): add exclusive circle visit states`

## Goal

既存の`purchased`、`hold`、`history`、`redo`を、排他的なcircle stateへ移行する。GAS outboxのlocal-first契約を維持し、永続的なUndo/Redoを廃止する。

## Files allowed to change

- storage schema/parser/repository
- domain types
- DataManagerのcircle state部分
- purchase mutation service
- migration tests
- state transition tests
- purchase/outbox tests
- progressとTask実績

## Files forbidden to change

- map assets
- route planner
- Worker
- TOPTW
- navigation UI
- broad component redesign

## Required interfaces

```ts
export type CircleVisitState = "pending" | "held" | "purchased" | "excluded";

export interface CircleStateOverrides {
  readonly [space: string]: Exclude<CircleVisitState, "pending">;
}

export function getCircleVisitState(
  overrides: CircleStateOverrides,
  space: string,
): CircleVisitState;

export function transitionCircleVisitState(
  current: CircleVisitState,
  requested: CircleVisitState,
): CircleVisitState;
```

保存schemaの正確な型名は既存命名へ合わせる。新schemaはversionを1つ上げる。

## Migration rules

- legacy purchasedにあるspaceは`purchased`。
- purchasedとholdの両方にある場合は`purchased`。
- holdだけにある場合は`held`。
- その他は`pending`。
- legacy historyとredoは新schemaへ永続操作履歴として移さない。
- gasOutbox、source、sourceGeneration、circles、timestampsを保持する。
- parseまたはsave失敗時に旧値を削除しない。
- migration成功後だけ新schemaを保存する。

## State transition rules

```text
pending   → held | purchased | excluded
held      → pending | purchased | excluded
purchased → pending
excluded  → pending
```

禁止遷移はdomain errorにするか、明示的な許可遷移へ変換する。黙って複数状態を作らない。

## TDD procedure

- [x] legacy purchasedだけをmigrateする失敗testを書く。
- [x] legacy holdだけをmigrateする失敗testを書く。
- [x] purchasedとhold重複でpurchased優先の失敗testを書く。
- [x] gasOutboxとsource metadata保持の失敗testを書く。
- [x] malformed legacy valueで旧storageを破壊しない失敗testを書く。
- [x] focused testを実行しREDを確認する。

```bash
npx vitest run --root . tests/storage-schema.test.ts tests/event-day-repository.test.ts
```

- [x] `CircleVisitState`とoverride helperを最小実装する。
- [x] migration parserとatomic saveを実装する。
- [x] DataManagerの`purchased`/`hold`独立配列をstate queryへ置換する。
- [x] purchase serviceを`pending ↔ purchased`に接続する。
- [x] held/excluded変更ではoutboxが変わらないtestを書く。
- [x] purchased変更ではlocal save後にだけPOSTを試みる既存testを維持する。
- [x] global Undo/Redo APIをUI正本から外し、使用箇所をcompile errorで洗い出す。
- [x] 操作直後の1回取消用token型を追加する。tokenはmemoryだけに置き、current positionを含めない。

```ts
export interface CircleStateUndoToken {
  readonly space: string;
  readonly before: CircleVisitState;
  readonly after: CircleVisitState;
  readonly createdAtMs: number;
}
```

- [x] GREENを確認する。

```bash
npx vitest run --root . tests/storage-schema.test.ts tests/event-day-repository.test.ts tests/data-manager-event-day.test.ts tests/purchase-mutation-service.test.ts tests/purchase-flow.test.ts
npm run check:webapp
git diff --check
```

## 実績

- `EventDayRepository.load()`でv1 parse成功後にのみv2を保存し、保存・index更新失敗時はv1 raw値へrollbackする移行処理を追加した。
- `excluded`を`DataManager.getUnvisited()`の通常候補から除外した。
- 永続Undo/Redoの画面ボタンとハンドラを削除し、短時間取消tokenの型だけをdomainへ追加した。現在位置はtokenへ含めていない。
- E2EのGAS同期・管理フローfixture/helperをschema v2へ追随させ、関連12ケースを検証した。visual snapshotは既存の6差分を更新していない。
- focused testはRED（移行未保存、excludedが候補に残る）を確認後、修正してGREENを確認した。
- `npm run test:webapp`（39 files / 408 tests）、`npm run check:webapp`、`npm run build:webapp`、`npm run verify:webapp:build`、`npx biome check`、`git diff --check`を実行済み。

## Acceptance criteria

- 1 circleは常に1状態である。
- legacy重複はpurchased優先で移行する。
- history/redoを新schemaのglobal historyとして保持しない。
- GAS outbox境界が変わらない。
- held/excludedをGASへ送らない。
- migration失敗時に旧dataが残る。
- navigation stateとUIをまだ実装していない。

## Review checklist

- pendingを重複保存していないか。
- removed circleのstate保持を壊していないか。
- outboxを先にPOSTしていないか。
- migrationが再実行されても結果が変わらないか。
- Undo tokenがLocalStorageへ保存されていないか。
