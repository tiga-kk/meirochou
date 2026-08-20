# Phase 8 Task 5: Targeted Application Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the remaining app-layer responsibility concentration without changing user behavior by moving management DOM binding and read-only projection out of `BrowserApplication`, then grouping the existing Route Guidance wiring inside the composition root.

**Architecture:** Keep the existing Phase 5D feature ownership intact. Add one narrow management-event binder and one pure management projection module; keep cross-feature handlers and lifecycle in `BrowserApplication`. Inside `assemble-comipath-application.ts`, group only the existing Route Guidance wiring behind one non-exported local `assembleRouteGuidance()` function rather than introducing DI, EventBus, coordinator classes, or factory modules.

**Tech Stack:** TypeScript 7, Vitest 4, happy-dom, Node.js 22, existing feature public APIs and architecture checker.

**Spec:** `docs/specs/2026-08-20-phase-08-task-05-targeted-application-refactor-design.md`

## Global Constraints

- Repository: `tiga-kk/meirochou`.
- Work only on `docs/phase-08-task-05-targeted-application-refactor-plan`.
- Start from the current remote planning-branch HEAD; do not reset to a SHA copied from this document.
- This is a behavior-preserving refactor. Do not intentionally change UI, event/day behavior, route behavior, storage, network contracts, or map/event contracts.
- Do not modify `apps/webapp/js/features/**`, `apps/webapp/js/components/**`, or `apps/webapp/js/shared/**`.
- Do not modify production event/map data, Vite, package files, integrations, functions, workflows, or E2E specs.
- Do not add DI container, EventBus, service locator, generic callback registry, application framework, `Manager`, `Coordinator`, `Helper`, `Utils`, or factory-file families.
- Do not split `BrowserApplication` by moving methods into another large stateful class.
- Do not add file-size or line-count acceptance rules.
- Do not re-refactor `bind-route-guidance-events.ts`, `bind-circle-status-events.ts`, or `bind-settings-shell-events.ts` beyond the minimal composition change in `bind-browser-events.ts`.
- Do not start Phase 8 Task 6 onboarding or Task 7 operator documentation.
- Full `npm run test:e2e:ci` is a completion gate because Task 5 changes production browser binding and composition wiring.
- Never update visual snapshots, increase retry, skip tests, or relax assertions merely to make Task 5 green.

## Baseline and allowed implementation scope

Expected created production files:

```text
apps/webapp/js/app/bind-management-action-events.ts
apps/webapp/js/app/browser-management-projection.ts
```

Expected created tests:

```text
tests/bind-management-action-events.test.ts
tests/browser-management-projection.test.ts
```

Expected modified production files:

```text
apps/webapp/js/app/bind-browser-events.ts
apps/webapp/js/app/browser-application.ts
apps/webapp/js/app/assemble-comipath-application.ts
```

Expected final documentation update:

```text
docs/status/progress.md
```

`tests/application-assembly.test.ts`, `tests/browser-event-bindings.test.ts`, and `tests/apps-behavior-characterization.test.ts` are regression inputs. Do not edit them unless the new internal structure causes a compile-only test fixture mismatch. If an existing behavioral assertion fails, treat it as a potential regression rather than rewriting the test.

---

## Task 5.0: Capture baseline and protect the refactor boundary

**Goal:** Establish an exact implementation start point and a focused pre-refactor baseline so later failures can be classified.

**Do not:** Edit production or tests in this task, merge main, or run snapshot update commands.

**Files:**
- Read: `docs/specs/2026-08-20-phase-08-task-05-targeted-application-refactor-design.md`
- Read: `docs/plans/phase-08/task-05-targeted-application-refactor.md`
- Read: `docs/status/progress.md`
- Read: `apps/webapp/js/app/browser-application.ts`
- Read: `apps/webapp/js/app/assemble-comipath-application.ts`
- Read: `apps/webapp/js/app/bind-browser-events.ts`
- Read: `tests/application-assembly.test.ts`
- Read: `tests/browser-event-bindings.test.ts`
- Read: `tests/apps-behavior-characterization.test.ts`

**Interfaces:**
- Consumes: current remote planning branch.
- Produces: `TASK_START_SHA` and baseline results only.

- [ ] **Step 1: Update the branch and record the implementation start**

```bash
git fetch origin --prune
git checkout docs/phase-08-task-05-targeted-application-refactor-plan
git pull --ff-only
export TASK_START_SHA="$(git rev-parse HEAD)"
printf 'TASK_START_SHA=%s\n' "$TASK_START_SHA"
git status --short
```

Required: working tree is clean except unrelated user-owned changes that already existed. Do not delete unrelated changes.

- [ ] **Step 2: Read the design and plan completely**

```bash
cat docs/specs/2026-08-20-phase-08-task-05-targeted-application-refactor-design.md
cat docs/plans/phase-08/task-05-targeted-application-refactor.md
sed -n '1,140p' docs/status/progress.md
```

- [ ] **Step 3: Confirm Task 4 is closed and Task 6 has not started**

```bash
grep -n "Task 4" docs/status/progress.md | head -20
grep -n "Task 5" docs/status/progress.md | head -20
git diff --name-only origin/main..HEAD -- apps/webapp/js tests | cat
```

The planning branch should contain docs-only planning changes before implementation.

- [ ] **Step 4: Run focused pre-refactor baseline**

```bash
npx vitest run --root . \
  tests/application-assembly.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/browser-event-bindings.test.ts \
  tests/event-day-management-actions.test.ts \
  tests/management-view-model.test.ts \
  tests/event-day-management-view-model.test.ts
```

