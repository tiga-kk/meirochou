# Phase 7.4 タスク20: 横長mapの初期表示を操作可能な大きさへ拡大

## 目的

通常の経路案内地図と独立した「地図」画面の双方で、横長mapが小さく表示され操作しづらい問題を解消する。縦横比は維持するが、横長mapでは画像全体のcontainを絶対条件にせず、十分な地図高さを優先し、必要なら左右crop + panを許可する。

## 対象外

- map bundle自体の加工
- 縦横比の変形
- browser/page zoomの強制
- mapごとの手書き倍率
- GestureZoomControllerの全面再実装

## 対象ファイル

### 変更
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `tests/route-map-viewport-layout.test.ts`
- `tests/nearby-map-aspect-ratio.test.ts`
- `tests/e2e/webapp.spec.ts`

### 必要な場合のみ
- `apps/webapp/css/target.css`
- `apps/webapp/css/maps.css`

## 実装方針

1. phone幅の横長mapについて、現行の固定`minimumInteractiveHeight: 220`より大きい操作面積を先にREDで固定する。
2. 共通の純粋関数として、viewport幅からminimum interactive heightを求める。初期値は320px幅で260px、390px幅で約280px、広い画面では320px上限を目安にする。
3. 通常route mapは、横長画像の自然高さがminimum未満なら、stage高さをminimumまで等倍拡大する。stage幅がviewportを超えることを許可し、初期位置は左右を均等にcropする。
4. standalone mapも同じminimum policyを使う。利用可能高さがminimumより小さい場合だけdialog内に収まる高さを優先する。
5. 左右cropした部分へpanで到達できることを確認する。
6. 縦長・正方形寄りmapは不要に拡大/cropせず現行挙動を維持する。
7. Task 17の表示中心、route overlay、pin、originが新しいstage geometryと一致することを回帰確認する。
8. 200% text zoomでもpage/dialog全体へ横overflowを追加しない。

## テスト方針

- 390px幅の横長mapで約280pxの地図高さを確保する。
- 320px幅では260px程度を下限とする。
- aspect ratioを維持する。
- 左右cropは対称で、panにより全域へ到達できる。
- 通常route mapとstandalone mapで同じサイズ方針を使う。
- 縦長mapを壊さない。

## 検証コマンド

```bash
npx vitest run --root . tests/route-map-viewport-layout.test.ts tests/nearby-map-aspect-ratio.test.ts tests/map-viewport-center.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "地図|viewport|表示中心"
npm run check:webapp
git diff --check
```

## 受入条件

- Android phone相当で横長mapが現状より明確に大きく、指でpan/zoomしやすい。
- 縦横比は崩れない。
- 必要なら左右cropしてよく、隠れた部分へpanで到達できる。
- 通常route mapと独立「地図」画面でサイズ感が大きく乖離しない。

## 予定コミットメッセージ

```text
fix(phase-07-4): enlarge wide map initial view
```
