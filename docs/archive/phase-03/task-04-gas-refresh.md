# Phase 3 Task 4: Build Stale-Safe GAS Import and Refresh Previews

> **Depends on:** Tasks 1 and 3. **Scope:** Explicit GET preview/apply only. Do not send sale POSTs or create lifecycle listeners.

## Goal

Support three explicit flows through one preview contract:

1. Initial GAS import replaces only the Phase 2 empty CSV sentinel and mints a new source generation.
2. GAS replacement changes CSV→GAS, GAS URL, or GAS sheet after a confirmed diff and mints a new source generation.
3. Refresh fetches the already configured URL/sheet, applies a diff to the same source, and keeps its generation.

Opening an event/day, starting App, and reading cached state must never call GET.

## Files

- Create: `apps/webapp/js/data/gas-refresh-service.ts`
- Create: `apps/webapp/js/data/source-snapshot.ts`
- Create: `tests/gas-refresh-service.test.ts`
- Modify: `apps/webapp/js/data-manager.ts`
- Modify: `package.json`

## Interfaces

```ts
export interface GasRefreshServiceOptions {
  readonly now?: () => Date;
  readonly createPreviewId?: () => string;
  readonly createSourceGeneration?: () => string;
  readonly previewTtlMs?: number;
}

export class StaleGasPreviewError extends Error {}

export class GasRefreshService {
  constructor(
    repository: EventDayRepository,
    client: GasApiClient,
    sourceSettings: SourceSettingsService,
    options?: GasRefreshServiceOptions,
  );

  previewInitialImport(ref: EventDayRef, source: GasDataSource): Promise<GasRefreshPreview>;
  previewReplacement(ref: EventDayRef, source: GasDataSource): Promise<GasRefreshPreview>;
  previewRefresh(ref: EventDayRef): Promise<GasRefreshPreview>;
  applyPreview(previewId: string): LocalEventDayState;
  cancelPreview(previewId: string): void;
}

export function fingerprintSourceSnapshot(state: LocalEventDayState): string;
```

The fingerprint includes `source`, `sourceGeneration`, and canonicalized `circles`; it excludes purchase, hold, history, redo, outbox, and timestamps so local activity while a preview is open does not make a source-only diff stale. Apply always merges into the latest loaded state.

## Initial-import eligibility

The current state must satisfy every condition:

```ts
state.source.type === "csv";
state.source.fileName === "empty.csv";
state.circles.length === 0;
state.purchased.length === 0;
state.hold.length === 0;
state.history.length === 0;
state.redo.length === 0;
state.gasOutbox.length === 0;
```

Anything else requires an explicit source replacement workflow, which Phase 4 exposes through management UI but still uses the same guarded save.

`previewReplacement()` handles non-empty CSV→GAS and changes to an existing GAS URL/sheet. It sets `replacementOperation` deterministically: `source-type-change` when the type differs, otherwise `gas-url-change` when URL differs, otherwise `sheet-name-change`. It rejects a replacement whose source is identical; callers use `previewRefresh()` for that case.

## TDD steps

- [x] **Step 1: Write no-implicit-GET tests**

Construct `DataManager` and open cached CSV/GAS states with a fake client. Assert `fetchCircles` and `fetchSheetList` have zero calls. This is a regression test in `tests/data-manager-event-day.test.ts` as well as a service test.

- [x] **Step 2: Write initial preview/apply tests**

Cover URL/sheet validation, one GET, exact preview metadata, diff counts, no state change before apply, new source generation on apply, imported `isSale=x` adding purchase/history, and preview removal after successful apply.

- [x] **Step 3: Write refresh preview/apply tests**

Cover one GET only after explicit call, same URL/sheet from persisted source, same generation after apply, new/updated/removed circles, local purchase/hold/history/redo preservation, and GAS-empty `isSale` never clearing purchase.

Also cover CSV→GAS, GAS URL change, and GAS sheet change through `previewReplacement()`: each shows a diff, rechecks pending state, preserves local activity, and mints exactly one new generation only on successful apply.

- [x] **Step 4: Write stale and failure tests**

Reject and preserve state for:

- missing/already-applied preview;
- expired preview;
- target or mode mismatch;
- source-generation change;
- source URL/sheet change;
- source-circle fingerprint change;
- pending outbox inserted after preview;
- network/response error;
- repository save error.

A local purchase/hold-only change after preview must still apply safely to the latest state and preserve that change.

- [x] **Step 5: Verify RED**

```bash
npx vitest run --root . tests/gas-refresh-service.test.ts
```

- [x] **Step 6: Implement memory-only previews**

Do not persist preview IDs, GAS response bodies, or spreadsheet titles. Map validated response circles to `CircleRecord` and discard redundant per-row sheet data because the source has one sheet.

Initial/replacement apply calls:

```ts
const operation = preview.replacementOperation;
if (operation === null) {
  throw new StaleGasPreviewError("replacement preview operation is missing");
}
sourceSettings.saveGuarded({
  ref: preview.ref,
  operation,
  expectedSourceGeneration: preview.expectedSourceGeneration,
  nextState,
});
```

with a new generation. Refresh apply calls:

```ts
sourceSettings.saveGuarded({
  ref: preview.ref,
  operation: "gas-refresh-apply",
  expectedSourceGeneration: preview.expectedSourceGeneration,
  nextState,
});
```

with the existing generation. Before either call, reject a mode/operation combination that is not permitted by the preview type.

- [x] **Step 7: Expose orchestration through `DataManager`**

Add exact forwarding APIs:

```ts
previewInitialGasImport(ref: EventDayRef, source: GasDataSource): Promise<GasRefreshPreview>;
previewGasSourceReplacement(ref: EventDayRef, source: GasDataSource): Promise<GasRefreshPreview>;
previewGasRefresh(ref: EventDayRef): Promise<GasRefreshPreview>;
applyGasPreview(previewId: string): LocalEventDayState;
cancelGasPreview(previewId: string): void;
```

`DataManager` receives the client/services through options for tests. It still contains no `fetch()` call.

- [x] **Step 8: Verify**

```bash
npx vitest run --root . tests/gas-refresh-service.test.ts tests/data-manager-event-day.test.ts
npm run test:webapp
npm run check:webapp
npx biome check apps/webapp/js/data/gas-refresh-service.ts apps/webapp/js/data/source-snapshot.ts apps/webapp/js/data-manager.ts tests/gas-refresh-service.test.ts tests/data-manager-event-day.test.ts
```

- [x] **Step 9: Present commit candidate**

Proposed message: `feat(gas): preview explicit sheet refreshes`.

## Review checklist

- Cached open/startup performs no GET.
- Initial and refresh generation rules differ correctly.
- Apply uses latest local activity while protecting source snapshot identity.
- Preview content is memory-only and cancelable.
- Pending outbox is rechecked inside the service boundary.