Record exact files/tests/exit code. Required: PASS before Task 5 implementation. If this baseline fails on current branch, stop and report the existing failure rather than mixing an unrelated repair into Task 5.

- [ ] **Step 5: Run the architecture baseline**

```bash
npm run check:webapp:architecture
git diff --check
```

Both must pass.

No commit is created for Task 5.0.

---

## Task 5.1: Move management action DOM registration into a narrow binder

**Goal:** Remove the remaining management-event listener loop from `BrowserApplication` while keeping all cross-feature management actions in the application object.

**Do not:** Move repository/cache/controller operations into the binder, rename event types, add a generic event registry, or change handler semantics.

**Files:**
- Create: `apps/webapp/js/app/bind-management-action-events.ts`
- Create: `tests/bind-management-action-events.test.ts`
- Modify: `apps/webapp/js/app/bind-browser-events.ts`
- Modify: `apps/webapp/js/app/browser-application.ts`
- Test: `tests/browser-event-bindings.test.ts`
- Test: `tests/event-day-management-actions.test.ts`

**Interfaces:**
- Consumes: five existing BrowserApplication management action methods.
- Produces:

```ts
export interface ManagementActionEventApplication {
  handleEventDayOpenRequest(detail: unknown): Promise<void>;
  handleEventDayRefreshRequest(detail: unknown): Promise<void>;
  handleEventDayOfflineRequest(detail: unknown): Promise<void>;
  handleEventDayEditRequest(detail: unknown): Promise<void>;
  handleEventDayDeleteRequest(detail: unknown): Promise<void>;
}

export function bindManagementActionEvents(
  application: ManagementActionEventApplication,
  document: Document,
): () => void;
```

### Required event mapping

```text
event-day-open-request     -> handleEventDayOpenRequest
event-day-refresh-request  -> handleEventDayRefreshRequest
event-day-offline-request  -> handleEventDayOfflineRequest
event-day-edit-request     -> handleEventDayEditRequest
event-day-delete-request   -> handleEventDayDeleteRequest
```

- [ ] **Step 1: Write the binder test before the module exists**

Create `tests/bind-management-action-events.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { bindManagementActionEvents } from "../apps/webapp/js/app/bind-management-action-events";

function createApplication() {
  return {
    handleEventDayOpenRequest: vi.fn(async () => {}),
    handleEventDayRefreshRequest: vi.fn(async () => {}),
    handleEventDayOfflineRequest: vi.fn(async () => {}),
    handleEventDayEditRequest: vi.fn(async () => {}),
    handleEventDayDeleteRequest: vi.fn(async () => {}),
  };
}

describe("management action event binding", () => {
  it("forwards the five management request details exactly once", () => {
    const application = createApplication();
    const stop = bindManagementActionEvents(application, document);
    const cases = [
      ["event-day-open-request", "handleEventDayOpenRequest"],
      ["event-day-refresh-request", "handleEventDayRefreshRequest"],
      ["event-day-offline-request", "handleEventDayOfflineRequest"],
      ["event-day-edit-request", "handleEventDayEditRequest"],
      ["event-day-delete-request", "handleEventDayDeleteRequest"],
    ] as const;

    for (const [type, method] of cases) {
      const detail = { ref: { eventId: "C108", dayId: "day1" }, type };
      document.dispatchEvent(new CustomEvent(type, { detail }));
      expect(application[method]).toHaveBeenCalledTimes(1);
      expect(application[method]).toHaveBeenLastCalledWith(detail);
    }

    stop();
  });

  it("removes all five listeners and cleanup is safe to call twice", () => {
    const application = createApplication();
    const stop = bindManagementActionEvents(application, document);
    stop();
    stop();

    document.dispatchEvent(
      new CustomEvent("event-day-open-request", { detail: { ref: {} } }),
    );
    document.dispatchEvent(
      new CustomEvent("event-day-refresh-request", { detail: { ref: {} } }),
    );
    document.dispatchEvent(
      new CustomEvent("event-day-offline-request", { detail: { ref: {} } }),
    );
    document.dispatchEvent(
      new CustomEvent("event-day-edit-request", { detail: { ref: {} } }),
    );
    document.dispatchEvent(
      new CustomEvent("event-day-delete-request", { detail: { ref: {} } }),
    );

    expect(application.handleEventDayOpenRequest).not.toHaveBeenCalled();
    expect(application.handleEventDayRefreshRequest).not.toHaveBeenCalled();
    expect(application.handleEventDayOfflineRequest).not.toHaveBeenCalled();
    expect(application.handleEventDayEditRequest).not.toHaveBeenCalled();
    expect(application.handleEventDayDeleteRequest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the new test and capture RED**

```bash
npx vitest run --root . tests/bind-management-action-events.test.ts
```

Expected RED: module resolution/import failure for `bind-management-action-events`. Record the exact failure in the final report.

Do not create a dummy export just to change the RED shape.

- [ ] **Step 3: Implement the minimal binder**

Create `apps/webapp/js/app/bind-management-action-events.ts`:

```ts
export interface ManagementActionEventApplication {
  handleEventDayOpenRequest(detail: unknown): Promise<void>;
  handleEventDayRefreshRequest(detail: unknown): Promise<void>;
  handleEventDayOfflineRequest(detail: unknown): Promise<void>;
  handleEventDayEditRequest(detail: unknown): Promise<void>;
  handleEventDayDeleteRequest(detail: unknown): Promise<void>;
}

