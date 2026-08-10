# Phase 7 Task 2: event/day management overview modelと一覧UI

## 目標

registry定義済みの全event/dayを一つの管理一覧へ投影し、source、circle件数、GAS queue、offline catalog保存状況を一目で確認できるようにする。旧event/day selectを管理画面の主導線から外す。

## やってはいけないこと

- registry外eventをlocalだけで作らない。
- GAS multi-sheetへ拡張しない。
- 一覧rowからrepositoryやCache Storageを直接読むcomponentを作らない。
- GAS完全URLを一覧へ常時そのまま表示しない。
- source editor/delete/outboxの全入力UIを一覧rowへ詰め込まない。

## Files

**Create:**
- `apps/webapp/js/components/event-day-management-view.ts`
- `apps/webapp/js/shared/ui/event-day-management-view-model.ts`

**Modify:**
- `apps/webapp/js/components/comipath-settings.ts`（後方互換の一時hostとして利用する場合）
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/index.html`
- 管理画面CSSの既存責務ファイル

**Test:**
- `tests/event-day-management-view-model.test.ts`
- `tests/event-day-management-view.test.ts`
- `tests/e2e/management.spec.ts`

## Interfaces

```ts
export interface EventDayManagementRow {
  readonly ref: EventDayRef;
  readonly eventLabel: string;
  readonly dayLabel: string;
  readonly configured: boolean;
  readonly selected: boolean;
  readonly sourceType: "csv" | "gas" | "none";
  readonly sourceLabel: string;
  readonly sourceEndpointSummary: string | null;
  readonly circleCount: number;
  readonly pendingGasCount: number;
  readonly offlineCatalog: {
    readonly cached: number;
    readonly total: number;
    readonly checking: boolean;
  };
}
```

Builderはregistry orderを維持する。

```ts
export async function buildEventDayManagementRows(input: {
  registry: EventRegistry;
  states: readonly { ref: EventDayRef; state: LocalEventDayState }[];
  selected: EventDayRef | null;
  offlineCache: CatalogOfflineCachePort;
}): Promise<readonly EventDayManagementRow[]>;
```

Catalog URL集合は`removedFromSource === false`かつ有効catalog URLを持つcurrent circlesから作る。

## Steps

- [ ] **Step 1: view modelのRED testを書く**

registered but unconfigured dayもrowになること、GAS/CSV summary、pending queue、circle countが正しいことを固定する。

```ts
expect(rows.map((row) => `${row.ref.eventId}:${row.ref.dayId}`)).toEqual([
  "C108:day1",
  "C108:day2",
]);
expect(rows[1].configured).toBe(false);
expect(rows[1].sourceType).toBe("none");
```

- [ ] **Step 2: offline statusを含むRED testを書く**

cache portをfakeし、`cached/total/checking`がrowへ投影されることを確認する。status取得失敗はmanagement全体failureへせず、offline statusだけunknown相当へ落とす設計にしてよい。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/event-day-management-view-model.test.ts
```

- [ ] **Step 4: pure/view model builderを実装する**

既存`buildEventDayOptions()`のregistry順序、configured判定、source summary知識を必要に応じて共通helperへ寄せる。同じルールを2箇所へコピーしない。

- [ ] **Step 5: management overview componentを実装する**

各rowに最低限次を表示する。

```text
Event / Day
Source type + source label
Data N件
GAS同期 N件待ち
お品書き cached / total 保存済み
```

actionsは次Taskで接続するが、button slot/イベント名はこのTaskで固定する。

```ts
"event-day-open-request"
"event-day-refresh-request"
"event-day-offline-request"
"event-day-edit-request"
"event-day-delete-request"
```

- [ ] **Step 6: 未設定rowの表示を固定する**

未設定event/dayは`未設定 / データなし / GAS同期 0 / お品書き 0/0`とし、`設定する`actionをedit requestへ送る。

- [ ] **Step 7: management surfaceの最小shellを追加する**

headerから独立管理surfaceを開ける入口を追加する。Task 4まで旧settings implementationを内部に残してもよいが、overview自体はmain contentへ縦積みしない。

- [ ] **Step 8: E2Eで一覧状態を確認する**

C108 day1 configured / day2 unconfigured等のfixtureでsource、count、pending、offline statusを確認する。

- [ ] **Step 9: verification**

```bash
npx vitest run --root . tests/event-day-management-view-model.test.ts tests/event-day-management-view.test.ts
npm run test:webapp
npm run test:e2e:ci -- --grep "管理|日程"
npm run check:webapp
git diff --check
```

- [ ] **Step 10: commit**

```bash
git add apps/webapp/js/components/event-day-management-view.ts \
  apps/webapp/js/shared/ui/event-day-management-view-model.ts \
  apps/webapp/js/app apps/webapp/index.html apps/webapp/css tests
git commit -m "feat(management): show event day status overview"
```

## 受入条件

- registry全event/dayが1画面に並ぶ。
- 未設定dayも消えない。
- source/data/outbox/offline statusがrow単位で分かる。
-一覧は完全GAS URLを常時露出しない。
- arbitrary event作成UIがない。
