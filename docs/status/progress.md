# Current Progress

**更新日:** 2026-07-26
**現在の段階:** Phase 5C Task 4完了（Arbitrary Start and Per-map Session）
**コード実装:** Phase 5C Task 4のpure foundationとして、`snapStartToWalkableCell`（SVG座標→walkableセルスナップ、有限値・grid buffer長・閾値・blocked cell・tie-breaking検証）と `MapSession` / `createMapSession` / `switchMapArea` / `updateSessionCache`（エリアごとの独立セッション、切り替え時navigation clear、同エリア復帰時のmatrix/best order引き継ぎ）を実装・レビュー修正した。map UIのclient座標変換、始点設定mode/cancel、preview/marker、keyboard control、App/Worker wiringはTask 7/9へ繰り越す。
**検証:** focused test 12件、webapp test 39ファイル408件、型チェック・build・build検証・Biome・`git diff --check`はPASS。E2Eはsandbox外で25 PASS・8 skipped・6 failed（既存mobile visual snapshot差分）。

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
- Phase 5C Task 3: **実装・レビュー修正・検証完了・コミット済み**。
- Phase 5C Task 4: **実装・レビュー修正・検証完了・コミット済み**（`3c8bc3b`）。

## 次の操作

1. Phase 5C Task 5 (Distance Matrix Worker) の実装に着手する。

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