export function bindManagementActionEvents(
  application: ManagementActionEventApplication,
  document: Document,
): () => void {
  const handlers = {
    "event-day-open-request": (detail: unknown) =>
      void application.handleEventDayOpenRequest(detail),
    "event-day-refresh-request": (detail: unknown) =>
      void application.handleEventDayRefreshRequest(detail),
    "event-day-offline-request": (detail: unknown) =>
      void application.handleEventDayOfflineRequest(detail),
    "event-day-edit-request": (detail: unknown) =>
      void application.handleEventDayEditRequest(detail),
    "event-day-delete-request": (detail: unknown) =>
      void application.handleEventDayDeleteRequest(detail),
  } as const;

  const listeners = Object.entries(handlers).map(([type, handler]) => {
    const listener = (event: Event) => handler((event as CustomEvent).detail);
    document.addEventListener(type, listener);
    return [type, listener] as const;
  });
  let stopped = false;

  return () => {
    if (stopped) return;
    stopped = true;
    for (const [type, listener] of listeners) {
      document.removeEventListener(type, listener);
    }
  };
}
```

Do not add validation here. Existing BrowserApplication methods remain the event-boundary validation owners.

- [ ] **Step 4: Add the new binder to `bind-browser-events.ts`**

Add:

```ts
import { bindManagementActionEvents } from "./bind-management-action-events";
```

Then include exactly one new cleanup in the existing array:

```ts
const cleanups = [
  bindRouteGuidanceEvents(...),
  bindCircleStatusEvents(...),
  bindSettingsShellEvents(...),
  bindManagementActionEvents(dependencies.application, dependencies.document),
];
```

Do not change the other binder signatures.

- [ ] **Step 5: Remove only listener ownership from `BrowserApplication`**

In `apps/webapp/js/app/browser-application.ts`:

1. Change the five management handlers from `private` to normal instance methods:

```ts
async handleEventDayOpenRequest(detail: unknown): Promise<void>
async handleEventDayRefreshRequest(detail: unknown): Promise<void>
async handleEventDayOfflineRequest(detail: unknown): Promise<void>
async handleEventDayEditRequest(detail: unknown): Promise<void>
async handleEventDayDeleteRequest(detail: unknown): Promise<void>
```

2. Delete the entire private `bindManagementActionEvents()` method.

3. In `setupEvents()`, replace the two-cleanup composition:

```ts
const browserEvents = bindBrowserEvents(...);
const managementActionCleanup = this.bindManagementActionEvents();
this.eventBindingCleanup = () => {
  browserEvents.stop();
  managementActionCleanup();
};
```

with:

```ts
const browserEvents = bindBrowserEvents({
  application: this,
  document: this.document,
});
this.eventBindingCleanup = () => browserEvents.stop();
```

Do not move any handler body into the binder.

- [ ] **Step 6: Run focused GREEN**

```bash
npx vitest run --root . \
  tests/bind-management-action-events.test.ts \
  tests/browser-event-bindings.test.ts \
  tests/event-day-management-actions.test.ts
```

Required: all pass.

- [ ] **Step 7: Run type/architecture gates for this slice**

```bash
npm run check:webapp
git diff --check
```

Both must pass.

- [ ] **Step 8: Commit Task 5.1**

```bash
git add \
  apps/webapp/js/app/bind-management-action-events.ts \
  apps/webapp/js/app/bind-browser-events.ts \
  apps/webapp/js/app/browser-application.ts \
  tests/bind-management-action-events.test.ts

git commit -m "refactor(app): move management action binding"
```

Do not include unrelated files.

---

## Task 5.2: Extract pure management projection without changing render timing

**Goal:** Move sync settings-model composition out of `BrowserApplication.updateManagementModels()` into one stateless pure function while leaving state reads, async-row staleness, and DOM application in `BrowserApplication`.

**Do not:** Pass repositories/controllers/DOM into the projection, move `managementUpdateToken`, await management rows before the sync render, or add a stateful presenter/manager class.

**Files:**
- Create: `apps/webapp/js/app/browser-management-projection.ts`
- Create: `tests/browser-management-projection.test.ts`
- Modify: `apps/webapp/js/app/browser-application.ts`
- Test: `tests/management-view-model.test.ts`
- Test: `tests/event-day-management-view-model.test.ts`
- Test: `tests/apps-behavior-characterization.test.ts`

**Interfaces:**

```ts
export interface BrowserManagementProjectionInput {
  readonly registry: EventRegistry;
  readonly states: readonly {
    readonly ref: EventDayRef;
    readonly state: LocalEventDayState;
  }[];
  readonly activeRef: EventDayRef | null;
  readonly activeState: LocalEventDayState | null;
  readonly sourceDraft: SourceManagerPanelModelInput["sourceDraft"];
  readonly transitionBusy: boolean;
  readonly sourceErrorMessage: string;
  readonly pendingGasState: {
    readonly busy: boolean;
    readonly resultMessage: string;
    readonly errorMessage: string;
  };
  readonly deletionState: {
    readonly selectedScope: LocalDataDeletionScope | null;
    readonly busy: boolean;
    readonly errorMessage: string;
  };
  readonly eventDayCount: number;
  readonly managementRows: readonly EventDayManagementRow[];
}

export interface BrowserManagementProjection {
  readonly eventDayOptions: ReturnType<typeof buildEventDayOptions>;
  readonly eventDayManagementRows: readonly EventDayManagementRow[];
  readonly selectedEventId: string;
  readonly selectedDayId: string;
  readonly sourceManagerModel: ReturnType<typeof buildSourceManagerPanelModel>;
  readonly outboxPanelModel: ReturnType<typeof buildOutboxPanelModel>;
  readonly deleteOptions: ReturnType<typeof buildDeleteOptions>;
  readonly deleteDialogModel: ReturnType<typeof buildStorageDeleteDialogModel>;
}

