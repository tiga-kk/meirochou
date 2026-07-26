# Phase 4 Task 3: Add the Accessible Event/Day Selector

> **Depends on:** Task 2. **Scope:** Selector component and App wiring only. Source forms and broad visual redesign are out of scope.

## Goal

Let users select registry-defined events and days from the existing settings surface, with configured/pending status and atomic map transition behavior.

## Files

- Create: `apps/webapp/js/components/event-day-selector.ts`
- Create: `tests/event-day-selector.test.ts`
- Modify: `apps/webapp/js/components/comipath-settings.ts`
- Modify: `apps/webapp/js/app.js`
- Modify: `apps/webapp/index.html` only if a stable host element is needed
- Modify: `apps/webapp/css/forms.css`
- Modify: `package.json`

## Component contract

```ts
export class EventDaySelector extends LitElement {
  options: readonly EventDayOption[];
  selectedEventId: string;
  selectedDayId: string;
  busy: boolean;
  errorMessage: string;
}
```

- Render two labeled native `<select>` controls in light DOM.
- Day options are filtered by selected event but the component does not commit a selection locally until App supplies updated properties.
- Labels identify `未設定` and pending count without color alone.
- Emit only `event-day-select` with validated option IDs from the supplied model.
- While `busy`, disable both selects and expose `aria-busy=true`.
- Error uses `role=alert`; it contains safe App-provided text only.

## App behavior

1. Receive the event.
2. Ignore the active ref and duplicate in-flight selection.
3. Set busy and call Task 2 `prepare()`.
4. Commit/render only if this request is still newest.
5. Rebuild selector/source/outbox models from committed state.
6. On failure, keep previous selected values/map/state, clear busy, announce a diagnostic, and return focus to the relevant select.

## TDD steps

- [ ] **Step 1: Write render and accessibility tests**

Cover labels, selected values, event→day filtering, unconfigured marker, pending count, disabled/busy, empty registry error, touch-size CSS selector, and error live region.

- [ ] **Step 2: Write event tests**

Assert exactly one bubbling/composed typed event for a valid changed pair; no event on rerender, same pair, disabled input, or option value absent from properties.

- [ ] **Step 3: Write App integration tests**

Use a fake transition service. Cover success, prepare failure, commit failure, rapid A→B selection with stale A completion, same-event day change, different-event map change, and selected model updated only after commit.

- [ ] **Step 4: Verify RED**

```bash
npx vitest run --root . tests/event-day-selector.test.ts tests/event-day-transition-service.test.ts
```

- [ ] **Step 5: Implement component and settings-shell placement**

Place selector near the top of the existing settings area. Do not add a second permanent header row or move the map/navigation card. Use existing design tokens and rectangular controls.

- [ ] **Step 6: Verify unit, browser, and original snapshots**

```bash
npx vitest run --root . tests/event-day-selector.test.ts tests/settings-component.test.ts
npm run verify
npx biome check
npm run test:e2e
```

Do not update snapshots in this Task. If the closed settings surface changes a baseline screenshot, treat it as a bug.

- [ ] **Step 7: Present commit candidate**

Proposed message: `feat(ui): add event day switching`.

## Review checklist

- Component cannot access services/storage/fetch.
- Selected value changes only after atomic commit.
- Rapid selection cannot render stale completion.
- Failure retains old map/state and is announced accessibly.
- Closed management UI leaves baseline visuals unchanged.
