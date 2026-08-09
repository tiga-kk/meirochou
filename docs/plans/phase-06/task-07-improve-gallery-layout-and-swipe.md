# Phase 6 Task 7: お品書き一覧を2列化しスワイプ操作を改善する

## 目的

縦長お品書きによる長いスクロールを減らし、2列配置に合わせた一方向スワイプと抵抗感のある操作へ変更する。同時に、一覧からの購入操作が端末保存の完了前に成功表示されることや、購入済み地点がRoute Guidanceの将来順序へ残ることを防ぐ。

## 対象外

- Masonryライブラリ導入
- CSS Gridの`dense`等による見た目優先の並べ替え
- 購入状態domain規則そのものの変更
- 画像の事前加工
- 一覧購入を契機とした全経路再計算やALNS再実行

## 前提と依存関係

- Task 1、2の購入処理契約を維持する。
- Task 3完了後に実施する。Task 3と同じ`gesture-zoom-controller.js`を変更するため、Pointer Events化後の公開契約を前提にする。
- 既存の画像ロード後`wide`判定を再利用する。
- `DomCircleGalleryView`の`dataManager`は本番では`BrowserApplication`であり、`addPurchased()`は非同期で`completeCircleVisit`へ到達する。このPromiseを待たずに成功UIへ進めない。
- 既存の「優先度順」「スペース順」のソート結果はDOM順として維持する。2列化のために既存ソート意味を変更しない。

## 読むべき文書と既存実装

- `apps/webapp/css/gallery.css`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/app/complete-circle-visit.ts`
- `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-navigation-operations.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `tests/purchase-flow.test.ts`
- 一覧関連E2E test

## 対象ファイル

### 作成

- 必要なら`tests/gallery-swipe-action.test.ts`

### 変更

- `apps/webapp/css/gallery.css`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/js/app/browser-application.ts`
- 非現在目的地の購入を既存NavigationStateへ反映するため必要な場合だけ、`apps/webapp/js/features/route-guidance/use-cases/route-guidance-navigation-operations.ts`
- 上記操作をBrowserApplicationまで既存の責務方向で公開するため必要な場合だけ、`apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `tests/purchase-flow.test.ts`
- 関連unit/E2E test

### 削除

なし。

## 実装手順

1. `.gallery-grid`を`repeat(2, minmax(0, 1fr))`相当の2列へする。
2. 横長画像で付与される`.gallery-item.wide`は2列全体を占有する。
3. 縦長カードの画像が列幅へ収まり、縦スクロール量を削減する。画像比率を壊す固定heightは使わない。
4. CSS Gridの自動配置はDOM順を保つ通常配置を使い、`dense`やJS側の再配列で空きを埋めない。既存`sortTargets()`が作る「優先度順」「スペース順」の意味を維持する。
5. `setupSwipeAction`へ、ジェスチャー開始時に許可方向を取得できる最小のoptionを追加する。
6. 許可方向はカードの`getBoundingClientRect()`中心とgallery grid中心を比較して決める。
   - 左列: leftのみ
   - 右列: rightのみ
   - `wide`: both
