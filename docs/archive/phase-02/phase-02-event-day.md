# Event Day Local Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** event/day/source generationごとに完全分離されたLocalStorage正本と、検証付きCSV import・差分確認・exportサービスを実装する。

**Architecture:** runtime parserでevent registry、保存schema、CSVを検証し、`EventDayRepository`だけが名前空間付きLocalStorageへアクセスする。source snapshotと購入・保留・履歴を別フィールドで保持し、source replacementはpure diffを確定してからatomicなrepository更新を行う。

**Tech Stack:** TypeScript strict、Vitest、既存`StorageService`、browser File API（UI接続はPhase 4）。

## Global Constraints

- Complete Phase 1 before starting this plan.
- Apply roadmap global constraints and per-commit approval protocol.
- Do not add GAS network behavior in this phase; Phase 3 owns GAS synchronization.
- Do not add management screens in this phase; expose typed services for Phase 4.
- Storage schema starts at `schemaVersion: 1`; every incompatible future change requires an explicit migration.

## Actual execution status (reviewed 2026-07-22)

Tasks 1–7 are committed through `1b95c5f`. Task 7 removed the legacy automatic GAS path, added registry-validated event/day opening, safe initial CSV import, stale-protected CSV replacement, local mutations, and explicit legacy preview/import. The only remaining work in this phase is [Task 8 verification and documentation](./phase-02-task-08.md).

---

## Target Modules and Interfaces

```text
apps/webapp/events/manifest.json
apps/webapp/js/data/event-registry.ts
apps/webapp/js/data/event-day-key.ts
apps/webapp/js/data/csv-circle-codec.ts
apps/webapp/js/data/source-diff.ts
apps/webapp/js/state/storage-schema.ts
apps/webapp/js/state/event-day-repository.ts
apps/webapp/js/types/domain.ts
apps/webapp/js/types/boundary-parsers.ts
tests/event-registry.test.ts
tests/event-day-key.test.ts
tests/storage-schema.test.ts
tests/event-day-repository.test.ts
tests/csv-circle-codec.test.ts
tests/source-diff.test.ts
```

Core types:

```ts
export interface EventDayRef {
  eventId: string;
  dayId: string;
}

export interface SourceRef extends EventDayRef {
  sourceGeneration: string;
}

export interface LocalEventDayState {
  schemaVersion: 1;
  source: DataSource;
  sourceGeneration: string;
  circles: CircleRecord[];
  purchased: string[];
  hold: string[];
  history: HistoryEntry[];
  redo: HistoryEntry[];
  gasOutbox: GasOutboxEntry[];
  timestamps: {
    createdAt: string;
    updatedAt: string;
    sourceUpdatedAt: string;
  };
}
```

### Task 1: Define validated event and day identifiers

**Files:**
- Modify: `apps/webapp/js/types/domain.ts`
- Modify: `apps/webapp/js/types/boundary-parsers.ts`
- Create: `apps/webapp/js/data/event-day-key.ts`
- Create: `tests/event-day-key.test.ts`

**Interfaces:**
- Produces: `parseEventId(value): string`, `parseDayId(value): string`, `buildEventDayKey(ref): string`, `buildSourceNamespace(ref): string`.

- [ ] **Step 1: Write failing identifier tests**

```ts
test("event/day/source keys are stable and cannot collide", () => {
  assert.equal(buildEventDayKey({ eventId: "C109", dayId: "day1" }), "C109/day1");
  assert.equal(
    buildSourceNamespace({ eventId: "C109", dayId: "day1", sourceGeneration: "g-001" }),
    "comipath:v1:C109:day1:g-001",
  );
});

test("identifiers reject separators and empty text", () => {
  for (const value of ["", "../C109", "C109:day1", " day1 "]) {
    assert.throws(() => parseEventId(value));
  }
});
```

Run `npx vitest run --root . tests/event-day-key.test.ts`; expect missing module failure.

- [ ] **Step 2: Implement minimal identifier parsing**

Accept only `/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/`. Do not silently trim because persisted and displayed identifiers must be exact.

- [ ] **Step 3: Verify and request commit approval**

Run `npx vitest run --root . tests/event-day-key.test.ts && npm run typecheck:webapp`.

