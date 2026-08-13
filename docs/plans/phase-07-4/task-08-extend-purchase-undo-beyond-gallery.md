# Phase 7.4 タスク8: 一覧以外の購入経路へ最新1件Undoを拡張

## 目的

Galleryで成立している購入後の最新1件Undoを、通常の現在目的地画面の「購入済」操作にも適用し、誤操作からstatus / route / GAS outboxを一貫して戻せるようにする。

## 対象外

- 保留のUndo。
- 複数段Undo履歴。
- browser reload後のUndo永続化。
- GAS配送済みデータを外部Spreadsheetから自動削除する新しいprotocol。

## 前提と依存関係

Task 3と独立して実装可能。ただし最終回帰はTask 3後に行う。

## 読むべき文書と既存実装

- `docs/plans/phase-07-3/task-07-add-gallery-purchase-exit-and-undo.md`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/app/complete-circle-visit.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- Circle Status undo use case / controller
- Route Guidance session snapshot
- Gallery Undo focused tests

## 対象ファイル

### 変更

- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- 必要なら`apps/webapp/index.html`
- snackbarの適切な既存CSS
- `tests/purchase-flow.test.ts`
- `tests/e2e/webapp.spec.ts`
- Gallery Undo test

### 作成候補

Gallery専用snackbarを通常画面から直接呼ぶ必要が生じる場合のみ、共有表示として小さな`purchase-undo-snackbar` componentまたはviewを作る。Undo domain/use-caseを二重化しない。

### 削除

なし。

## 実装手順

1. 通常の現在目的地画面で購入後にUndo導線が出ないRED E2Eを追加する。
2. Gallery購入前に保存している`CircleStatusUndoToken`とRoute Guidance Session snapshotの取得責務を確認し、sourceに依存しない`latestPurchaseUndo`状態へ一般化する。
3. Galleryと通常購入の両方で、status mutation成功後かつroute advanceとの整合が取れる境界でundo情報を保存する。
4. Undo実行時は既存Circle Status undoを使い、逆向きGAS outbox生成/復元契約を維持する。
5. 購入前Route Guidance snapshotを戻し、current destination / route / pin / countを再描画する。
6. 新しい購入が成功したら前のUndoを置き換える。期限切れ後はUndoできない。
7. Galleryの退出animationと通常画面の表示差はUIだけに留め、undo domain処理を分岐コピーしない。
8. 保留操作ではUndo snackbarを出さない。

## テスト方針

- 通常購入 → snackbar表示 → Undoでstatusがpendingへ戻る。
- route target / route snapshotが購入前へ戻る。
- GAS outboxが購入前契約へ戻る。
- 二回購入すると最新1件だけUndo可能。
- timeout後はUndo不可。
- holdではUndo生成なし。
- Galleryの既存Undoが回帰しない。

## 検証コマンド

```bash
npx vitest run --root . tests/purchase-flow.test.ts tests/complete-circle-visit.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "購入|Undo|取り消"
npm run test:webapp
npm run check:webapp
git diff --check
```

## 受入条件

- Gallery以外の通常購入でも最新1件Undoが可能。
- status / route / outbox /表示が一貫して戻る。
- Gallery Undoを壊さない。
- 複数段履歴や新storage schemaを追加していない。

## 予定コミットメッセージ

```text
feat(phase-07-4): extend purchase undo beyond gallery
```
