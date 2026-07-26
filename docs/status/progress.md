# Current Progress

**更新日:** 2026-07-26
**現在の段階:** Phase 5C Task 1完了 (Storage Schema Migration and Exclusive Circle Visit State)
**コード実装:** Phase 5C Task 1の実装・レビュー修正が完了。LocalStorageスキーマを`schemaVersion: 2`へ昇格し、訪問状態を排他的な`circleStates` (`pending` | `held` | `purchased` | `excluded`)に一元化。legacy `purchased`/`hold`配列はrepository load時にparse成功後だけv2へ移行保存し、保存失敗時は旧値を保持する。`PurchaseMutationService`, `DataManager`, `SourceSettingsService`, `StorageDeletionService`へ適用し、`excluded`を通常候補から除外。永続Undo/RedoのUI正本も撤去した。単体テスト（39ファイル408ケース全てPASS）、`check:webapp`、`build:webapp`、`verify:webapp:build`、`biome check`、`git diff --check`をパス済み。schema v2へ追随したGAS同期・管理E2Eの関連12ケースも通過したが、既存visual snapshot 6件は更新していない。

## 統合済み

- Phase 4はPR #2で`main`へ統合済み。
- Phase 5AはPR #3で`main`へ統合済み。
- Phase 5A merge後に確認された`main` commitは`b731e8e0a14cb80d27551630f79d4a8cadff046c`。
- Cloudflare Pages production公開はPhase 5Aで完了済み。

作業開始時は現在の`main`、remote、working treeを再確認する。

## 承認状態

- Phase 5B/5C共有設計: 承認済み。
- Phase 5B正式実装計画: 承認済み（全Tasks 1-6完了）。
- Phase 5C正式実装計画: 承認済み。
- Phase 5C Task 1: **実装・検証完了**。

## 次の操作

1. Task 1の変更をコミットする。
2. Phase 5C Task 2 (UI Navigation State and Visited State Management) の実装に着手する。

## 人手入力

Phase 5B Task 1開始前:

- Git管理外の`/maps/C108/`へ4地図の完成済みSVG、points、grid metadata、grid binaryを配置する。
- 元地図、OCR入力、Python地図生成コード、中間画像をWebリポジトリへ入れない。

Phase 5C Task 6開始前:

- Python版TOPTW参照実装をGit管理外の場所へ配置する。
- Pythonコード自体をWebリポジトリへ追加しない。

## GitHub上の計画文書

正式計画文書は`docs/phase-5bc-implementation-plan` branchへ配置する。
この文書配置commitにはコード実装を含めない。
