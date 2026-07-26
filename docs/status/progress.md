# Current Progress

**更新日:** 2026-07-26
**現在の段階:** Phase 5B Task 4完了 (C108 event registry & runtime loading)
**コード実装:** Task 4実装・検証完了。C108 (day1/day2) がproduction event registryへ登録され、両日程で同じC108 map manifestを参照する。demo-v1はproduction選択肢から除外され、E2E fixture registryへ分離された。

## 統合済み

- Phase 4はPR #2で`main`へ統合済み。
- Phase 5AはPR #3で`main`へ統合済み。
- Phase 5A merge後に確認された`main` commitは`b731e8e0a14cb80d27551630f79d4a8cadff046c`。
- Cloudflare Pages production公開はPhase 5Aで完了済み。

作業開始時は現在の`main`、remote、working treeを再確認する。

## 承認状態

- Phase 5B/5C共有設計: 承認済み。
- Phase 5B正式実装計画: 承認済み。
- Phase 5C正式実装計画: 承認済み。
- 文書整理方針: 承認済み。
- Phase 5B Task 1 (文書整備・入力棚卸し): 完了。
- Phase 5B Task 2 (C108 bundle contract): 完了。
- Phase 5B Task 3 (C108 public assets & validation): 完了。4 area × 4 assets、manifest、SVG安全性、points/grid、到達可能性、production build、public boundaryを検証済み。
- Phase 5B Task 4 (C108 event registry & runtime loading): 完了。productionにC108 (day1/day2) のみを登録、demo-v1を除外、day共通manifest参照、C108 runtime adapter、E2E fixture分離を検証済み。focused 33件、webapp 396件、E2Eは25件成功・既存visual snapshot 6件差分。
- Phase 5B実装branch: `feature/phase-05b` 作成済み。

## 次の操作

1. Task 4のコミット承認・提示を行う。
2. Task 5の着手は別途ユーザー指示を受けてから行う。

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