export function buildBrowserManagementProjection(
  input: BrowserManagementProjectionInput,
): BrowserManagementProjection;
```

- [ ] **Step 1: Write projection tests before the production module exists**

Create `tests/browser-management-projection.test.ts` with two focused cases.

```ts
import { describe, expect, it } from "vitest";
import { buildBrowserManagementProjection } from "../apps/webapp/js/app/browser-management-projection";
import type { LocalEventDayState } from "../apps/webapp/js/features/event-day/public-api";

const registry = {
  schemaVersion: 1 as const,
  events: [
    {
      eventId: "C108",
      displayName: "C108",
      mapBundle: "../maps/C108/manifest.json",
      days: [{ dayId: "day1", displayName: "1日目" }],
    },
  ],
};

const activeRef = { eventId: "C108", dayId: "day1" };
const activeState: LocalEventDayState = {
  schemaVersion: 2,
  source: { type: "csv", fileName: "circles.csv" },
  sourceGeneration: "generation-1",
  circles: [{ space: "東A01" }],
  circleStates: { "東A01": "purchased" },
  gasOutbox: [],
  timestamps: {
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    sourceUpdatedAt: "2026-08-20T00:00:00.000Z",
  },
};

function buildInput() {
  return {
    registry,
    states: [{ ref: activeRef, state: activeState }],
    activeRef,
    activeState,
    sourceDraft: {
      draftWebAppUrl: "",
      selectedSheetName: "",
      sheetNames: [],
      busy: false,
      errorMessage: null,
    },
    transitionBusy: false,
    sourceErrorMessage: "",
    pendingGasState: {
      busy: true,
      resultMessage: "sending",
      errorMessage: "",
    },
    deletionState: {
      selectedScope: { kind: "activity" as const, eventDay: activeRef },
      busy: false,
      errorMessage: "",
    },
    eventDayCount: 1,
    managementRows: [],
  };
}

