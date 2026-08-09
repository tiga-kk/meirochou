# Phase 6 Task 5: 地図上の候補サークル選択を明確化する

## 目的

地図上で別サークルを選んだとき、通常の目的地表示と候補選択を混同しないUIを提供し、経路変更の開始・比較・確定・取消を分かりやすくする。

## 対象外

- Route Guidance状態バグの再修正（Task 1）
- 巡回予定一覧（Task 6）
- 地図ジェスチャー変更（Task 3）

## 前提と依存関係

- Task 1のselection status契約を使う。
- Task 4の新しいメイン画面DOMを基準にする。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/index.html`
- `apps/webapp/css/target.css`

## 対象ファイル

### 作成

なし。既存のroute selection DOMを再利用して構造を整理する。

### 変更

- `apps/webapp/index.html`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/app/browser-application.ts`
- 関連unit/E2E test

### 削除

旧route selection DOMのうち、新しい候補パネルと重複する要素。

## 実装手順

1. 通常案内のcurrent destination表示と、地図ピンから選択したcandidate表示を別の視覚状態にする。
2. candidate選択時は地図下部または画面下部へ候補用のpanelを表示し、少なくとも次を示す。
   - 「候補」ラベル
   - サークルspace
   - お品書き
   - 必要な補助情報
   - 「経路を比較」
   - 「閉じる」
3. `ready`状態では候補panelを表示してよいが、青線は描かない。
4. 「経路を比較」を押して`comparing`へ移った場合だけ、現在の赤線と候補の青線を同時に描画し、現在/候補の距離比較を表示する。
5. comparing中は購入済み/保留を無効化する既存安全策を維持する。
6. 「この地点に変更」でTask 1のconfirm処理を実行し、candidate panelを閉じて通常案内へ戻す。
7. 「戻る」は比較を終了してcandidate panelへ戻す。「閉じる」はcandidate選択自体を破棄してcurrent destinationの通常案内へ戻す。
8. candidate選択の破棄に必要な公開操作が現在存在しない場合だけ、`ChangeDestinationUseCase`へ最小のcancel-selection操作を追加する。新しい状態管理classは作らない。
9. map pinのaria-labelで、現在目的地、候補選択可能な地点、購入済み等を区別できるようにする。

## テスト方針

- pin選択→`ready`: candidate panel表示、青線なし。
- compare→`comparing`: 青線あり、購入/保留disabled。
- back→`ready`: 青線なし、candidate panel継続。
- close→`idle`: current route/current destinationへ戻る。
- confirm→`idle`: candidateがcurrentへ昇格しpanelが閉じる。
- candidate計算失敗: current routeを消さず、panel内で失敗を示す。

## 検証コマンド

```bash
npm run test:route-guidance
npm run test:webapp
npm run check:webapp
npm run test:e2e:ci
git diff --check
```

## 受入条件

- 通常案内と候補選択が見た目と言葉で区別できる。
- 青線は明示的な比較中だけ表示する。
- 候補操作の失敗や取消で現在経路を失わない。
- 経路変更確定後の購入進行はTask 1の回帰テストを引き続き通る。

## 予定コミットメッセージ

`feat(route-guidance): clarify candidate route selection`
