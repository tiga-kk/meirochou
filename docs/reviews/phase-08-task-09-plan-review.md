# Phase 8 Task 9 adversarial plan review

Date: 2026-08-21

## Review target

- Canonical repository: `tiga-kk/meirochou`
- Planning branch: `docs/phase-08-task-09-space-metadata-contract-closure-plan`
- Base: `main` at planning time (`75adaebd9b571d24aaee09d443dec17513baf10d`)
- Cross-repository implementation target: `tiga-kk/meirochou_wrapper`
- Wrapper implementation branch: `feature/phase-08-task-09-space-metadata-contract-closure`
- Design: `docs/specs/2026-08-21-phase-08-task-09-space-metadata-contract-closure-design.md`
- Plan: `docs/plans/phase-08/task-09-space-metadata-contract-closure.md`

## Verdict

**ACCEPTABLE FOR IMPLEMENTATION.**

The plan is intentionally narrow. It closes the Phase 8 contract defect without generalizing runtime area matching, changing production event data, introducing a schema framework, or reopening routing/UI work.

Implementation must still end at `implementation complete / browser review pending`; this review approves the plan, not the future implementation.

## Root finding confirmed

The Phase 8 strict event-map contract currently accepts metadata more broadly than runtime space interpretation.

Relevant current runtime behavior:

```text
space-parser.ts
- NFKC-normalizes input space strings
- normal prefix grammar is one leading character
- label grammar is one ASCII letter / hiragana / katakana character

in-memory-map-area-catalog.ts
browser-application.ts
- derive area lookup key from cleanedSpace[0] and cleanedSpace[1]
```

Therefore a strict manifest may currently pass validation while declaring metadata such as a multi-character prefix or a numeric label that the runtime cannot use as intended.

## Additional adversarial finding incorporated into the design

The initial full-Phase review identified width/label grammar mismatch. During Task 9 plan review, a second defect with the same ownership boundary was confirmed:

```text
area-a prefixes=["東"], labels=["A", "B"]
area-b prefixes=["東"], labels=["B", "C"]
```

Both areas claim `東B...`. Current runtime lookup returns the first matching area, making manifest order an accidental routing contract.

The reviewed plan therefore also requires every `(prefix, label)` combination to be owned by at most one strict area.

This is not unrelated scope expansion. It is the same space-metadata boundary and can be fixed by one small manifest/build-time validation with no runtime behavior rewrite.

## Why runtime generalization was rejected

The review considered a broader alternative: change runtime parsing and lookup to support variable-length prefixes and wider label grammars.

Rejected for this Task because:

- current production C108 does not need it;
- `BrowserApplication`, `MapAreaCatalog`, canonicalization, route start/resume, nearby and gallery flows would all need broader regression analysis;
- Phase 8's objective is data-only event addition, not a new space-address language;
- accepting arbitrary metadata and making runtime more complex would increase rather than close the contract surface.

The selected design validates data against the behavior that already exists.

## Cross-language parity review

A naive Python check of `len(prefix) == 1` would not match JavaScript `string.length === 1` for astral Unicode characters such as emoji.

The plan explicitly requires wrapper parity via UTF-16 LE encoded byte length:

```text
2 bytes -> one JavaScript UTF-16 code unit
4 bytes -> surrogate pair, reject for current runtime lookup
```

The plan also requires NFKC-stable metadata in both implementations so manifest metadata does not compare differently from NFKC-normalized runtime input.

Labels mirror the existing TypeScript grammar exactly:

```text
[A-Za-z\u3041-\u3096\u30A1-\u30FA]
```

No new Unicode normalization/schema subsystem is introduced.

## TDD / commit review corrections applied

The first plan draft was not accepted unchanged. Three execution weaknesses were corrected before this review was recorded.

### 1. Wrapper ownership proof now covers publication safety

A config-parser-only negative test was insufficient evidence for the stated guarantee that `build-event` rejects invalid data before publication.