describe("browser management projection", () => {
  it("builds the current settings models from plain state", () => {
    const result = buildBrowserManagementProjection(buildInput());

    expect(result.selectedEventId).toBe("C108");
    expect(result.selectedDayId).toBe("day1");
    expect(result.eventDayOptions).toHaveLength(1);
    expect(result.eventDayOptions[0]).toMatchObject({ selected: true });
    expect(result.sourceManagerModel).toMatchObject({
      activeRefLabel: "C108 day1",
      sourceType: "csv",
      canExportCsv: true,
    });
    expect(result.outboxPanelModel).toMatchObject({
      processing: true,
      resultMessage: "sending",
    });
    expect(result.deleteOptions).toHaveLength(4);
    expect(result.deleteDialogModel).toMatchObject({
      open: true,
      scope: { type: "activity", ref: activeRef },
    });
  });

  it("keeps empty selection output stable when no event day is active", () => {
    const result = buildBrowserManagementProjection({
      ...buildInput(),
      activeRef: null,
      activeState: null,
      deletionState: {
        selectedScope: null,
        busy: false,
        errorMessage: "",
      },
    });

    expect(result.selectedEventId).toBe("");
    expect(result.selectedDayId).toBe("");
    expect(result.deleteOptions).toEqual([]);
    expect(result.deleteDialogModel.open).toBe(false);
  });
});
```

If current domain types require exact readonly narrowing, adjust only test literals/types; do not change production domain contracts.

- [ ] **Step 2: Run the new test and capture RED**

```bash
npx vitest run --root . tests/browser-management-projection.test.ts
```

Expected RED: module resolution/import failure for `browser-management-projection`.

- [ ] **Step 3: Implement the pure projection module**

Create `apps/webapp/js/app/browser-management-projection.ts`.

Required imports are limited to types plus the five existing pure builders:

```ts
import type {
  EventDayRef,
  EventRegistry,
  LocalEventDayState,
} from "../features/event-day/public-api";
import type { LocalDataDeletionScope } from "../features/local-data-deletion/public-api";
import type { EventDayManagementRow } from "../shared/ui/event-day-management-view-model";
import {
  buildDeleteOptions,
  buildEventDayOptions,
  buildOutboxPanelModel,
  buildSourceManagerPanelModel,
  buildStorageDeleteDialogModel,
  type SourceManagerPanelModelInput,
} from "../shared/ui/management-view-model";
import type { DeleteScope } from "../shared/ui/management-events";
```

Use the interfaces from the **Interfaces** section exactly.

Add one private pure mapping:

```ts
function toDeleteScope(scope: LocalDataDeletionScope | null): DeleteScope | null {
  if (!scope) return null;
  if (scope.kind === "all-event-days") return { type: "all-events" };
  return {
    type: scope.kind === "circle-source" ? "circles" : scope.kind,
    ref: { ...scope.eventDay },
  } as DeleteScope;
}
```

Implement `buildBrowserManagementProjection()` preserving current formulas exactly:

```ts
export function buildBrowserManagementProjection(
  input: BrowserManagementProjectionInput,
): BrowserManagementProjection {
  const eventDayOptions = buildEventDayOptions(
    input.registry,
    input.states,
    input.activeRef,
  );
  const event = input.activeRef
    ? input.registry.events.find((candidate) => candidate.eventId === input.activeRef?.eventId)
    : null;
  const activeRefLabel = input.activeRef
    ? `${event?.displayName || input.activeRef.eventId} ${input.activeRef.dayId}`
    : "";

  const sourceManagerModel = buildSourceManagerPanelModel({
    activeRef: input.activeRef,
    activeRefLabel,
    activeState: input.activeState,
    sourceDraft: input.sourceDraft,
    transitionBusy: input.transitionBusy,
    sourceErrorMessage: input.sourceErrorMessage,
  });

  const outboxPanelModel = buildOutboxPanelModel(
    input.registry,
    input.states,
    {
      processing: input.pendingGasState.busy,
      resultMessage: input.pendingGasState.resultMessage,
      errorMessage: input.pendingGasState.errorMessage,
    },
  );

  const selectedPendingCount = input.activeState?.gasOutbox.length ?? 0;
  const totalPendingCount = input.states.reduce(
    (sum, item) => sum + item.state.gasOutbox.length,
    0,
  );
  const deleteOptions = input.activeRef
    ? buildDeleteOptions({
        selected: input.activeRef,
        eventDayCount: input.eventDayCount,
        activeCircleCount: input.activeState?.circles.length ?? 0,
        activityCount: input.activeState
          ? Object.keys(input.activeState.circleStates).length
          : 0,
        selectedPendingCount,
        totalPendingCount,
      })
    : [];

  const deleteDialogModel = buildStorageDeleteDialogModel({
    selectedScope: toDeleteScope(input.deletionState.selectedScope),
    deleteOptions,
    eventDayLabel: activeRefLabel,
    busy: input.deletionState.busy,
    errorMessage: input.deletionState.errorMessage,
  });

  return {
    eventDayOptions,
    eventDayManagementRows: input.managementRows,
    selectedEventId: input.activeRef?.eventId ?? "",
    selectedDayId: input.activeRef?.dayId ?? "",
    sourceManagerModel,
    outboxPanelModel,
    deleteOptions,
    deleteDialogModel,
  };
}
```

Do not add caching, memoization, class state, repository access, DOM access, or async behavior.

- [ ] **Step 4: Replace only sync projection code in `BrowserApplication.updateManagementModels()`**

Update imports:

- Remove direct imports of `buildDeleteOptions`, `buildEventDayOptions`, `buildOutboxPanelModel`, `buildSourceManagerPanelModel`, `buildStorageDeleteDialogModel`.
- Remove the now-unused `LocalDataDeletionScope` import and local `toDeleteScope()` function if it has no other caller.
- Keep `buildEventDayManagementRows` and `EventDayManagementRow` because the stale async row gate stays in BrowserApplication.
- Add:

```ts
import { buildBrowserManagementProjection } from "./browser-management-projection";
```

Refactor `updateManagementModels()` to gather state once and call the pure function:

```ts
updateManagementModels() {
  if (!this.eventRegistry) return;
  const updateToken = ++this.managementUpdateToken;
  const refs = this.eventDayRepository.listEventDays();
  const states = refs
    .map((ref) => ({ ref, state: this.eventDayRepository.load(ref) }))
    .filter(
      (item): item is { ref: EventDayRef; state: LocalEventDayState } =>
        item.state !== null,
    );
  const activeRef = this.activeRef;
  const activeState = this.activeState;
  const sourceSessionSnapshot = this.circleDataSourceSession.getSnapshot();
  const pendingGasState = this.pendingGasUpdatesController.getViewState();
  const deletionViewState = this.localDataDeletionController.getViewState();

  const projection = buildBrowserManagementProjection({
    registry: this.eventRegistry,
    states,
    activeRef,
    activeState,
    sourceDraft: {
      draftWebAppUrl: sourceSessionSnapshot.draftWebAppUrl,
      selectedSheetName: sourceSessionSnapshot.selectedSheetName,
      sheetNames: sourceSessionSnapshot.sheetNames,
      busy: sourceSessionSnapshot.busy,
      errorMessage: sourceSessionSnapshot.errorCode
        ? String(sourceSessionSnapshot.errorCode)
        : null,
    },
    transitionBusy: this.isTransitioning,
    sourceErrorMessage: this.sourceErrorMessage,
    pendingGasState,
    deletionState: {
      selectedScope: this.localDataDeletionController.getSelectedScope(),
      busy: deletionViewState.busy,
      errorMessage: deletionViewState.errorMessage,
    },
    eventDayCount: refs.length,
    managementRows: this.managementRows,
  });

  this.ui?.updateSettingsState(projection);

  void buildEventDayManagementRows({
    registry: this.eventRegistry,
    states,
    selected: activeRef,
    offlineCache: this.catalogOfflineCache,
  }).then((rows) => {
    if (updateToken !== this.managementUpdateToken) return;
    this.managementRows = rows;
    this.ui?.updateSettingsState({ eventDayManagementRows: rows });
  });
}
```

The sync `updateSettingsState(projection)` must happen before the async row promise resolves, matching current behavior.

- [ ] **Step 5: Run focused GREEN**

```bash
npx vitest run --root . \
  tests/browser-management-projection.test.ts \
  tests/management-view-model.test.ts \
  tests/event-day-management-view-model.test.ts \
  tests/apps-behavior-characterization.test.ts
```

Required: all pass.

- [ ] **Step 6: Run type/architecture gates**

```bash
npm run check:webapp
git diff --check
```

Both must pass.

- [ ] **Step 7: Adversarially inspect the module boundary before commit**

```bash
git grep -nE 'eventDayRepository|pendingGasUpdatesController|localDataDeletionController|document|window' -- \
  apps/webapp/js/app/browser-management-projection.ts || true
```

Expected: no runtime repository/controller/DOM ownership. Type names in imports are acceptable only if they are plain data types specified by the design; concrete controller/repository imports are not.

Also:

```bash
git grep -nE 'class |new |setTimeout|setInterval|addEventListener' -- \
  apps/webapp/js/app/browser-management-projection.ts || true
