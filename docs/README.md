# ComiPath Local Development Documents

`docs/`は実装・レビューエージェントが使うローカル専用文書である。

## Canonical documents

| Purpose | Canonical document |
|---|---|
| 共通作業規約 | `AGENTS.md` |
| 現在の着手可否 | `docs/status/progress.md` |
| Phase順序と範囲 | `docs/plans/roadmap.md` |
| Phase 5B/5C共有仕様 | `docs/specs/2026-07-26-phase-05bc-real-map-routing-design.md` |
| Phase 5C ALNS追補 | `docs/specs/2026-07-27-phase-05c-time-decayed-alns-amendment.md` |
| Phase 5D apps内部設計 | `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md` |
| Webapp module依存規則 | `docs/architecture/webapp-module-boundaries.md` |
| Webapp命名規則 | `docs/architecture/webapp-naming-guidelines.md` |
| Phase 5B計画 | `docs/plans/phase-05b/README.md` |
| Phase 5C計画 | `docs/plans/phase-05c/README.md` |
| Phase 5D計画 | `docs/plans/phase-05d/README.md` |
| 完了済み記録 | `docs/archive/` |

## Reading order

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/status/progress.md`
4. `docs/plans/roadmap.md`
5. 対象Phaseの`README.md`
6. 対象Task文書
7. Taskが列挙する設計、architecture、source、test

Phase 5DではTask文書の前に次を読む。

1. `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md`
2. `docs/architecture/webapp-module-boundaries.md`
3. `docs/architecture/webapp-naming-guidelines.md`

## Instruction examples

```text
AGENTS.mdを読んで、Phase 5D Task 1を実装して
```

```text
AGENTS.mdを読んで、Phase 5D Task 1をレビューして
```

Task番号と正本fileはPhase READMEのTask Tableで一意に解決する。

## Priority

1. 対象Task文書
2. 対象Phase README
3. 承認済み設計
4. architecture・命名規則
5. roadmap
6. progress
7. archive

矛盾を発見した場合は実装前に停止して報告する。archiveは履歴であり、現行仕様の補完には使わない。