Proposed message: `feat(data): add event day storage identities`.

### Task 2: Add a runtime-validated event registry

**Files:**
- Create: `apps/webapp/events/manifest.json`
- Create: `apps/webapp/js/data/event-registry.ts`
- Modify: `apps/webapp/js/types/domain.ts`
- Modify: `apps/webapp/js/types/boundary-parsers.ts`
- Create: `tests/event-registry.test.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces: `parseEventRegistry(value): EventRegistryV1`, `loadEventRegistry(baseUrl?): Promise<EventRegistryV1>`.

Registry schema:

```json
{
  "schemaVersion": 1,
  "events": [
    {
      "eventId": "demo-v1",
      "displayName": "ComiPath Demo",
      "mapBundle": "../maps/demo-v1/manifest.json",
      "days": [
        { "dayId": "day1", "displayName": "デモ1日目" }
      ]
    }
  ]
}
```

- [ ] **Step 1: Write parser tests for duplicate events/days and unsafe paths**
- [ ] **Step 2: Run the test and confirm missing parser failure**
- [ ] **Step 3: Implement strict parser and freeze returned arrays/objects**
- [ ] **Step 4: Write failing public bundle packaging tests**

Assert Vite resolves only bundle paths declared by the registry, copies each declared bundle beneath `dist/webapp/assets/maps/<eventId>/`, rejects symbolic links and paths outside `apps/webapp/map-bundles`, and ignores unregistered directories.

- [ ] **Step 5: Update Vite for event-scoped bundle URLs**

Serve the registry at `/assets/events/manifest.json`. Resolve each `mapBundle` relative to that URL, so `../maps/demo-v1/manifest.json` becomes `/assets/maps/demo-v1/manifest.json`. Retain private mode as an explicit external bundle selection; never scan parent directories or environment variables in normal mode. The map loader cannot switch events until the UI has an atomic event transition; that runtime concern is explicitly deferred to Phase 4 Task 2 and must not be hidden behind the first-event compatibility alias.

- [ ] **Step 6: Extend build verification**

For every registry event, compare the source bundle file list and bytes with `dist/webapp/assets/maps/<eventId>`. Assert no unregistered bundle and no legacy area directory exists in `dist`.

- [ ] **Step 7: Run `npx vitest run --root . tests/event-registry.test.ts tests/map-bundle-selection.test.ts && npm run build:webapp && npm run verify:webapp:build`**
- [ ] **Step 8: Request approval for `feat(data): add validated event registry`**

### Task 3: Define and validate storage schema version 1

**Files:**
- Create: `apps/webapp/js/state/storage-schema.ts`
- Modify: `apps/webapp/js/types/domain.ts`
- Create: `tests/storage-schema.test.ts`

**Interfaces:**
- Produces: `createEmptyEventDayState(source, generation, now): LocalEventDayState`, `parseLocalEventDayState(value): LocalEventDayState`, `StorageSchemaError`.

- [ ] **Step 1: Write failing schema tests**

Cover valid empty state and rejection of:

- unknown `schemaVersion`;
- mismatched source type fields;
- duplicate purchased/hold spaces;
- duplicate circle spaces;
- history referencing an empty space;
- malformed timestamps;
- outbox entries whose source generation differs from the state.

- [ ] **Step 2: Verify RED**

Run `npx vitest run --root . tests/storage-schema.test.ts`; expect missing exports.

- [ ] **Step 3: Implement the parser without `any`**

Use `unknown`, field-path errors, and existing boundary parser helpers. Return copied/frozen input, never the caller's mutable objects.

- [ ] **Step 4: Verify GREEN and typecheck**

```bash
npx vitest run --root . tests/storage-schema.test.ts
npm run typecheck:webapp
```

- [ ] **Step 5: Request approval for `feat(storage): define versioned event day state`**

### Task 4: Implement failure-safe event/day repository

**Files:**
- Modify: `apps/webapp/js/state/storage-service.ts`
- Create: `apps/webapp/js/state/event-day-repository.ts`
- Create: `tests/event-day-repository.test.ts`

**Interfaces:**
- Consumes: `StorageService`, `LocalEventDayState`, `SourceRef`.
- Produces:

```ts
export class EventDayRepository {
  load(ref: EventDayRef): LocalEventDayState | null;
  save(ref: EventDayRef, state: LocalEventDayState): void;
  list(): EventDayRef[];
  getLastOpened(): EventDayRef | null;
  setLastOpened(ref: EventDayRef): void;
  deleteState(ref: EventDayRef): void;
}

