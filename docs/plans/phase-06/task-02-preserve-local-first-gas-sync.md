# Phase 6 Task 2: GAS配送を購入後進行から完全に分離する

## 目的

購入済み/保留等のローカル状態更新とRoute Guidance進行をGAS配送の成否から切り離し、一時的なGAS失敗や配送要求の例外があっても購入状態と次のお品書き表示を維持する。

## 対象外

- GAS/CSVの公開データ形式変更
- 常時ポーリング
- 無制限の指数バックオフ基盤
- サーバー側の新しいqueue
- outbox schema migration

## 前提と依存関係

- Task 1完了後に実施する。
- repository save成功がCircle Statusのcommit pointである。
- 既存`gasOutbox`を耐障害性の正本として再利用する。

## 読むべき文書と既存実装

- `apps/webapp/js/features/circle-status/use-cases/change-circle-status.ts`
- `apps/webapp/js/features/circle-status/use-cases/pending-gas-update-background-process.ts`
- `apps/webapp/js/features/circle-status/use-cases/send-pending-gas-updates.ts`
- `apps/webapp/js/features/circle-status/infrastructure/gas-pending-update-delivery.ts`
- `apps/webapp/js/api/gas-api-client.ts`
- `apps/webapp/js/app/complete-circle-visit.ts`
- `apps/webapp/js/app/browser-application.ts`
- `tests/purchase-flow.test.ts`
- `tests/change-circle-status.test.ts`
- `tests/pending-gas-update-background-process.test.ts`
- `tests/send-pending-gas-updates.test.ts`

## 対象ファイル

### 作成

なし。

### 変更

- `apps/webapp/js/features/circle-status/use-cases/change-circle-status.ts`
- `apps/webapp/js/app/browser-application.ts`
- `tests/change-circle-status.test.ts`
- `tests/purchase-flow.test.ts`
- 必要に応じて`tests/pending-gas-update-background-process.test.ts`

### 削除

なし。

## 実装手順

1. `ChangeCircleStatusUseCase.execute()`ではrepository saveとactive session更新を完了した後の`backgroundProcess.requestSend()`をbest-effort通知として扱う。
2. `requestSend()`が同期例外を投げても、既にcommit済みのローカルmutationを失敗扱いにしない。`ChangeCircleStatusResult`を通常どおり返す。
3. `BrowserApplication.handleAction()`と`handleReset()`から、ローカルmutation直後の`flushOutboxWithDiagnostic()`呼び出しを除去する。自動配送の所有者を`DefaultPendingGasUpdateBackgroundProcess`へ一本化する。
4. `flushOutboxWithDiagnostic()`が通常経路から参照されなくなった場合は削除する。設定画面の明示的な再送は`PendingGasUpdatesController.retryAll()`を引き続き使用する。
5. 自動配送で失敗したentryは`SendPendingGasUpdatesUseCase`の既存契約どおりoutboxへ残し、attempt/安全なerror分類を保持する。
6. 通信失敗を再現するpurchase integration testを2サークル構成で追加する。
   - 1件目購入のlocal saveは成功。
   - GAS deliveryは失敗。
   - 1件目は`purchased`。
   - outboxは残る。
   - Route Guidanceは2件目へ`advanced`。
   - UIは2件目のnavigation contextを描画する。
7. `backgroundProcess.requestSend()`自体が同期例外を投げるfixtureを追加し、ローカル購入とRoute Guidance進行が成功することを確認する。
8. 自動失敗時に「購入失敗」と誤認させるエラーを出さない。未送信の確認・手動再送は設定内のoutbox UIへ任せる。

## テスト方針

次の境界を別々に証明する。

- LocalStorage save失敗: 購入は失敗し、Route Guidanceは進まない。
- LocalStorage save成功 + background notification例外: 購入成功、Route Guidanceは進む。
- LocalStorage save成功 + GAS network失敗: 購入成功、Route Guidanceは進み、outboxが残る。
- 手動retry: 既存の成功/失敗表示を維持する。

通信mockだけのunit testで終えず、`BrowserApplication.handleAction()`から実際の`completeCircleVisit`とRoute Guidance Sessionへ到達するintegration testを含める。

## 検証コマンド

```bash
npx vitest run tests/change-circle-status.test.ts tests/purchase-flow.test.ts tests/pending-gas-update-background-process.test.ts tests/send-pending-gas-updates.test.ts
npm run test:phase-05d-regressions
npm run check:webapp
git diff --check
```

## 受入条件

- GAS配送失敗が購入済み状態を取り消さない。
- GAS配送失敗が次の目的地・お品書き表示を止めない。
- `requestSend()`の同期例外がローカルmutationの失敗として外へ漏れない。
- 未送信entryがoutboxへ残り、既存のonline/new-entry/manual retry経路で再送可能である。
- 自動購入経路からforeground retryを重複起動しない。

## 予定コミットメッセージ

`fix(circle-status): isolate gas delivery from local progress`