```

Expected: no match from production logic. If an import/type name happens to contain `class` text, inspect rather than blindly changing it.

- [ ] **Step 8: Commit Task 5.2**

```bash
git add \
  apps/webapp/js/app/browser-management-projection.ts \
  apps/webapp/js/app/browser-application.ts \
  tests/browser-management-projection.test.ts

git commit -m "refactor(app): extract management projection"
```

---

## Task 5.3: Group Route Guidance wiring inside the existing composition root

**Goal:** Make the existing Route Guidance dependency graph one named unit without hiding it in a new module or changing any Route Guidance implementation.

**Do not:** Create `route-guidance-assembly.ts`, add feature factories, change Route Guidance files, alter constructor arguments, change worker timing, or export the internal assembly function for tests.

**Files:**
- Modify: `apps/webapp/js/app/assemble-comipath-application.ts`
- Test unchanged: `tests/application-assembly.test.ts`
- Test unchanged: relevant Route Guidance tests through `npm run test:route-guidance`

**Interfaces:**

Add inside `assemble-comipath-application.ts` only:

```ts
interface RouteGuidanceAssembly {
  readonly routeGuidanceSession: ReturnType<typeof createRouteGuidanceSession>;
  readonly routeMapAreaCatalog: MapAreaCatalog;
  readonly routeMapAssetsLoader: HttpRouteMapAssetsLoader;
  readonly navigationRuntimeController: RouteGuidanceRuntimeController;
  readonly routeGuidanceController: RouteGuidanceController;
}

function assembleRouteGuidance(options: {
  readonly createAlnsWorker?: () => Worker;
  readonly getBrowserRuntime: () => BrowserApplication | null;
}): RouteGuidanceAssembly;
```

- [ ] **Step 1: Re-run the assembly characterization immediately before moving code**

```bash
npx vitest run --root . tests/application-assembly.test.ts
npm run test:route-guidance
```

Record counts. Both must be GREEN before the mechanical move.

This subtask is a pure internal refactor after Task 5.1/5.2 already supplied meaningful RED cycles. Do not invent new externally observable behavior merely to manufacture another RED.

- [ ] **Step 2: Add the internal `RouteGuidanceAssembly` type and function**

In `apps/webapp/js/app/assemble-comipath-application.ts`, place the interface and non-exported function after `toDomainMapManifest()` and before `assembleComiPathApplication()`.

Move the current Route Guidance block into `assembleRouteGuidance()` without changing construction order or arguments:

```ts
function assembleRouteGuidance(options: {
  readonly createAlnsWorker?: () => Worker;
  readonly getBrowserRuntime: () => BrowserApplication | null;
}): RouteGuidanceAssembly {
  const routeGuidanceSession = createRouteGuidanceSession();
  const routeMapAreaCatalog: MapAreaCatalog = {
    getAllMapAreas: () => runtimeMapAreaCatalog.getAllMapAreas(),
    getMapArea: (areaId) => runtimeMapAreaCatalog.getMapArea(areaId),
    findMapAreaForCircleSpace: (circleSpace) =>
      runtimeMapAreaCatalog.findMapAreaForCircleSpace(circleSpace),
    initializeMapAreas: (areas) =>
      runtimeMapAreaCatalog.initializeMapAreas(
        areas.map((area) => ({
          ...area,
          id: area.id ?? area.areaId,
          name: area.name ?? area.displayName ?? area.areaId,
          prefixes: area.prefixes ?? [],
          labels: area.labels ?? [],
        })),
      ),
    replaceMapAreas: (areas) =>
      runtimeMapAreaCatalog.replaceMapAreas(
        areas.map((area) => ({
          ...area,
          id: area.id ?? area.areaId,
          name: area.name ?? area.displayName ?? area.areaId,
          prefixes: area.prefixes ?? [],
          labels: area.labels ?? [],
        })),
      ),
  };
  const routeMapAssetsLoader = new HttpRouteMapAssetsLoader();
  const snapshotRepository = new LocalStorageRouteGuidanceSnapshotRepository();
  const matrixRepository = new LocalStorageDistanceMatrixRepository();
  const distanceMatrixController = new DistanceMatrixController({
    repository: matrixRepository,
  });
  const orchestrationService = new RouteGuidanceNavigationOperations();
  const navigationRuntimeController = new RouteGuidanceRuntimeController({
    snapshotRepo: snapshotRepository,
    matrixRepo: matrixRepository,
    orchestration: orchestrationService,
    ...(options.createAlnsWorker
      ? { workerFactory: options.createAlnsWorker }
      : {}),
  });
  const optimizationFeedback = {
    onPreview: (preview: RouteOptimizationPreview) =>
      options.getBrowserRuntime()?.ui.showOptimizationPreview(preview),
    onClear: () => options.getBrowserRuntime()?.ui.clearOptimizationPreview(),
  };
  const routeGuidanceController = new RouteGuidanceController({
    startGuidance: new StartRouteGuidanceUseCase(
      routeGuidanceSession,
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      snapshotRepository,
    ),
    resumeGuidance: new ResumeRouteGuidanceUseCase(
      routeGuidanceSession,
      navigationRuntimeController,
      routeMapAssetsLoader,
      routeMapAreaCatalog,
      optimizationFeedback,
    ),
    changeDestination: new ChangeDestinationUseCase(
      routeGuidanceSession,
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      orchestrationService,
    ),
    finishCircle: new FinishCurrentCircleUseCase(
      routeGuidanceSession,
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      orchestrationService,
    ),
    session: routeGuidanceSession,
    navigationOperations: orchestrationService,
    invalidateGuidance: new InvalidateRouteGuidanceUseCase(routeGuidanceSession),
    navigationRuntimeController,
    prepareOptimization: new PrepareRouteOptimizationUseCase(
      routeMapAreaCatalog,
      routeMapAssetsLoader,
      distanceMatrixController,
    ),
    optimizationFeedback,
  });

  return {
    routeGuidanceSession,
    routeMapAreaCatalog,
    routeMapAssetsLoader,
    navigationRuntimeController,
    routeGuidanceController,
  };
}
```

Do not extract `routeMapAreaCatalog` into another function.

- [ ] **Step 3: Replace the old inline block with one call**

Immediately after the Circle Data Source controller assembly, use:

```ts
const routeGuidance = assembleRouteGuidance({
  getBrowserRuntime: () => browserRuntime,
  ...(options.createAlnsWorker
    ? { createAlnsWorker: options.createAlnsWorker }
    : {}),
});
const {
  routeGuidanceSession,
  routeMapAreaCatalog,
  routeMapAssetsLoader,
  navigationRuntimeController,
  routeGuidanceController,
} = routeGuidance;
```

Delete the old duplicate inline Route Guidance construction block completely.

Do not change later uses of these variables.

- [ ] **Step 4: Run assembly and Route Guidance GREEN**

```bash
npx vitest run --root . tests/application-assembly.test.ts
npm run test:route-guidance
```

Counts should match the same suites from Step 1 except for unrelated test-discovery changes, which are not expected in this Task.

If `tests/application-assembly.test.ts` fails only because a private `.deps` shape is no longer reachable, first verify whether the controller object itself changed. The planned move should not change it, so such a failure indicates an accidental structural change. Restore the current construction rather than weakening the assertion.

- [ ] **Step 5: Run architecture/type/build gates**

```bash
npm run check:webapp
npm run build:webapp
git diff --check
```

All must pass.

- [ ] **Step 6: Prove no assembly framework was introduced**

```bash
git diff --name-only "$TASK_START_SHA"..HEAD -- apps/webapp/js/app