7. 禁止方向へ指を動かした場合は購入アクションへ到達させず、カードを原位置付近に保つ。
8. 許可方向では指の水平移動量へ0〜1の抵抗係数を掛け、現在の1:1追従より重い感覚にする。初期値は0.6前後を基準に、E2E/実機確認で必要最小限調整する。
9. 発火閾値は固定100pxだけに依存せずカード幅を考慮する。ただし小さいカードでも誤発火しない下限を持つ。
10. 閾値未満のpointer endではCSS transitionで元位置へ戻す。縦移動が優勢な操作はgalleryの縦スクロールを優先する。
11. 閾値を超えた場合も、`setupSwipeAction`だけで「購入成功」とみなしてカードを恒久的に消さない。購入callbackは1回だけ開始し、端末保存結果を所有する`DomCircleGalleryView.handleGalleryPurchase()`側へ委譲する。
12. `handleGalleryPurchase()`は`this.dataManager.addPurchased(space)`のPromiseを必ず待つ。成功が確定した後だけ成功toast、最終退場animation、`currentTargets`からの除外、再描画を行う。現行の不要な第2引数`sheetName`へ依存しない。
13. `addPurchased()`がrejectした場合は成功toastやカード削除を行わず、カードを操作可能な位置へ戻す。端末保存失敗を未処理Promiseにせず、既存のローカル保存失敗の表示方針に合わせてユーザーへ示す。
14. 非同期購入中に同じカードのボタン/スワイプから二重送信しない。既存DOMのdisabled状態または最小のin-flight集合のどちらか一方で十分であり、新しい汎用ジョブ管理層は作らない。
15. 一覧で現在のRoute Guidance targetを購入した場合は、既存`completeCircleVisit`の`advanced`/`finished`結果を本番画面へ反映し、次の案内または完了表示へ更新する。
16. 一覧で現在target以外の未訪問サークルを購入した場合は、現在の`targetSpace`、`lockedFirstLeg`、current routeを維持したまま、その購入済みspaceを`bestOrder`と`provisionalOrder`の将来候補から除外する。既存`RouteGuidanceNavigationOperations`へ小さな操作を追加する必要がある場合は同classへ置き、新しい状態管理層は作らない。
17. 非現在目的地の購入後に現在targetを購入しても、先に購入済みのspaceを次targetとして選んで`next-target-missing`にならないことをintegration testで固定する。全経路再計算は行わない。
18. 一覧の初回説明を同じブラウザで一度だけ表示する。既存にUI preference用storage helperがあれば再利用し、なければUI専用LocalStorage key `comipath:ui:v1:gallery-swipe-hint-seen`だけを追加する。event/day state schemaへ混ぜない。
19. 最初の一覧表示で未表示なら説明用overlayを表示し、表示開始時にseen stateを保存する。
20. hintは左カードが左へ、右カードが右へ動く短いCSS animationと「外側へスワイプして購入済みにできます」相当の説明を表示し、実データのcallbackを呼ばない。
21. hintは数秒後またはユーザー操作で消え、再読み込み後も表示済みなら再表示しない。

## テスト方針

- 縦長2件が2列へ入り、DOM順は既存ソート結果と一致する。
- `wide`は全幅。
- 左列のright swipe、右列のleft swipeではcallbackを呼ばない。
- 許可方向で閾値超過時だけcallbackを1回呼ぶ。
- 縦スクロール優先の動きは購入swipeへ誤判定しない。
- 購入Promiseがpendingの間は成功表示・カード削除を行わず、同一spaceの購入を二重開始しない。
- LocalStorage save失敗時はカードを残し、成功toastを出さない。
- 購入成功時だけカードを除去する。
- 現在targetの一覧購入で次の案内が本番Viewへ反映される。
- 非現在targetの一覧購入後も現在経路を維持し、そのspaceが将来順序から外れる。
- 非現在target購入→現在target購入の連続操作で`next-target-missing`にならない。
- 初回hintは同じブラウザで1回だけ表示し、再読み込み後は表示しない。購入callbackを発火しない。

## 検証コマンド

```bash
npx vitest run tests/gallery-swipe-action.test.ts tests/purchase-flow.test.ts
npm run test:route-guidance
npm run test:webapp
npm run check:webapp
npm run test:e2e:ci
git diff --check
```

`tests/gallery-swipe-action.test.ts`を新設しない場合は、同じassertionを既存gallery/E2E testへ追加し、存在しないテストファイルを検証コマンドへ残さない。

## 受入条件

- 縦長お品書きが2列表示される。
- 横長お品書きは全幅表示される。
- 既存の優先度順/スペース順を2列化の都合で崩さない。
- 左右列の外側方向だけでスワイプ購入できる。
- スワイプに現在より抵抗感がある。
- 端末保存が失敗した購入を成功表示しない。
- 一覧購入後もRoute Guidanceが購入済み地点を将来targetとして再選択しない。
- 初回説明animationが実購入を起こさない。

## 予定コミットメッセージ

`feat(gallery): add dense layout and directional swipe`
