# Phase 4 Task 5: Confirm Source Diffs in a Full-Screen Dialog

> **Depends on:** Task 4. **Scope:** Preview presentation and apply/cancel wiring only. It does not create previews or recompute diffs.

## Goal

Show exactly what a CSV/GAS source operation will add, update, and remove, then apply only the service-issued preview ID after explicit confirmation.

## Files

- Create: `apps/webapp/js/components/source-diff-dialog.ts`
- Create: `tests/source-diff-dialog.test.ts`
- Create: `tests/source-diff-app.test.ts`
- Modify: `apps/webapp/js/components/comipath-settings.ts` or `apps/webapp/index.html` for one dialog host
- Modify: `apps/webapp/js/app.js`
- Modify: `apps/webapp/js/data-manager.ts`
- Modify: `tests/data-manager-event-day.test.ts`
- Modify: `apps/webapp/js/ui/management-session.ts`
- Modify: `tests/management-session.test.ts`
- Modify: `apps/webapp/css/modals.css`
- Modify: `package.json`

## Component contract

```ts
export interface SourceDiffDialogModel {
  readonly open: boolean;
  readonly previewId: string;
  readonly sourceLabel: string;
  readonly diff: SourceDiffViewModel;
  readonly busy: boolean;
  readonly errorMessage: string;
}
```

- Render `role="dialog"`, `aria-modal="true"`, labelled title and description.
- Show counts first, then collapsible/scrollable added, updated, and removed sections.
- Updated rows list changed field names; do not print full memo/tweet values.
- Explain that local purchase/hold/history remain, `isSale=x` may add purchase, and source-empty sale never cancels local purchase.
- Apply emits only `{previewId}`. Cancel emits an empty detail. The component never receives raw CSV or GAS response data.

App does not infer the apply/cancel service from the preview ID prefix. It
reads the discriminated `ActiveSourcePreview` created by Task 4 and requires
the event ID to match that one active descriptor. A new preview cancels and
replaces the old descriptor.

Add the missing CSV lifecycle boundary:

```ts
cancelCsvPreview(previewId: string): void;
```

It removes only the named memory preview and never changes persisted or
in-memory active state. GAS cancellation continues to use
`cancelGasPreview(previewId)`.

## Focus behavior

- On open: remember `document.activeElement`, set background management shell inert, and focus the dialog heading or first control.
- Tab/Shift+Tab wrap inside enabled dialog controls.
- Escape cancels only when not busy.
- On close/cancel/success: remove inert and return focus to the remembered connected opener; otherwise focus the settings heading.
- Stale/apply errors keep the dialog open, focus the alert, and allow cancel/retry by creating a new preview. They never silently reapply.
- Event/day change or settings close cancels the active CSV/GAS preview,
  removes inert, closes the dialog, and prevents a delayed Task 4 request from
  reopening it.
- Disconnect cleanup removes inert and focus-key handlers even when App tears
  the host down during a transition.

## TDD steps

- [ ] **Step 1: Write render tests**

Cover empty sections, counts, row summaries, removed warning, preservation explanation, safe values, busy state, and error alert.

- [ ] **Step 2: Write focus/event tests**

Cover initial focus, Tab wrap both directions, no-enabled-control fallback to
the heading, Escape cancel, busy Escape ignored, apply event exact ID, cancel
event, double apply/cancel suppression, background inert, disconnect cleanup,
and focus return when the opener still exists or has been removed.

- [ ] **Step 3: Write App apply tests**

Cover CSV, GAS initial, GAS replacement, and GAS refresh preview descriptors;
successful apply closes and rebuilds selector/source/outbox/delete models from
one current repository snapshot; stale/expired/pending/storage failures leave
dialog open and active state unchanged; cancel calls the matching CSV/GAS
method and never applies. Cover an ID collision across CSV/GAS test doubles,
wrong event ID, event/day change, settings close, delayed preview completion
after cancel, and rapid double apply.

- [ ] **Step 4: Verify RED**

```bash
npx vitest run --root . tests/source-diff-dialog.test.ts tests/source-diff-app.test.ts tests/management-session.test.ts tests/data-manager-event-day.test.ts
```

- [ ] **Step 5: Implement dialog with shared focus helper if needed**

If focus trapping is reusable for deletion dialogs, create a focused `apps/webapp/js/ui/dialog-focus.ts` module with its own tests in this Task. Do not duplicate slightly different traps later.

- [ ] **Step 6: Verify**

```bash
npx vitest run --root . tests/source-diff-dialog.test.ts tests/source-diff-app.test.ts tests/source-manager.test.ts tests/management-session.test.ts tests/data-manager-event-day.test.ts
npm run verify
npx biome check
npm run test:e2e
```

- [ ] **Step 7: Present commit candidate**

Proposed message: `feat(ui): confirm source update diffs`.

## Review checklist

- No apply occurs on file selection or GET completion.
- Only a preview ID crosses the component boundary.
- App uses the active preview kind/ref, not an ID prefix, to select apply/cancel.
- CSV and GAS previews are both removed on cancel, ref change, and settings close.
- Focus/inert cleanup works for success, cancel, and error.
- Stale/pending failure preserves dialog and persisted state.
- Sensitive row values are not bulk-rendered.