git grep -nE 'EventBus|DIContainer|DependencyContainer|ServiceLocator|ApplicationManager|ApplicationCoordinator' -- \
  apps/webapp/js/app || true
```

Expected app production changes remain within the files listed in Global Constraints. No new generic framework file should exist.

Also verify no new app file contains vague architecture names:

```bash
find apps/webapp/js/app -maxdepth 1 -type f \
  \( -name '*manager*' -o -name '*handler*' -o -name '*helper*' -o -name '*utils*' -o -name '*coordinator*' \) \
  -print
```

Do not add new matches in Task 5.

- [ ] **Step 7: Commit Task 5.3**

```bash
git add apps/webapp/js/app/assemble-comipath-application.ts
git commit -m "refactor(app): group route guidance assembly"
```

---

## Task 5.4: Full regression, adversarial scope review, and handoff

**Goal:** Prove the refactor preserved runtime behavior and record Task 5 as implementation-complete but browser-review-pending.

**Do not:** Mark Task 5 CLOSED, start Task 6, update snapshots, hide E2E failures with retries/skips, or merge to main.

**Files:**
- Modify after all verification: `docs/status/progress.md`
- Verify: all changed app/test files and protected paths.

**Interfaces:**
- Consumes: Task 5.1〜5.3 committed code.
- Produces: pushed reviewable branch and factual verification record.

- [ ] **Step 1: Run the complete focused Task 5 suite**

```bash
npx vitest run --root . \
  tests/bind-management-action-events.test.ts \
  tests/browser-management-projection.test.ts \
  tests/browser-event-bindings.test.ts \
  tests/event-day-management-actions.test.ts \
  tests/management-view-model.test.ts \
  tests/event-day-management-view-model.test.ts \
  tests/application-assembly.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/comipath-application.test.ts
```

Record exact file/test counts and exit code.

- [ ] **Step 2: Run full repository verification**

```bash
npm run verify
```

Required: exit 0. Record exact webapp test file/test counts and each sub-gate result printed by the command.

- [ ] **Step 3: Run full CI-equivalent E2E**

```bash
npm run test:e2e:ci
```

Required default result: exit 0.

If a test fails:

1. Record exact failing test, attempt count, screenshot/trace availability, and failure text.
2. Re-run the exact failing spec/test once without modifying code to classify flakiness.
3. If the failure reproduces, compare against `TASK_START_SHA` in a clean baseline worktree/container using the same command or the smallest exact E2E spec.
4. A failure present only on Task 5 HEAD is `TASK5_REGRESSION` and must be fixed before handoff.
5. A failure that reproduces on baseline may be recorded as existing/environmental, but do not change retry/skip/snapshot thresholds.

Do not report E2E green merely because a retry eventually passed; record flaky retry behavior exactly.

- [ ] **Step 4: Run architecture and public-tree hygiene explicitly**

```bash
npm run check:webapp:architecture
node scripts/audit-public-tree.mjs
git diff --check
```

All must pass.

- [ ] **Step 5: Run the protected-path scope audit**

```bash
git diff --name-status "$TASK_START_SHA"..HEAD

git diff --name-only "$TASK_START_SHA"..HEAD -- \
  apps/webapp/js/features \
  apps/webapp/js/components \
  apps/webapp/js/shared \
  apps/webapp/events \
  apps/webapp/map-bundles \
  vite.config.ts \
  package.json \
  package-lock.json \
  integrations \
  functions \
  .github/workflows \
  tests/e2e
