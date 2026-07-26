# Phase 4 Task 1: Define Typed Events and Pure Management View Models

> **Scope:** Types and pure formatting only. No DOM, Lit component, repository, fetch, LocalStorage, or App wiring.

## Goal

Create one typed event vocabulary and safe Japanese-first display models so later components cannot accidentally render raw domain objects or sensitive GAS fields.

## Files

- Create: `apps/webapp/js/ui/management-events.ts`
- Create: `apps/webapp/js/ui/management-view-model.ts`
- Create: `tests/management-view-model.test.ts`
- Modify: `package.json`

## Interfaces

In addition to the shared event types in the Phase overview:

```ts
export interface EventDayOption {
  readonly eventId: string;
  readonly eventLabel: string;
  readonly dayId: string;
  readonly dayLabel: string;
  readonly configured: boolean;
  readonly selected: boolean;
  readonly pendingCount: number;
}

export interface SourceSummaryViewModel {
  readonly typeLabel: "CSV" | "Googleスプレッドシート";
  readonly detail: string;
  readonly endpointSummary: string | null;
  readonly pendingCount: number;
}

export interface SourceDiffViewModel {
  readonly added: readonly DiffRowViewModel[];
  readonly updated: readonly DiffRowViewModel[];
  readonly removed: readonly DiffRowViewModel[];
  readonly countsLabel: string;
}

export interface OutboxEntryViewModel {
  readonly id: string;
  readonly refLabel: string;
  readonly sourceLabel: string;
  readonly space: string;
  readonly desiredLabel: "購入済みにする" | "購入を取り消す";
  readonly attemptsLabel: string;
  readonly errorLabel: string | null;
}

export interface DiffRowViewModel {
  readonly space: string;
  readonly changedFields: readonly string[];
}

export interface DeleteOptionInput {
  readonly selected: EventDayRef;
  readonly eventDayCount: number;
  readonly activeCircleCount: number;
  readonly activityCount: number;
  readonly pendingCount: number;
}

export interface DeleteOptionViewModel {
  readonly scope: DeleteScope;
  readonly label: string;
  readonly consequence: string;
  readonly blocked: boolean;
  readonly blockedReason: string | null;
}

export function buildEventDayOptions(
  registry: EventRegistryV1,
  states: readonly { ref: EventDayRef; state: LocalEventDayState }[],
  selected: EventDayRef | null,
): readonly EventDayOption[];
export function formatSourceSummary(state: LocalEventDayState): SourceSummaryViewModel;
export function formatSourceDiff(diff: SourceDiff): SourceDiffViewModel;
export function formatOutbox(
  entries: readonly GasOutboxEntry[],
  registry: EventRegistryV1,
): readonly OutboxEntryViewModel[];
export function buildDeleteOptions(input: DeleteOptionInput): readonly DeleteOptionViewModel[];
export function dispatchManagementEvent<K extends keyof ManagementEventDetailMap>(
  target: EventTarget,
  type: K,
  detail: ManagementEventDetailMap[K],
): boolean;
```

## Safe summary rules

- GAS endpoint summary is origin/host only, e.g. `script.google.com`; never include `/macros/s/<deployment>/exec`, query, or fragment.
- Sheet name may appear in the source form/summary, but never beside a full URL or in generic error logs.
- Outbox error labels map safe categories to Japanese text. Never render `lastError` blindly if it is not one of the known categories.
- CSV file name is rendered as plain text, never HTML, and is truncated by the component/CSS rather than by losing the underlying accessible name.
- Diff rows contain `space` and changed field labels only; tweet/memo values are not echoed in bulk preview unless explicitly required. Counts are always present.

## TDD steps

- [x] **Step 1: Write event option tests**

Cover registry order, selected/unconfigured state, pending count, missing local state, and invalid selected ref excluded by the registry.

- [x] **Step 2: Write source/diff/outbox/delete model tests**

Cover CSV/GAS, added/updated/removed/unchanged, removed source rows, empty list, desired false, attempts/error category, all delete scopes, and plural/count labels.

- [x] **Step 3: Write sensitive-data tests**

Pass a GAS URL containing a fictional deployment path and query token. Serialize every returned model and assert it contains neither deployment path, query, raw URL, nor memo/tweet body.

- [x] **Step 4: Verify RED**

```bash
npx vitest run --root . tests/management-view-model.test.ts
```

- [x] **Step 5: Implement pure frozen models and typed dispatch**

Do not import Lit. Use exhaustive `switch` statements for source, desired state, error category, and delete scope. Throw on an unknown domain variant rather than rendering `[object Object]`.

- [x] **Step 6: Add test to the explicit script and verify**

```bash
npx vitest run --root . tests/management-view-model.test.ts
npm run test:webapp
npm run check:webapp
npx biome check apps/webapp/js/ui/management-events.ts apps/webapp/js/ui/management-view-model.ts tests/management-view-model.test.ts
```

- [x] **Step 7: Present commit candidate** — Commit `a475741`

Proposed message: `feat(ui): add safe management view models`.

## Review checklist

- Models are pure and deterministic.
- Event detail names exactly match the Phase overview.
- Sensitive fields cannot leak through returned models.
- Japanese labels are centralized rather than repeated in components.
- No UI or service wiring is included.
