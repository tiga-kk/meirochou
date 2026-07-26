# Implementation Plan - Task 6: Preview source replacement with a pure diff

> Supplemental task record for [Phase 2 Task 6](../plans/phase-02-event-day.md#task-6-preview-source-replacement-with-a-pure-diff). The parent plan is authoritative for current status and phase boundaries.

## Goal
- Implement `diffCircleSources` to calculate pure diff between current circles and incoming new ones.
- Implement `applySourceDiff` to merge incoming circles to the state, updating timestamps and preserving user data.
- Ensure strict immutability by deep cloning and deep freezing outputs.
- Write unit tests under Vitest using TDD.

## Assumptions
- The unique key for matching circles is `space`.
- Order of outputs must be deterministic.
- Immutability check verify that input state and circles are never mutated.
- When applying, local user state (`purchased`, `hold`, `history`, `redo`, `gasOutbox`) must NOT be wiped.
- `isSale=x` (or custom flag matching purchased, e.g. case insensitive or specifically 'x'/'X') should trigger auto-purchase and add to `purchased` and `history` if not already present.
- If incoming circle does not have `isSale=x` (or is empty), we must NOT remove that space from `purchased` (local state overrides empty sales).
- Output state and diff objects must be recursively frozen to enforce immutability.

## Plan

1. **Step 1: Write failing source-diff tests**
   - Files: `tests/source-diff.test.ts`
   - Change: Create unit tests covering:
     - `diffCircleSources`:
       - Added circles (incoming only).
       - Updated circles (differing priority, account, tweet, memo).
       - Removed circles (current only, flagged with `removedFromSource: true` in state).
       - Unchanged circles (no diff).
       - Deterministic ordering of the resulting lists.
     - `applySourceDiff`:
       - Proper merging of circles.
       - Timestamps updates (sourceUpdatedAt and updatedAt update, createdAt remains).
       - Preservation of user local lists (`purchased`, `hold`, `history`, `redo`, `gasOutbox`).
       - `isSale=x` (and 'X') automatically adds to `purchased` and adds to `history` (with timestamp).
       - Empty `isSale` does not remove existing purchased items.
       - Verify immutability (deep freeze check).
   - Verify: Run `npx vitest run --root . tests/source-diff.test.ts` and ensure it fails (RED) due to missing module.

2. **Step 2: Implement diff and apply functions**
   - Files: `apps/webapp/js/data/source-diff.ts`
   - Change: Implement `diffCircleSources` and `applySourceDiff` in TypeScript. Implement helper functions for deep cloning and deep freezing.
   - Verify: Run `npx vitest run --root . tests/source-diff.test.ts` and ensure it passes (GREEN).

3. **Step 3: Run full typecheck and build validation**
   - Files: None (verification only)
   - Change: Verify types and code consistency.
   - Verify:
     - Run `npm run typecheck:webapp`
     - Run `npm run check:webapp`
     - Run `npm run test:webapp`

## Risks & mitigations
- **Risk:** Mutating incoming parameters accidentally.
  - **Mitigation:** Write rigorous tests that check `Object.isFrozen(result)` and verify original parameters are untouched. Use deep freeze helper on outputs.
- **Risk:** `isSale=x` detection differences.
  - **Mitigation:** Ensure case-insensitive check (e.g. `isSale?.toLowerCase() === 'x'`).

## Rollback plan
- In case of critical issues, discard new files `apps/webapp/js/data/source-diff.ts` and `tests/source-diff.test.ts` via `git checkout` or deleting them.