export class StorageWriteError extends Error {
  readonly cause: unknown;
}
```

- [ ] **Step 1: Write tests with an in-memory StorageAdapter**

Cover namespace isolation across `C108/day1`, `C108/day2`, and `C109/day1`; last-opened restoration; malformed JSON diagnostics; and an adapter whose `setItem` throws quota errors.

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Allow `StorageService` adapter injection and wrap read/write failures**
- [ ] **Step 4: Implement repository using one index key plus one state key per event/day**
- [ ] **Step 5: Verify that a failed save leaves the previous serialized value unchanged**
- [ ] **Step 6: Run all storage tests and request `feat(storage): persist isolated event day state`**

### Task 5: Parse and export the public CSV contract

**Files:**
- Create: `apps/webapp/js/data/csv-circle-codec.ts`
- Create: `tests/csv-circle-codec.test.ts`
- Modify: `apps/webapp/js/types/domain.ts`

**Interfaces:**

```ts
export interface CsvIssue {
  row: number;
  column: string;
  message: string;
}

export type CsvImportResult =
  | { ok: true; circles: CircleRecord[] }
  | { ok: false; issues: CsvIssue[] };

export function parseCircleCsv(text: string): CsvImportResult;
export function serializeCircleCsv(circles: readonly CircleRecord[], purchased: ReadonlySet<string>): string;
```

- [ ] **Step 1: Write failing import tests**

Cover UTF-8 text with CRLF/LF, quoted comma/newline/escaped quote, required `space`, optional columns, numeric priority, `isSale=x`, exact error row, duplicate space rejection, and unknown columns ignored.

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement a focused RFC4180-style parser in TypeScript**

Do not add a CSV dependency unless the tests demonstrate an unhandled grammar requirement and the user approves the dependency change.

- [ ] **Step 4: Write failing export tests**

Assert header is exactly:

```csv
space,priority,isSale,account,tweet,memo
```

Assert export escapes values and reflects LocalStorage purchased state in `isSale`.

- [ ] **Step 5: Implement deterministic CRLF export with trailing newline**
- [ ] **Step 6: Run tests/typecheck and request `feat(data): add validated circle CSV codec`**

### Task 6: Preview source replacement with a pure diff

**Files:**
- Create: `apps/webapp/js/data/source-diff.ts`
- Create: `tests/source-diff.test.ts`

**Interfaces:**

```ts
export interface SourceDiff {
  added: CircleRecord[];
  updated: Array<{ before: CircleRecord; after: CircleRecord }>;
  removed: CircleRecord[];
  unchanged: CircleRecord[];
}

export function diffCircleSources(current: readonly CircleRecord[], incoming: readonly CircleRecord[]): SourceDiff;
export function applySourceDiff(current: LocalEventDayState, incoming: readonly CircleRecord[], now: string): LocalEventDayState;
```

- [ ] **Step 1: Write failing diff tests**

Assert `space` is the key, order is deterministic, metadata fields update, removed rows become `removedFromSource: true`, local purchased/hold/history remain, GAS `isSale=x` only adds purchase, and an empty `isSale` never clears purchase.

- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement immutable diff and apply functions**
- [ ] **Step 4: Verify input arrays and objects are not mutated**
- [ ] **Step 5: Request approval for `feat(data): preview and apply source updates`**

### Task 7: Connect local data services without changing UI layout

**Complete:** Commit `1b95c5f`. The implementation record is [Phase 2 Task 7 Safety Replan](./phase-02-task-07.md). Event-to-map switching remains deferred to Phase 4; Task 7 exposes no UI/API route that can combine an event/day state with another event's map.

### Task 8: Phase verification and documentation

**Ready:** Follow the self-contained [Phase 2 Task 8 plan](./phase-02-task-08.md). It defines the exact documentation assertions, required public facts, fresh-install exit gate, self-review checklist, and commit approval boundary.
