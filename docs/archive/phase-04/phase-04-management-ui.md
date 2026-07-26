# Phase 4: Mobile Management UI Implementation Plan

> **For agentic workers:** This file is the Phase 4 contract and execution index. Read `docs/architecture/ui-ux-direction.md`, then implement one linked Task at a time. Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`; do not combine Task commits.

**Goal:** 地図主役の現行画面を維持しながら、event/day切替、CSV/GAS source管理、差分確認、outbox回復、データ削除、CSV exportをスマホ片手で安全に操作できるようにする。

**Architecture:** Existing imperative map/pin/route/bottom-sheet code remains in place. Pure view-model functions convert domain state into safe display data. Light-DOM Lit components render isolated management controls and emit typed bubbling `CustomEvent`s; `App` alone coordinates services and map transitions. Components never import repositories, clients, or services.

**Tech Stack:** Lit 3、TypeScript strict、existing imperative DOM、Vitest happy-dom、Playwright mobile Chromium、existing responsibility-split CSS。

## Entry gate

- Phase 3 Task 9 is committed and the Phase 3 exit gate passes.
- The new branch starts from the approved Phase 3 result. Recommended: `feature/management-ui`.
- Existing 20 baseline mobile tests and the complete original snapshot directory
  (currently five logical scenarios / nine PNG files) pass before UI work begins.
- No real map, endpoint, spreadsheet identifier, or private data is available to component or E2E fixtures.

## Visual and interaction constraints

- The map/navigation surface remains the primary screen. Management opens from the existing settings entry and does not become a permanent dashboard.
- The normal header shows operational information, not a persistent `ComiPath` brand label.
- Use Mincho-oriented existing typography, thin rules, restrained corners, and rectangular controls. Avoid gradients, blur, floating-card proliferation, excessive shadows, and pill-heavy controls.
- Every interactive target is at least 44×44 CSS px at Pixel 5 viewport width.
- Full-screen dialogs handle source diff and destructive confirmation. Focus is trapped while open, Escape cancels non-destructive dialogs, focus returns to the opener, and background content is inert.
- Components show service-provided safe summaries. Outbox rows never render a full GAS URL, sheet contents, CSV contents, request body, stack trace, or raw server response.
- Busy state prevents duplicate UI events but is not a safety boundary; every service apply/delete operation rechecks current generation and pending outbox.

## Atomic event/day transition contract

Never show an event/day state on another event's map.

1. Resolve and validate the requested ref in the event registry.
2. Resolve the selected event's `mapBundle` relative to the fetched registry URL.
3. Fetch and runtime-validate the new manifest without changing current UI/state.
4. Require `manifest.eventId === ref.eventId`.
5. Prepare the target state without changing active ref or `last-opened`.
6. Commit repository activation, `Config` areas, map manifest, route cache reset, selected pin/route reset, DataManager active memory, and UI render as one guarded transition.
7. On any prepare failure, leave the old screen untouched. On a commit/render failure, restore the previous in-memory/UI/config snapshot and previous `last-opened`; a newly prepared but inactive empty state may remain in storage, but must not be displayed with the old map.
8. Day-only changes reuse the same event manifest. Event changes never use Vite's first-event compatibility alias.

## Shared management types and events

Task 1 defines these once in `apps/webapp/js/ui/management-events.ts` and later Tasks import them:

```ts
export type DataSourceDraft =
  | { readonly type: "csv"; readonly file: File }
  | { readonly type: "gas"; readonly gasUrl: string; readonly sheetName: string };

export type DeleteScope =
  | { readonly type: "circles"; readonly ref: EventDayRef }
  | { readonly type: "activity"; readonly ref: EventDayRef }
  | { readonly type: "event-day"; readonly ref: EventDayRef }
  | { readonly type: "all-events" };

