# 実装文書

この`docs/`は、現在の実装状態を基にPhase 5Dのリファクタリングを完了するための正本である。

2026-08-07に削除された旧`docs/`は履歴として参照してよいが、現在の実装計画を補完する正本ではない。特に旧Phase 5D計画のタスク境界、変更可能ファイル、停止条件、固定SHAはそのまま再利用しない。

## 正本

| 目的 | 文書 |
|---|---|
| 現在の進捗と次に着手するタスク | `docs/status/progress.md` |
| Phase 5Dの目的、境界、タスク順序 | `docs/plans/phase-05d/README.md` |
| 各タスクの実装契約 | `docs/plans/phase-05d/task-*.md` |

## 読む順序

1. `README.md`
2. `docs/README.md`
3. `docs/status/progress.md`
4. `docs/plans/phase-05d/README.md`
5. 次に着手可能なタスク文書
6. タスク文書に列挙された既存実装とテスト

実装担当は、一度に一タスクだけを扱う。各タスクの差分を関連テストで確認し、コミット後に`docs/status/progress.md`だけを実態に合わせて更新する。

## 共通原則

- Phase 5Dは機能追加ではなく、既存の外部挙動を維持した内部リファクタリングである。
- 既存のfeatureモジュールを本番経路へ接続し切ることを優先し、同じ責務の新しいFacade、Manager、Runtimeを追加しない。
- ファイルを小さくすること自体を目的にしない。一つのファイルまたはクラスが複数featureの状態や処理順序を所有している場合に分割する。
- `apps/webapp/js/app/assemble-comipath-application.ts`は明示的なcomposition rootである。依存関係が読みやすい限り、行数だけを理由にfactoryへ分散させない。
- 永続化schema、GAS/CSV契約、経路探索・ALNSの計算結果、UIの見た目はPhase 5Dで変更しない。
- テストを通すためだけの互換Facadeや旧ファイル名の別名再作成をしない。テストは新しい責務境界を直接検証する形へ更新する。
