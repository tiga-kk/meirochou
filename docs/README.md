# 実装文書

この`docs/`は、現在の実装状態を基に次の実装を進めるための正本である。

Phase 5Dの責務整理は完了している。現在はPhase 6で、実際のデプロイ環境から得られたユーザー向け画面、経路案内、地図操作、一覧、GAS local-firstの改善を扱う。

古いPhase、archive、完了済み計画は履歴として参照してよいが、現在の要求を補完する正本ではない。

## 正本

| 目的 | 文書 |
|---|---|
| 現在の進捗と次に着手するタスク | `docs/status/progress.md` |
| Phase 6の目的、境界、タスク順序 | `docs/plans/phase-06/README.md` |
| Phase 6の確定設計 | `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md` |
| 各タスクの実装契約 | `docs/plans/phase-06/task-*.md` |
| Phase 5Dの完了記録 | `docs/plans/phase-05d/README.md` |

## 読む順序

1. `README.md`
2. `docs/README.md`
3. `docs/status/progress.md`
4. `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`
5. `docs/plans/phase-06/README.md`
6. 次に着手可能なTask文書
7. Task文書に列挙された既存実装とテスト

実装担当は一度に一Taskだけを扱う。各Taskの差分を関連テストで確認し、Taskごとに独立してレビュー可能なcommitへする。

## 共通原則

- Phase 6はPhase 5Dで整理したfeature境界を再構築するPhaseではない。
- 新しいFacade、Manager、Runtime、DI container、UI frameworkを追加しない。
- Route Guidanceの状態は既存Session/NavigationStateを正本にする。
- LocalStorageへcommit済みの購入結果をGAS配送失敗で取り消さない。
- 地図とお品書きを主要情報として扱い、補助情報の縦方向占有を抑える。
- 配置、transition、animation等はCSSを活用し、状態遷移や入力判定を無理にCSSへ移さない。
- mobile操作、44px以上の主要タッチ領域、keyboard focus、safe-area、200% text zoomを維持する。
- visual snapshotは意図を確認してから更新する。