export interface ManagementEventDetailMap {
  "event-day-select": EventDayRef;
  "csv-preview-request": { file: File };
  "gas-sheets-request": { gasUrl: string };
  "gas-preview-request": { source: GasDataSource; mode: "initial" | "replacement" | "refresh" };
  "source-preview-apply": { previewId: string };
  "source-preview-cancel": Record<string, never>;
  "gas-retry-request": { ref: EventDayRef | null };
  "gas-discard-request": { ref: EventDayRef; ids: readonly string[]; confirmation: string };
  "storage-delete-request": { scope: DeleteScope; confirmation: string };
  "csv-export-request": { ref: EventDayRef };
}
```

Use a shared typed dispatch helper. Event names and detail fields must not be redefined differently in each component.

## Task order

| Task | Plan | Deliverable | Depends on |
|---|---|---|---|
| 1 | [View models and events](phase-04/task-01-view-models.md) | safe display models and typed event contract | Phase 3 |
| 2 | [Atomic map transition](phase-04/task-02-event-map-transition.md) | event-scoped loader and prepared transition service | Task 1 |
| 3 | [Event/day selector](phase-04/task-03-event-day-selector.md) | accessible selector wired through atomic transition | Task 2 |
| 4 | [Source manager](phase-04/task-04-source-manager.md) | CSV/GAS forms and preview requests | Tasks 1, 3 |
| 5 | [Diff dialog](phase-04/task-05-source-diff-dialog.md) | explicit source apply/cancel | Task 4 |
| 6 | [Outbox recovery](phase-04/task-06-outbox-panel.md) | safe list/retry/discard | Tasks 1, 4 |
| 7 | [Scoped deletion](phase-04/task-07-storage-deletion.md) | four scopes with pending locks | Tasks 1, 2, 4, 5, 6 |
| 8 | [CSV download](phase-04/task-08-csv-download.md) | deterministic export filename and URL cleanup | Task 4 |
| 9 | [Mobile E2E](phase-04/task-09-mobile-e2e.md) | complete user flows and intentional UI snapshots | Tasks 3–8 |
| 10 | [Accessibility/docs/handoff](phase-04/task-10-handoff.md) | audits, public docs, final verification | Tasks 1–9 |

## Component boundaries

```text
comipath-settings       management shell/open-close/focus return
event-day-selector      selector rendering and event only
source-manager          source forms and request events only
source-diff-dialog      preview display and apply/cancel only
outbox-panel            safe queue view and retry/discard request only
storage-delete-dialog   scope/confirmation and delete request only
App                     service calls, state refresh, errors, transition orchestration
```

No component reads `localStorage`, calls `fetch`, constructs a repository/service, or logs event details containing files/URLs.

App remains the owner of service calls. To keep `app.js` from accumulating
request tokens and preview lifecycle state, Task 4 may create a pure
`management-session.ts` helper. That helper may own tokens, AbortControllers,
busy lanes, and active-preview descriptors, but it must not import a
repository, client, or service.

## Task 3 handoff gate

Task 4 must not start merely because selector component tests pass. The Task 3
worktree result must first satisfy all of the following:

- `npm run test:webapp`, typecheck, build verification, Biome, and mobile E2E pass.
- App retains the startup manifest so a same-event day switch performs no
  second manifest GET.
- Rapid A→B selection is newest-wins; an older prepare/commit/render cannot
  replace B.
- Prepare, commit, or render failure restores the old map, state, selected
  values, Config, and last-opened consistently.
- Registry default selection contains no hard-coded `demo-v1/day1` fallback.
- Failure restores selector display and focus, and both selects have unique
  accessible names.

The evidence and missing tests found during the Task 4–10 review are recorded
in [the Phase 4 plan/test review](../reviews/2026-07-23-phase-04-task-04-10-plan-review.md).

## Deletion semantics

| Scope | Result | Pending rule |
|---|---|---|
| circles | replace source snapshot with empty CSV sentinel; clear circles and source-derived title, keep activity only if still schema-valid | blocked by any affected outbox |
| activity | clear purchased, hold, history, redo; keep circles/source | blocked by any affected outbox |
| event-day | delete the whole ref and index entry | blocked by any affected outbox |
| all-events | delete every existing ref, index, and last-opened, then initialize the registry default as a new empty sentinel state | blocked if any ref has pending outbox |

Because activity is LocalStorage authority and pending entries represent unsent copies of that authority, activity deletion is blocked. The user must retry or explicitly discard pending entries first; a confirmation dialog cannot bypass this service rule.

After deleting the active ref, transition to the registry default event/day
through the same atomic transition path. This path must bypass the normal
same-ref no-op because the deleted default may need to be recreated. If
fallback activation fails, show a no-active-data diagnostic and do not display
a deleted state with the old map.

## Verification baseline

Every Task runs focused Vitest plus:

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npx biome check
git diff --check
git status --short --branch
```

Tasks 2–10 also run `npm run test:e2e` because they affect map/settings/purchase/mobile behavior. Snapshot updates are allowed only in Task 9, only for named new management surfaces, and only after verifying the entire original snapshot directory has zero diff. Do not rely on a fixed snapshot file count.

## Phase 4 definition of done

- Users can select only registry-valid event/day values; map and state never mismatch.
- CSV and GAS create/replace/refresh always show and confirm a current preview.
- Pending outbox is visible through redacted summaries and can be retried or explicitly discarded.
- Every destructive scope is named, confirmed, service-guarded, and failure-safe.
- CSV export reflects LocalStorage purchase truth and revokes its object URL.
- Keyboard, screen-reader names, focus traps/return, live errors, touch sizes, safe-area insets, and Pixel 5 overflow are tested.
- Existing navigation behavior and original screenshots remain unchanged except for explicitly approved integration points.
- Public docs describe only implemented workflows, all audits pass, and no remote operation occurs without separate approval.