The final plan requires the test to call `build_event_bundle()` and assert both:

```text
final output directory does not exist
no sibling .tmp-* staging directory remains
```

### 2. Failing RED tests are not committed

The first draft allowed a possible standalone failing test commit. That conflicted with the project preference that meaningful intermediate commits remain green.

The final plan keeps RED tests in the worktree, implements the minimal fix, verifies GREEN, then commits.

### 3. Wrapper fixture mutation is explicit

The first draft described changing the copied second-area map config without fully fixing the helper body.

The final plan provides the exact `_add_second_area(...)` signature and body, including copied map TOML `allowed_symbols` mutation and explicit second-area prefixes.

## Scope review

Expected implementation diff in `meirochou` is limited to:

```text
apps/webapp/js/shared/domain/space-parser.ts
apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts
tests/space-parser.test.ts
tests/boundary-parsers.test.ts
guides/event-addition.md
docs/status/progress.md
```

Expected implementation diff in `meirochou_wrapper` is limited to:

```text
python/pathdata/comiket_pathdata/event_build.py
python/pathdata/tests/test_event_build.py
python/pathdata/README.md
```

Explicit protected scope includes:

```text
meirochou:
apps/webapp/js/app/browser-application.ts
apps/webapp/js/features/route-guidance/**
apps/webapp/events/**
apps/webapp/map-bundles/**
tests/fixtures/phase-08-data-only-event/**
package*.json
vite.config.ts
.github/workflows/**
integrations/**
functions/**

meirochou_wrapper:
python/ocr/**
python/pathdata/comiket_pathdata/svg_render.py
python/pathdata/comiket_pathdata/web_export.py
python/pathdata/comiket_pathdata/grid.py
python/pathdata/tests/test_svg_render.py
.github/workflows/**
```

No reason was found to expand beyond this list.

## Test adequacy review

The plan has independent evidence for:

```text
TypeScript grammar owner predicates
strict parser negative character cases
strict parser ambiguous ownership rejection
same-prefix/disjoint-label positive case
same-label/disjoint-prefix positive case
existing C108 valid manifest
existing C999 data-only proof
wrapper prefix parity
wrapper label parity
wrapper ambiguous ownership publication failure
wrapper positive disjoint ownership
wrapper deterministic/review/atomic existing tests
full meirochou verify/E2E/public-tree/architecture
full wrapper unittest/Ruff/Pyright
protected-path and C108 source-data diff gates
```

No new browser E2E was added because Task 9 intentionally changes boundary acceptance, not browser interaction behavior. Existing full E2E is the correct regression gate.

## Overengineering review

The plan does **not** add:

```text
JSON Schema
schema generation
shared cross-language package
runtime prefix trie
longest-prefix matching
new MapArea service/controller/store
new event installer/deployer
backend registry
migration framework
new schemaVersion
new event data
```

The only new production abstraction in `meirochou` is two tiny grammar predicates in the existing parser owner. The wrapper gets small validation helpers in its existing event-build module.

This is proportional to the defect.

## Placeholder / ambiguity review

No `TBD`, `TODO`, future placeholder, unspecified production file, or unspecified verification gate remains in the final plan.

The plan fixes:

- exact files;
- exact function names/signatures;
- positive and negative test matrices;
- exact ownership semantics;
- cross-language Unicode-width behavior;
- exact protected paths;
- exact full verification commands;
- commit/push boundaries;
- final handoff state.

## Closure semantics

Task 9 is a Phase 8 repair task discovered by the Phase-wide browser review.

Correct lifecycle:

```text
Task 9 plan accepted
  -> Codex implementation in both repos
  -> full verification
  -> push both branches
  -> browser reviews actual remote diff/evidence
  -> if ACCEPTED, separate docs-only Phase 8 closure commit
```

Codex must not mark Phase 8 CLOSED and must not merge either repository's main branch.
