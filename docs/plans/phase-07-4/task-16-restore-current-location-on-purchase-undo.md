# Phase 7.4 タスク16: 購入Undoで現在地入力も復元

## 目的

購入Undo後にRoute Guidance snapshotだけが戻り現在地フォームが空欄になる不整合を解消し、Undo直後から次の案内操作を継続できるようにする。

## 対象外

- 複数段Undo。
- reload後のUndo永続化。
- 現在地履歴の新しいstorage schema。
- GPS等による現在地推定。

## 前提と依存関係

Task 8の最新1件Undo契約を維持した追加修正。Task 10〜15と独立して実装可能。

## 読むべき文書と既存実装

- `docs/plans/phase-07-4/task-08-extend-purchase-undo-beyond-gallery.md`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-current-location-form-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `tests/purchase-flow.test.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 変更

- `apps/webapp/js/app/browser-application.ts`
- 必要なら`apps/webapp/js/features/route-guidance/ui/dom-current-location-form-view.ts`
- `tests/purchase-flow.test.ts`
- `tests/e2e/webapp.spec.ts`

### 削除

なし。

## 実装手順

1. 購入直前の`readCurrentSpace()`結果を、`LatestPurchaseUndo`の一部としてstatus token / route snapshotと同時に保持する。
2. 購入処理が成功しUndo tokenを保存するときだけ現在地も保存する。hold等へ広げない。
3. `undoLastPurchase()`成功後、route snapshotを戻したうえで購入直前spaceを既存`ui.updateCurrentLocation()`経路でフォームへ戻す。
4. 購入直前spaceが取得できなかった場合、購入前snapshotの`navigationState.currentPosition`が`arrived-circle`かつ`circleSpace`を持つ場合だけfallbackに使う。
5. 復元可能spaceがない場合はフォームへ推測値を書かず、snapshot復元だけを行う。
6. `currentStartSpace`とフォーム表示が明らかに矛盾しないよう、既存navigation contextの復元順を確認する。
7. Gallery購入と通常購入の両経路で同じUndo情報構造を使う。

## テスト方針

- 通常購入前の現在地A → 購入でフォームBへ進む → UndoでAへ戻る。
- Gallery経由でも購入直前の現在地へ戻る。
- status / route snapshot / GAS outboxのTask 8契約を維持する。
- fallback可能なsnapshotではcircleSpaceを使う。
- 復元値がない場合に無関係なspaceを生成しない。

## 検証コマンド

```bash
npx vitest run --root . tests/purchase-flow.test.ts tests/complete-circle-visit.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "Undo|購入|現在地"
npm run check:webapp
git diff --check
```

## 受入条件

- Undo後の現在地フォームが購入直前の有効値へ戻る。
- 次の検索で「現在地を入力してください」と誤って止まらない。
- Task 8のstatus / route / outbox Undoを壊していない。

## 予定コミットメッセージ

```text
fix(phase-07-4): restore location on purchase undo
```