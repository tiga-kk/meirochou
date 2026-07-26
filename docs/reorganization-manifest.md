# Documentation Reorganization Manifest

## 目的

現在の`docs/`には、完了済みPhaseの正本、補足計画、レビュー記録、現行計画が混在している。
今後は、エージェントへPhaseとTaskを指定するだけで、読むべき文書を一意に解決できる構成へ整理する。

## 採用する方式

1. `AGENTS.md`は安定した共通プロトコルだけを持つ。
2. `docs/status/progress.md`は現在の状態だけを持つ。
3. `docs/plans/roadmap.md`はPhase境界だけを持つ。
4. 各Phaseは専用ディレクトリとTask表を持つ。
5. 各Taskは1ファイルに分ける。
6. 完了済みPhaseは内容を直さずarchiveへ移す。
7. 共有設計は`docs/specs/`に置く。
8. 現在も有効な横断契約だけを`docs/architecture/`に残す。

## 完成後の構成

```text
AGENTS.md
docs/
├── README.md
├── reorganization-manifest.md
├── status/
│   └── progress.md
├── specs/
│   └── 2026-07-26-phase-05bc-real-map-routing-design.md
├── architecture/
│   ├── data-contracts.md
│   └── ui-ux-direction.md
├── plans/
│   ├── roadmap.md
│   ├── phase-05b/
│   │   ├── README.md
│   │   └── task-01-...md
│   └── phase-05c/
│       ├── README.md
│       └── task-01-...md
├── reviews/
└── archive/
    ├── README.md
    ├── phase-01/
    ├── phase-02/
    ├── phase-03/
    ├── phase-04/
    └── phase-05a/
```

## 既存文書の扱い

### archiveへ移す

完了済みPhase 1、2、3、4、5Aに固有の次の文書を移す。

- Phase概要計画
- Task別計画
- Task補足
- 実装後レビュー
- handoff記録
- 完了済み設計
- 完了済みdeployment計画

移動時に本文は変更しない。

### 現在位置に残す

現在も横断的に有効な次の文書は、内容を確認したうえで`docs/architecture/`に残す。

- event/dayとLocalStorageの安全境界
- GAS outboxのlocal-first境界
- current mobile UI方向
- public/private asset境界

Phase固有の古い状態説明が混ざっている場合は、元文書をarchiveへ移し、
将来のTaskで新しい横断契約を別ファイルとして作る。過去文書自体は直さない。

## Task文書の標準形

Phase 5B以降のTask文書には必ず次を含める。

1. Task IDと名前
2. Status
3. Depends on
4. Goal
5. User-visible result
6. Scope
7. Non-scope
8. Required reads
9. Required human inputs
10. Files allowed to change
11. Files forbidden to change
12. Existing interfaces to preserve
13. New interfaces
14. State transitionsまたはdata flow
15. Error and cancellation behavior
16. TDD steps
17. RED確認コマンド
18. GREEN確認コマンド
19. Common verification
20. Manual verification
21. Acceptance criteria
22. Review checklist
23. Stop conditions
24. Proposed commit message
25. Completion record

曖昧な「必要に応じて変更」「適切にテストする」は使わない。
変更可能ファイルと期待結果を具体的に書く。

## 適用順

1. 新しい`AGENTS.md`、`docs/README.md`、status、roadmap、archive policyを配置する。
2. 既存完了文書をPhase別archiveへ内容変更なしで移す。
3. 共有設計書を配置する。
4. ユーザーが共有設計書を確認する。
5. Phase 5B計画とTask文書を作る。
6. Phase 5C計画とTask文書を作る。
7. 全リンク、重複Task番号、未解決placeholderを検査する。

## 実施記録 (Phase 5B Task 1)

- `docs/plans/phase-01-baseline.md` -> `docs/archive/phase-01/phase-01-baseline.md`
- `docs/plans/phase-02-*` -> `docs/archive/phase-02/`
- `docs/plans/phase-03-*`, `docs/plans/phase-03/` -> `docs/archive/phase-03/`
- `docs/gas-sync-contract.md`, `docs/data-contracts.md` -> `docs/archive/phase-03/`
- `docs/plans/phase-04-*`, `docs/plans/phase-04/` -> `docs/archive/phase-04/`
- `docs/reviews/2026-07-22-phase-02-review.md` -> `docs/archive/phase-02/`
- `docs/reviews/2026-07-23-phase-04-task-04-10-plan-review.md` -> `docs/archive/phase-04/`
- `docs/superpowers/plans/*` -> `docs/archive/superpowers/plans/`
- `docs/workflows/*` -> `docs/archive/workflows/`
- 横断アーキテクチャ契約を `docs/architecture/` に維持。
