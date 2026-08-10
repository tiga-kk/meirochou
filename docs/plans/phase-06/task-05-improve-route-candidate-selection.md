# Phase 6 Task 5: 地図上の候補サークル選択を明確化する

## 目的

地図上で別サークルを選んだとき、通常の目的地表示と候補選択を混同しないUIを提供し、経路変更の開始・比較・確定・取消を分かりやすくする。

## 対象外

- Route Guidance状態バグの再修正（Task 1）
- 巡回予定一覧（Task 6）
- 地図ジェスチャー変更（Task 3）
- 候補選択だけのための新しい状態管理classの追加

## 前提と依存関係

- Task 1のselection status契約を使う。
- Task 4の新しいメイン画面DOMを基準にする。
- 候補の取消も`ChangeDestinationUseCase`→`RouteGuidanceController`→`BrowserApplication`→Viewの既存責務方向を維持し、ViewやBrowserApplicationからUse Caseへ直接到達しない。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/index.html`
- `apps/webapp/css/target.css`
- `tests/route-guidance-controller.test.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 作成

なし。既存のroute selection DOMを再利用して構造を整理する。

### 変更

- `apps/webapp/index.html`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/app/browser-application.ts`
- `tests/route-guidance-controller.test.ts`
- `tests/e2e/webapp.spec.ts`

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
7. 「戻る」は比較だけを終了して`comparing`→`ready`へ戻し、candidate panelは維持する。「閉じる」とは別操作にする。
8. 現行には`ready`/`loading`/`error`の候補選択自体を破棄する公開操作がないため、`ChangeDestinationUseCase`へ最小の`cancelSelection()`相当を追加し、`RouteGuidanceController`から公開する。新しい状態管理classは作らない。
9. 候補選択の取消では進行中の候補計算tokenも無効化し、遅れて完了した非同期計算が候補を復活させない。その後、`selectedDestination`/`selectedRoute`を現在案内と同じ値へ戻し、`selectionStatus`を`idle`にする。`navigationState`、`currentDestination`、`currentRoute`は変更しない。
10. `BrowserApplication`はControllerの取消操作を呼び、候補用messageを消して通常案内を再描画する。Use Case内部へ直接触れない。
11. candidate計算失敗時もcurrent routeは維持し、失敗表示を候補panel内に出す。「閉じる」で通常案内へ戻れるようにする。
12. map pinの`aria-label`で、現在目的地、候補選択可能な地点、購入済み等を区別できるようにする。
13. candidate panelの「閉じる」と比較画面の「戻る」を同じDOM idやcallbackへ無理に兼用せず、状態遷移がテストから識別できるようにする。

## テスト方針

- pin選択→`ready`: candidate panel表示、青線なし。
- compare→`comparing`: 青線あり、購入/保留disabled。
- back→`ready`: 青線なし、candidate panel継続。
- close→`idle`: selected/currentが再び一致し、current route/current destination/NavigationStateは変わらない。
- loading中close→`idle`: 遅れて候補計算が完了してもcandidateが復活しない。
- error中close→`idle`: current routeを維持して通常案内へ戻る。
- confirm→`idle`: candidateがcurrentへ昇格しpanelが閉じる。
- candidate計算失敗: current routeを消さず、panel内で失敗を示す。
- Controller経由で取消できることを確認し、BrowserApplicationやViewからUse Caseを直接呼ぶテストにしない。
- E2Eでは実際の地図pin→候補panel→比較→戻る/閉じる/確定のDOM配線を通し、Controller unit testだけで本番接続を証明したことにしない。

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
- 「戻る」と「閉じる」の意味が状態遷移として分離されている。
- 候補操作の失敗や取消で現在経路を失わず、取消後に遅延した候補計算が復活しない。
- 経路変更確定後の購入進行はTask 1の回帰テストを引き続き通る。

## 予定コミットメッセージ

`feat(route-guidance): clarify candidate route selection`
