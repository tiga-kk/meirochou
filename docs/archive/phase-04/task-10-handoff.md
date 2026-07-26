# Phase 4 Task 10: Accessibility, Public Documentation, and Final Handoff

> **Depends on:** Tasks 1–9. **Scope:** Accessibility corrections, documentation-contract tests, audits, final verification, and presentation of integration options. No automatic push/PR/merge.

## Goal

Close the management UI phase with evidence that mobile, keyboard, screen-reader, safety, public-boundary, and documentation requirements are all satisfied.

## Files

- Modify: `tests/event-day-selector.test.ts`
- Modify: `tests/settings-component.test.ts`
- Modify: `tests/source-manager.test.ts`
- Modify: `tests/source-diff-dialog.test.ts`
- Modify: `tests/outbox-panel.test.ts`
- Modify: `tests/storage-delete-dialog.test.ts`
- Modify: `tests/e2e/management.spec.ts`
- Modify only to satisfy a failing accessibility/layout assertion:
  `apps/webapp/js/components/event-day-selector.ts`,
  `apps/webapp/js/components/comipath-settings.ts`,
  `apps/webapp/js/components/source-manager.ts`,
  `apps/webapp/js/components/source-diff-dialog.ts`,
  `apps/webapp/js/components/outbox-panel.ts`,
  `apps/webapp/js/components/storage-delete-dialog.ts`,
  `apps/webapp/css/forms.css`, `apps/webapp/css/modals.css`, and
  `apps/webapp/css/sheets.css`
- Modify: `README.md`
- Create: `guides/user-data-management.md`
- Modify: `guides/data-contracts.md`
- Modify: `guides/gas-sync.md`
- Create: `integrations/gas-spreadsheet/README.md`
- Modify: `tests/webapp-contracts.test.mjs`
- Update after approved commit: local-only `docs/status/progress.md`, `docs/plans/roadmap.md`, and `docs/README.md`

`/docs/` is ignored local planning material and cannot be the public
documentation deliverable. Public documentation and its contract tests use
the tracked `guides/` paths above. Local architecture/plan/progress documents
are updated separately after the approved implementation commit.

## Accessibility verification

- [ ] Every input/button/select/dialog has a unique accessible name.
- [ ] Settings open focuses its heading/first meaningful control; close returns focus to the gear button.
- [ ] Dialog focus traps and returns correctly for apply, cancel, Escape, stale error, and service failure.
- [ ] Busy and pending states are conveyed by text/ARIA, not color alone.
- [ ] Errors/status updates use appropriate `role=alert` or `aria-live` without repeated announcements.
- [ ] Touch targets are at least 44×44 CSS px.
- [ ] Pixel 5 portrait has no unintended horizontal overflow; fixed/bottom areas include safe-area inset.
- [ ] 200% text zoom retains labels/actions without clipping critical controls.
- [ ] Keyboard-only order follows selector → source → recovery → deletion and never enters inert background.
- [ ] Component DOM, alert, toast, console output, trace, and snapshots do not
  contain a full GAS deployment path/query, CSV body, sheet contents, request
  body, raw response, stack, memo, or tweet. The editable GAS URL input is the
  only DOM exception.

Add automated happy-dom/Playwright assertions for everything observable. Record any manual browser checks and exact viewport/zoom.

## Documentation content

`guides/user-data-management.md` must explain, with current Japanese UI labels:

1. event/day selection and map switch failure behavior;
2. first CSV import and later CSV replacement;
3. GAS deployment, sheet lookup, initial import, replacement, and explicit refresh;
4. local-first purchase/cancel and pending count;
5. retry versus discard consequences;
6. all four deletion scopes and pending locks;
7. CSV export content and filename;
8. single-device/LocalStorage limits, no multi-device merge, no JSON backup;
9. safe recovery for storage, network, stale preview, and invalid source errors.
10. CSV values are preserved losslessly; externally sourced fields beginning
    with spreadsheet formula characters must be treated as untrusted when the
    downloaded file is opened outside ComiPath.

README should provide a concise support matrix and link to the detailed docs. Do not promise PWA/Service Worker/offline asset availability unless separately implemented and tested.

## Verification and test-first steps

- [x] **Step 1: Run the accessibility tests and record gaps**

Run focused component suites and `management.spec.ts`. Add failing assertions for each reproducible gap before changing component/CSS code.

- [x] **Step 2: Make minimal accessibility/layout corrections**

Do not redesign the navigation surface or update original snapshots. Re-run the focused failing test after each correction.

- [x] **Step 3: Add failing documentation contract assertions**

Assert README and tracked guides contain current UI labels, pending/discard
warning, four deletion scopes, CSV/GAS workflows, formula-like CSV warning,
and single-device limitation; assert absence of Service Worker guarantees and
deployed URL patterns. Do not read ignored local `docs/` as public evidence.

- [x] **Step 4: Write/update documents from actual UI and service interfaces**

Walk each documented workflow in Playwright or the local app. If a label/API
differs from the plan, fix implementation or documentation explicitly rather
than using vague synonyms that a user cannot find. Add a fixture containing a
fictional deployment ID, query token, CSV body, raw server body, stack,
memo, and tweet; assert none appears in rendered text, non-input attributes,
console messages, screenshots, or traces.

- [x] **Step 5: Run final fresh verification**

```bash
npm ci
npm run verify
npx biome check
npm run test:e2e
node scripts/audit-public-tree.mjs
git diff --exit-code -- tests/e2e/webapp.spec.ts-snapshots
git diff --check
git status --short --branch
git remote -v
git ls-files
```

Run the credential grep from `docs/plans/roadmap.md`. Expected: every command
passes, original snapshot directory has zero diff, excluded/private content is
absent, and `git remote -v` still reports only the previously approved
`origin` (`git@github.com:tiga-kk/meirochou.git`). This Task must not add,
change, remove, fetch from, or push to a remote.

- [x] **Step 6: Cross-plan self-review**

Map every Phase 4 definition-of-done bullet to a test, screenshot, manual
check, or tracked guide section. Search for placeholders, obsolete Task
status, old multi-sheet UI, `wantToBuy` GAS response claims, full endpoint
rendering, ignored `/docs/` used as public evidence, and undefined event/type
names.

- [x] **Step 7: Present commit candidate**

Proposed message: `docs(ui): document data management workflows`.

Show staged files/diff, all command results, new snapshot list, original snapshot zero-diff proof, known limitations, and commit message. Wait for explicit approval.

- [x] **Step 8: Present integration options without performing them**

After approved commit and clean status, present branch/merge/remote options. Do not create a remote, push, open a PR, or merge until the user separately approves the exact action after seeing the complete branch diff/history.

## Review checklist

- Automated and manual accessibility evidence is concrete.
- Documentation labels match rendered UI.
- Public docs are tracked under `guides/`; ignored local plans are not counted
  as publication evidence.
- Original navigation screenshots remain unchanged.
- Public/credential audits pass after all docs and snapshots are included.
- The known origin is unchanged and no remote action occurred.
- Final handoff preserves repository approval boundaries.

## Completion record

- Review corrections and public documentation committed as `1f5a413`.
- `npm run verify` passed with 360 Webapp tests and 27 GAS tests; full `npm run test:e2e` passed with 31 mobile Chromium tests; public-tree and credential audits passed; original navigation snapshots remained unchanged.
- Manual real-device and 200% zoom checks remain outside the automated evidence; no remote operation was performed.