```

The protected-path output must be empty.

Expected implementation-range files before progress update:

```text
A apps/webapp/js/app/bind-management-action-events.ts
A apps/webapp/js/app/browser-management-projection.ts
M apps/webapp/js/app/bind-browser-events.ts
M apps/webapp/js/app/browser-application.ts
M apps/webapp/js/app/assemble-comipath-application.ts
A tests/bind-management-action-events.test.ts
A tests/browser-management-projection.test.ts
```

If `tests/application-assembly.test.ts` or `tests/browser-event-bindings.test.ts` was changed, explain precisely why a compile-only fixture adjustment was unavoidable and prove behavioral assertions were not weakened. Otherwise they should be unchanged.

- [ ] **Step 6: Adversarially review the Task 5 diff**

Answer every item with file/function/test evidence in the final report.

1. Does `bind-management-action-events.ts` only register/forward/cleanup the five specified DOM events?
2. Does it avoid repository, cache, controller, network, route, or business validation logic?
3. Does `BrowserApplication` still own the five cross-feature action bodies?
4. Is the old `BrowserApplication.bindManagementActionEvents()` listener loop gone?
5. Does `bind-browser-events.ts` compose the new binder exactly once?
6. Is cleanup idempotent and covered by test?
7. Is `browser-management-projection.ts` stateless and synchronous?
8. Does it receive only plain data, not repositories/controllers/DOM?
9. Does it preserve the exact current counts, labels, outbox state, delete mapping, and selected IDs?
10. Does `BrowserApplication.updateManagementModels()` still render sync models before async management rows resolve?
11. Is `managementUpdateToken` still the stale async-row gate in `BrowserApplication`?
12. Is Route Guidance construction still in `assemble-comipath-application.ts`, with no new assembly module/factory family?
13. Is there exactly one new internal `assembleRouteGuidance()` function for that wiring?
14. Are all existing Route Guidance constructor arguments and optimization feedback semantics unchanged?
15. Is the existing typed `BrowserApplication | null` late binding retained without EventBus/DI replacement?
16. Are all `apps/webapp/js/features/**` files unchanged?
17. Are components/shared/event/map/Vite/package/integrations/functions/workflows/E2E specs unchanged?
18. Is Task 6 onboarding absent from the diff?
19. Was no visual snapshot updated?
20. Was no existing test weakened, skipped, or given extra retry?

If any answer is no, fix the Task 5 refactor before status update. If fixing it requires changing a feature contract or user behavior, stop and report a design blocker to browser review.

- [ ] **Step 7: Update `docs/status/progress.md` with measured evidence**

Modify only the current Phase 8 state and add one compact Task 5 verification section. Preserve historical sections.

Current state must become semantically equivalent to:

```text
- Phase 8 Task 1: complete.
- Phase 8 Task 2: complete.
- Phase 8 Task 3: complete.
- Phase 8 Task 4: complete / browser accepted.
- Current Task: Phase 8 Task 5 targeted application refactor — implementation complete / browser review pending.
- Next Task: Phase 8 Task 6 first-launch onboarding — do not start before Task 5 browser acceptance.
- canonical Task 5 plan: docs/plans/phase-08/task-05-targeted-application-refactor.md
- Task 5 design: docs/specs/2026-08-20-phase-08-task-05-targeted-application-refactor-design.md
```

Add actual measured values only:

- Task 5 focused file/test count.
- `npm run verify` exact result/counts.
- full E2E result/counts and any retry/flaky classification.
- architecture/public-tree/diff-check results.
- created production modules.
- protected-path scope result.
- explicit `browser review pending`.

Do not write `Task 5 CLOSED`, `accepted`, or `complete` without the `implementation complete / browser review pending` qualifier.

- [ ] **Step 8: Commit the factual progress update**

```bash
git diff --check
git add docs/status/progress.md
git commit -m "docs(phase-08): record task 5 verification"
```

- [ ] **Step 9: Re-run minimum post-doc gates**

```bash
npx vitest run --root . \
  tests/bind-management-action-events.test.ts \
  tests/browser-management-projection.test.ts \
  tests/application-assembly.test.ts
npm run check:webapp
git diff --check
```

All must pass.

- [ ] **Step 10: Final branch audit and push**

```bash
git status --short
git diff --name-status "$TASK_START_SHA"..HEAD
git log --oneline "$TASK_START_SHA"..HEAD

git diff --name-only "$TASK_START_SHA"..HEAD -- \
  apps/webapp/js/features \
  apps/webapp/js/components \
  apps/webapp/js/shared \
  apps/webapp/events \
  apps/webapp/map-bundles \
  vite.config.ts package.json package-lock.json integrations functions .github/workflows tests/e2e
```

Working tree must be clean and protected-path diff empty.

Push:

```bash
git push origin docs/phase-08-task-05-targeted-application-refactor-plan
```

Stop after push. Do not merge to main and do not start Task 6.

## Final report required from Codex

Report all of the following:

```text
TASK_START_SHA
final pushed HEAD
commits created with messages
complete changed-file list
Task 5.0 focused baseline counts
Task 5.1 initial RED exact failure
Task 5.1 focused GREEN counts
Task 5.2 initial RED exact failure
Task 5.2 focused GREEN counts
Task 5.3 pre/post assembly test counts
full Task 5 focused counts
npm run verify exact counts/results
npm run test:e2e:ci exact counts/results/retries
architecture checker result
public-tree audit result
git diff --check result
protected-path diff result
proof that old management listener loop is absent
proof that projection has no repository/controller/DOM ownership
proof that Route Guidance feature files are unchanged
proof that no DI/EventBus/generic framework was introduced
proof that Task 6 was not started
any environment-only or baseline issue
```

## Browser-side acceptance gate

Codex completion and local tests are not final acceptance. After push, browser-side review must inspect the actual remote diff against `TASK_START_SHA`, verify the three responsibility changes, re-check scope, and decide ACCEPTED or CHANGES REQUIRED.

Task 6 must not start before that acceptance.
