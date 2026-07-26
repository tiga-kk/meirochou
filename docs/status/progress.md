# Current Progress

**更新日:** 2026-07-26
**現在の段階:** Phase 5C Task 2完了 (Navigation State Machine)
**コード実装:** Phase 5C Task 2の実装が完了。永続的なサークル訪問状態（`circleStates`）とは独立したナビゲーション状態 (`NavigationState`, `NavigationStage`, `ConfirmedPosition`, `LockedLeg`, `RouteEndpointId`) およびピュアな `NavigationStateMachine` を実装。到着確認 (`arrive`) まで現在位置が目的地へ移らない不変条件、最適化結果 (`applyOptimizerResult`) 適用時に現在案内中の区間（`targetSpace` および `lockedFirstLeg`）を変更しない制御、および `resetStart` が永続サークル状態を破壊しない分離をテスト・検証済み。全ユニットテスト、型チェック、Biomeチェックを通過。

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
- Phase 5C Task 2: **実装・検証完了**。

## 次の操作

1. Task 2のコミットについてユーザー承認を得てコミットする。
2. Phase 5C Task 3 (Circle List and Detail UI) の実装に着手する。

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
