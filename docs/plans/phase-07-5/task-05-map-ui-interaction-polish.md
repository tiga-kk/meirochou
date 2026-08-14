# Phase 7.5 Task 5: map関連UIのinteraction polish

## 目的

機能追加で増えたmap関連button/controlの見た目と押下挙動を統一し、誤操作・二重送信・focus欠落を閉じる。

## 対象外

- 全アプリのデザインシステム刷新。
- 新しいbutton component/framework。
- business logic変更。

## 前提と依存関係

Task 2〜4完了。

## 読むべき文書と既存実装

- `apps/webapp/css/tokens.css`
- `apps/webapp/css/target.css`
- `apps/webapp/css/maps.css`
- `apps/webapp/js/ui/dialog-focus.ts`
- route/nearbyの既存E2E

## 対象ファイル

### 変更

- `apps/webapp/css/tokens.css`
- `apps/webapp/css/target.css`
- `apps/webapp/css/maps.css`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `tests/e2e/webapp.spec.ts`
- `tests/navigation-keyboard.spec.ts`
- `tests/nearby-map-view.test.ts`

### 新規作成

なし。

### 削除

なし。

## 実装手順

1. map関連の主要button一覧をtest fixtureで固定する: 条件toggle、page前後、detail、購入、保留、お品書き、目的地にする、candidate compare/confirm/cancel。
2. RED: 主要buttonが44px以上、keyboard focus-visible、disabled中にhandlerが二重実行されないことを確認する。
3. CSSでnormal / hover可能端末のhover / active / focus-visible / selected / disabled / busyを整理する。
4. `:active`で要素サイズを変えず、1px程度の視覚feedbackに留める。
5. async actionは開始時disabled、`finally`で復帰する。既に実装済みの箇所は第二stateを作らない。
6. toggleは`aria-expanded`、selectionは`aria-pressed`/`aria-selected`をCSS source of truthとして使う。
7. reduced motionでは装飾transitionを切る。
8. drawer/detailのEscape順序とreturn focusを確認する。
9. map drag/pinchからclickが発火しないinteraction testを追加する。
10. 200% text zoomでbutton labelやtoolbarがclipしないことをE2Eで確認する。
11. focused verificationを通してcommitする。

## テスト方針

CSS selectorの存在だけでなく、実buttonのcomputed size、属性、click回数、focus戻り先を確認する。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-map-view.test.ts tests/circle-detail.test.ts tests/dialog-focus.test.ts
npx playwright test tests/navigation-keyboard.spec.ts tests/e2e/webapp.spec.ts
npm run check:webapp
git diff --check
```

## 受入条件

- 押せる/選択中/無効/処理中が視覚とARIAで一致する。
- async actionの二重送信がない。
- keyboardとtouchの双方で主要操作が成立する。
- 200% zoomでも本質操作がclipしない。
- map drag/pinchがbutton操作へ化けない。

## 予定コミットメッセージ

```text
fix(phase-07-5): polish map interactions
```
