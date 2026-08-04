# Current Progress

**Updated:** 2026-08-05
**Current stage:** Phase 5D correction planning complete. Task 9.1 is NEXT. Phase 5E is blocked.

## Canonical documents

- Phase 5C plan: `docs/plans/phase-05c/README.md`
- Phase 5C handoff: `docs/reviews/phase-05c-handoff.md`
- Phase 5D design: `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md`
- Phase 5D module boundaries: `docs/architecture/webapp-module-boundaries.md`
- Phase 5D naming rules: `docs/architecture/webapp-naming-guidelines.md`
- Phase 5D plan: `docs/plans/phase-05d/README.md`
- Phase 5D current handoff: `docs/reviews/phase-5d-handoff.md`

## Phase 5D branch state

Reviewed branch tip before this docs correction:

```text
e22eadca73e9b3ece0dc5ae4d5d0fda4b0946066
```

Verified evidence:

- GitHub Actions run 76: PASS
- normal tests: 487/487 PASS across 69 files
- Route Guidance focused tests: 8/8 PASS
- Phase 5D regression tests: 4/4 PASS
- architecture check: PASS, 134 source files
- typecheck/build/build verification: PASS
- normal Playwright run: 38 passed / 8 expected C108 skips
- Cloudflare Pages preview: deployed

## Phase 5D review result

Task 10 correctly recorded a BLOCKED handoff. The external review found that Task 9 removed legacy names but left equivalent responsibilities in:

- `comipath-browser-runtime.js`
- `event-day-data-store.ts`
- `comipath-dom-coordinator.js`
- `application-contract-types.ts`
- `application-boundary-parsers.ts`

Several feature controllers/use cases exist but are not yet the production owners created by the composition root. Passing CI proves behavior stability, not completion of the architecture goal.

## Correction Tasks

1. **Task 9.1 — NEXT:** connect Event Day and Circle Data Source to production.
2. Task 9.2: connect Route Guidance and Local Data Deletion.
3. Task 9.3: replace the cross-feature DOM coordinator and add explicit event binding.
4. Task 9.4: distribute contracts/parsers, delete renamed facades, finalize assembly and semantic checks.
5. Task 10 rerun: clean verification, C108/human smoke, final handoff.

Tasks 9.1–9.4 are sequential and require separate commits and reviews.

## Final Phase 5D targets

- all original legacy paths absent;
- all renamed semantic facade paths absent;
- every canonical feature controller production-connected through assembly;
- `ComiPathApplication` lifecycle only and at most 200 lines;
- explicit `bind-browser-events.ts` with cleanup;
- one mutable owner per feature state;
- no central type/parser god file;
- no architecture allowlist, deep import, concrete public export, vague name, or semantic facade;
- characterization through real assembly with repository/Session/View effects;
- unchanged storage/GAS/CSV/route/map/optimizer behavior;
- clean verify, E2E, C108 smoke, public audit, Biome and human smoke PASS;
- final Phase 5D handoff says PASS.

## Future phases

- Phase 5E: tests and docs structure refactor, only after Phase 5D PASS.
- Phase 5F: broad visual polish, after Phase 5E.

## Approval status

- Phase 5B: complete
- Phase 5C: complete
- Phase 5D design: approved and corrected
- Phase 5D initial implementation: CI-green but architecture exit gate BLOCKED
- Phase 5D correction plan: complete
- Phase 5D next implementation: Task 9.1
- Phase 5E: not started
- Phase 5F: not started

## Continuing prohibitions

- Do not add `/maps/`, original maps, OCR input, Python generators, or intermediate images to Git.
- Do not copy real maps into general unit/E2E fixtures.
- Do not expose raw CSV, GAS URL, sheet content, external post body, credential, or local absolute path.
- Do not change LocalStorage schema, GAS/CSV contracts, ALNS objective/timing, Dijkstra weights, map assets, or visual design in Phase 5D corrections.
- Do not merge PR #7 or start Phase 5E until final Task 10 says PASS.
