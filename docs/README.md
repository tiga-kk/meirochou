# ComiPath Local Development Documents

`docs/` contains the canonical implementation and review instructions for local development agents.

## Canonical documents

| Purpose | Canonical document |
|---|---|
| common operating rules | `AGENTS.md` |
| current next action and blockers | `docs/status/progress.md` |
| Phase order and scope | `docs/plans/roadmap.md` |
| Phase 5B/5C shared design | `docs/specs/2026-07-26-phase-05bc-real-map-routing-design.md` |
| Phase 5C ALNS amendment | `docs/specs/2026-07-27-phase-05c-time-decayed-alns-amendment.md` |
| Phase 5D apps design | `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md` |
| Webapp module/ownership rules | `docs/architecture/webapp-module-boundaries.md` |
| Webapp naming rules | `docs/architecture/webapp-naming-guidelines.md` |
| Phase 5B plan | `docs/plans/phase-05b/README.md` |
| Phase 5C plan | `docs/plans/phase-05c/README.md` |
| Phase 5D plan and Task table | `docs/plans/phase-05d/README.md` |
| Phase 5D current review/handoff | `docs/reviews/phase-5d-handoff.md` |
| completed historical records | `docs/archive/` |

## Reading order

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/status/progress.md`
4. `docs/plans/roadmap.md`
5. target Phase README
6. target Task document
7. the design, architecture, review, source and test files named by the Task

For Phase 5D correction work, read in this order:

1. `docs/reviews/phase-5d-handoff.md`
2. `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md`
3. `docs/architecture/webapp-module-boundaries.md`
4. `docs/architecture/webapp-naming-guidelines.md`
5. `docs/plans/phase-05d/README.md`
6. the exact correction Task

## Current implementation instruction

```text
AGENTS.mdを読んで、Phase 5D Task 9.1を実装して
```

Do not start Task 9.2, rerun Task 10, merge PR #7, or begin Phase 5E before Task 9.1 is committed and independently reviewed.

## Priority

1. exact selected Task
2. target Phase README
3. current handoff/review
4. approved design
5. architecture and naming rules
6. roadmap
7. progress
8. archive

If documents conflict, stop before production edits and repair the current canonical documents. Archive content is historical and does not fill gaps in current requirements.
