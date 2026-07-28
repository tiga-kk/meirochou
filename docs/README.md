# ComiPath Local Development Documents

`docs/`は実装・レビューエージェントが使うローカル専用文書である。

## 正本

| 目的 | 正本 |
|---|---|
| 共通作業規約 | `AGENTS.md` |
| 現在の着手可否 | `docs/status/progress.md` |
| Phase順序と範囲 | `docs/plans/roadmap.md` |
| Phase 5B/5C共有仕様 | `docs/specs/2026-07-26-phase-05bc-real-map-routing-design.md` |
| Phase 5C ALNS追補 | `docs/specs/2026-07-27-phase-05c-time-decayed-alns-amendment.md` |
| Phase 5D architecture design | `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md` |
| Webapp module依存規則 | `docs/architecture/webapp-module-boundaries.md` |
| Phase 5B計画 | `docs/plans/phase-05b/README.md` |
| Phase 5C計画 | `docs/plans/phase-05c/README.md` |
| Phase 5D計画 | `docs/plans/phase-05d/README.md` |
| 完了済み記録 | `docs/archive/` |

## 実装時の読む順序

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/status/progress.md`
4. `docs/plans/roadmap.md`
5. 対象Phaseの`README.md`
6. 対象Task文書
7. Taskが列挙する仕様・architecture・実装・test

Phase 5Dでは、対象Task文書の前に次も読む。

1. `docs/specs/2026-07-28-phase-05d-architecture-refactor-design.md`
2. `docs/architecture/webapp-module-boundaries.md`

## 指示例

```text
AGENTS.mdを読んで、Phase 5D Task 1を実装して
```

```text
AGENTS.mdを読んで、Phase 5D Task 1をレビューして
```

Task番号と正本fileは各PhaseのTask Tableで一意に解決する。

## 優先順位

1. 対象Task文書
2. 対象Phase README
3. 承認済み共有仕様・設計
4. 現行architecture文書
5. roadmap
6. progress
7. archive

矛盾を発見した場合は実装前に停止して報告する。
archiveは履歴であり、現行仕様の補完には使わない。
