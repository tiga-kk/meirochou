# Phase 6 Task 7: お品書き一覧を2列化しスワイプ操作を改善する

## 目的

縦長お品書きによる長いスクロールを減らし、2列配置に合わせた一方向スワイプと抵抗感のある操作へ変更する。

## 対象外

- 一覧の並び順を完全に保持すること
- Masonryライブラリ導入
- 購入状態のdomain処理変更
- 画像の事前加工

## 前提と依存関係

- Task 1、2の購入処理契約を維持する。
- Task 3完了後に実施する。Task 3と同じ`gesture-zoom-controller.js`を変更するため、Pointer Events化後の公開契約を前提にする。
- 既存の画像ロード後`wide`判定を再利用する。

## 読むべき文書と既存実装

- `apps/webapp/css/gallery.css`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- 一覧関連E2E test

## 対象ファイル

### 作成

- 必要なら`tests/gallery-swipe-action.test.ts`

### 変更

- `apps/webapp/css/gallery.css`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- 関連unit/E2E test

### 削除

なし。

## 実装手順

1. `.gallery-grid`を`repeat(2, minmax(0, 1fr))`相当の2列へする。
2. 横長画像で付与される`.gallery-item.wide`は2列全体を占有する。
3. 縦長カードの画像が列幅へ収まり、縦スクロール量を削減する。画像比率を壊す固定heightは使わない。
4. `setupSwipeAction`へ、ジェスチャー開始時に許可方向を取得できる最小のoptionを追加する。
5. 許可方向はカードの`getBoundingClientRect()`中心とgallery grid中心を比較して決める。
   - 左列: leftのみ
   - 右列: rightのみ
   - `wide`: both
6. 禁止方向へ指を動かした場合は購入アクションへ到達させず、カードを原位置付近に保つ。
7. 許可方向では指の水平移動量へ0〜1の抵抗係数を掛け、現在の1:1追従より重い感覚にする。初期値は0.6前後を基準に、E2E/実機確認で必要最小限調整する。
8. 発火閾値は固定100pxだけに依存せずカード幅を考慮する。ただし小さいカードでも誤発火しない下限を持つ。
9. 閾値未満のtouch/pointer endではCSS transitionで元位置へ戻す。
10. 購入成立時の最終退場animationはCSS transform/opacityで行い、状態更新callbackは1回だけ呼ぶ。
11. 一覧の初回説明を同じブラウザで一度だけ表示する。既存にUI preference用storage helperがあれば再利用し、なければUI専用LocalStorage key `comipath:ui:v1:gallery-swipe-hint-seen`だけを追加する。event/day state schemaへ混ぜない。
12. 最初の一覧表示で未表示なら説明用overlayを表示し、表示開始時にseen stateを保存する。
13. hintは左カードが左へ、右カードが右へ動く短いCSS animationと「左右にスワイプして購入済みにできます」相当の説明を表示し、実データのcallbackを呼ばない。
14. hintは数秒後またはユーザー操作で消え、再読み込み後も表示済みなら再表示しない。

## テスト方針

- 縦長2件が2列へ入る。
- `wide`は全幅。
- 左列のright swipe、右列のleft swipeではcallbackを呼ばない。
- 許可方向で閾値超過時だけcallbackを1回呼ぶ。
- 縦スクロール優先の動きは購入swipeへ誤判定しない。
- 初回hintは同じブラウザで1回だけ表示し、再読み込み後は表示しない。購入callbackを発火しない。

## 検証コマンド

```bash
npx vitest run tests/gallery-swipe-action.test.ts
npm run test:webapp
npm run check:webapp
npm run test:e2e:ci
git diff --check
```

テストファイルを新設しない場合は、同じassertionを既存gallery/E2E testへ追加する。

## 受入条件

- 縦長お品書きが2列表示される。
- 横長お品書きは全幅表示される。
- 左右列の外側方向だけでスワイプ購入できる。
- スワイプに現在より抵抗感がある。
- 初回説明animationが実購入を起こさない。

## 予定コミットメッセージ

`feat(gallery): add dense layout and directional swipe`
