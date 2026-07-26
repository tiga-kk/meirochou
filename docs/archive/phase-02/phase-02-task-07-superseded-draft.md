# Superseded: Phase 2 Task 7 Draft

This draft is retained only as historical context. Do not implement or commit against it. The authoritative replacement is [Phase 2 Task 7 Safety Replan](../plans/phase-02-task-07.md), which removes the automatic legacy GAS path and requires stale-safe CSV previews.

---

# Implementation Plan - Task 7: Connect data services without changing UI layout

## Goal
Integrate the newly built event/day data registry, repository, CSV codec, and diff engine into `DataManager` and `App.js`. Ensure all existing functionalities work with the currently active event/day, and implement safe legacy migration functions without altering the UI layout.

## Assumptions
- The active event/day state is stored in localStorage under a namespace (`comipath:v1:${eventId}:${dayId}:state`) managed by `EventDayRepository`.
- The startup process loads the last-opened event/day or defaults to `demo-v1/day1`.
- Legacy keys (like `purchasedList`, `holdList`, `actionHistory`, `comiketData`, `redoStack`) can be previewed and migrated explicitly.

## Plan

### Phase 1: Test-Driven Development (Red Stage)
1. **Create failing integration tests**
   - File: `tests/data-manager-event-day.test.ts`
   - Test cases:
     - Initialization of `DataManager` loads default event/day or last-opened event/day.
     - `openEventDay` loads an existing event/day state, or initializes an empty state if it does not exist.
     - `importCsv` parses and overwrites circles data.
     - `previewCsvReplacement` and `applyCsvReplacement` behave correctly using diff engine.
     - `exportCsv` serializes current state circles and purchased marks.
     - `previewLegacyImport` and `applyLegacyImport` migrate legacy keys safely.
   - Verify: Run `npx vitest run --root . tests/data-manager-event-day.test.ts` and confirm they fail.

### Phase 2: Implementation of DataManager Integrations (Green Stage)
2. **Update DataManager class**
   - File: `apps/webapp/js/data-manager.ts`
   - Changes:
     - Instantiate `EventDayRepository`.
     - Implement `openEventDay`, `importCsv`, `previewCsvReplacement`, `applyCsvReplacement`, `exportCsv`.
     - Implement `previewLegacyImport` and `applyLegacyImport`.
     - Refactor state modifiers (`addPurchased`, `addHold`, etc.) to update and save the currently active event/day state.
   - Verify: Run `npx vitest run --root . tests/data-manager-event-day.test.ts` and ensure all tests pass.

### Phase 3: Connect to App.js and Verify
3. **Modify App.js**
   - File: `apps/webapp/js/app.js`
   - Changes:
     - On initialization, load the last opened event/day, falling back to `demo-v1/day1`.
   - Verify: Run `npm run verify` and `npm run test:e2e` to verify everything compiles, lint checks pass, and E2E tests are green.

## Risks & mitigations
- *Risk*: Data loss of existing users when upgrading.
- *Mitigation*: Ensure legacy migration functions do not execute automatically, and that the migration properly copies data without deleting it until explicitly confirmed.

## Rollback plan
- Keep git changes local and use git revert if any regression occurs.
- Do not modify existing UI code to prevent visual regressions.
