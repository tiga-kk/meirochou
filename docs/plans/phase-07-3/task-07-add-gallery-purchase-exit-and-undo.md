# Phase 7.3 Task 7: Gallery購入時の退出表示と完全Undo

## 目標

Galleryで購入済みにしたcardが即座の全再描画で消える挙動を改め、短い退出animationの後に対象itemだけを取り除く。直後の誤操作は既存Undo基盤を再利用して戻せるようにする。

## 重要な既存責務

`ChangeCircleStatusUseCase` は既に期限付きUndo tokenを返し、`UndoCircleStatusChangeUseCase` はlocal statusとpending GAS updateを逆方向へ戻せる。

一方 `completeCircleVisit()` はstatus変更後に `finishCurrentCircle()` を実行し、成功時にはroute guidanceのcurrent/remaining/current-position側も進む。したがってGallery Undoをstatusだけ戻してはいけない。

このTaskでは新しい汎用transaction frameworkを作らず、既存のstatus Undoとroute guidanceの既存snapshot/session責務を使って「一回の購入完了を狭く元へ戻す」経路を作る。

## 外部挙動

購入成功時:

1. status/GAS outbox/route updateが成功する。
2. 対象cardへ退出classを付ける。
3. 180〜240ms程度のtransition終了後、対象itemだけDOM/listから除去する。
4. 件数と地図pinを更新する。
5. 4〜6秒程度のUndo snackbarを一つ表示する。

`prefers-reduced-motion: reduce` では退出animationを省略して即時除去してよい。

Undo成功時は、少なくとも次が一貫して戻る。

- circle status。
- Gallery itemと件数。
- route guidanceのcurrent/remaining/current-position等、購入完了で進んだ状態。
- pending GAS updateの意味。
- map pin visibility。

連続操作時はlatest snackbarを一つだけ表示する。古いtokenを誤って別操作へ適用しない。

## 対象ファイル

**変更候補:**

- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/css/gallery.css`
- `apps/webapp/js/app/complete-circle-visit.ts`
- 必要な場合のみ `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- 必要な場合のみ既存route snapshot/session repository
- 既存 `change-circle-status.ts` / `undo-circle-status-change.ts` は契約拡張が必要な場合だけ変更する
- `tests/gallery-swipe-action.test.ts`
- `tests/complete-circle-visit.test.ts`
- `tests/purchase-flow.test.ts`
- `tests/undo-circle-status.test.ts`
- `tests/e2e/webapp.spec.ts`

## 実装上の方針

`completeCircleVisit()` の成功前に、Undoに必要な最小のroute stateを既存domain/session表現で保持する。成功結果へ狭いUndo情報を返す、または既存app/controllerに同等の一回限り操作を持たせる。一般化されたcommand busやtransaction managerは追加しない。

退出animationは `transitionend` を基本とし、安全timeoutを持ってよい。animation終了まで全Galleryを `renderGallery()` し直して対象DOMを消さない。

## テスト方針

最初に次のREDを作る。

- 購入成功直後は対象cardが退出状態として残り、transition完了後にitemだけが消える。
- reduced motionでは待たずに消える。
- Undo期限内ならstatus、route state、GAS pending update、Gallery itemが購入前と同じ意味へ戻る。
- expired/consumed tokenは再利用できない。
- route update失敗時の既存rollbackを壊さない。
- 連続購入でsnackbarとtokenが取り違えられない。
- 本番Gallery操作からcombined purchase/undo経路へ到達する。

setTimeoutの経過だけを業務ロジックの証拠にしない。route stateとoutboxのassertionを含める。

## やってはいけないこと

- statusだけ戻してrouteを進んだままにしない。
- Gallery全体の即時再描画を残したままCSS animationだけ追加しない。
- 新しい汎用transaction層、event bus、history frameworkを追加しない。
- GAS updateを単に削除して逆操作の意味を失わせない。
- 複数snackbarを積み重ねない。

## 完了条件

- item単位の退出表示が実DOMで成立する。
- Undoがstatusだけでなく購入完了が変更したroute/outbox/UI状態まで一貫して戻す。
- 既存の失敗時rollbackと通常購入経路を壊していない。
- Task 3の購入済みpin非表示とも整合する。