# Phase 6.1 Task 1 実装レポート

## 変更ファイル

- `apps/webapp/js/shared/ui/management-view-model.ts`
- `apps/webapp/js/features/local-data-deletion/use-cases/delete-local-data.ts`
- `apps/webapp/js/components/storage-delete-dialog.ts`
- `apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository.ts`
- `tests/delete-local-data.test.ts`
- `tests/local-data-deletion-controller.test.ts`
- `tests/management-view-model.test.ts`
- `tests/storage-deletion-service.test.ts`
- `tests/e2e/management.spec.ts`

## コミットSHA

実装コミット: `d27c790`

## 実行コマンドと結果

- `npx biome check ...` — 成功（対象9ファイル、エラーなし）
- `npm run test:webapp` — 成功（93ファイル、651テスト）
- `npx vitest run --root . tests/delete-local-data.test.ts tests/local-data-deletion-controller.test.ts tests/management-view-model.test.ts` — 成功（27テスト）
- `npx playwright test tests/e2e/management.spec.ts --grep "pending GAS同期付き全日程削除"` — 成功（1テスト）
- `npm run check:webapp` — 成功（architecture check、typecheck）
- `git diff --check` — 成功
- `npx playwright test tests/e2e/management.spec.ts --grep "全日程|削除"` — 既存Flow 7のスクリーンショット差分で失敗。新規pending削除Flowは成功。

## 受入条件の確認

- pending GAS queueがあっても削除optionを有効化: 確認済み。
- confirmationへ破棄件数を表示: 確認済み。
- cancel時にstate/outboxを保持: E2Eで確認済み。
- confirm時に対象scopeのqueueを削除: unit/E2Eで確認済み。
- GAS POSTを削除操作中に発生させない: E2Eで確認済み。
- 本番の`storage-delete-dialog`へwarningを接続: 確認済み。

## 懸念点

既存Flow 7の画像スナップショットが、導入したChromium 149と保存済みベースラインの描画差分で不一致になった。機能フローの失敗ではなく、スナップショットは更新していない。
