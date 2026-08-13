# Phase 7.4 タスク4: 独立した地図閲覧surfaceの追加

## 目的

経路案内を開始していなくても、active event/dayの会場地図を全画面で閲覧できる「地図」入口を追加する。既存Route Guidanceの地図DOMを移動・兼用せず、地図計算とzoom部品だけを再利用する。

## 対象外

- 周辺ランキング。
- お品書きカード表示。
- Route Guidance current target変更。
- 新しい地図library。

## 前提と依存関係

Task 1と独立。Task 5〜7の土台になる。

## 読むべき文書と既存実装

- `apps/webapp/index.html`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/js/features/route-guidance/use-cases/route-map-assets-loader.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/app/bind-browser-events.ts`
- `apps/webapp/css/maps.css`

## 対象ファイル

### 作成

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `tests/nearby-map-view.test.ts`

### 変更

- `apps/webapp/index.html`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/app/browser-application.ts`
- 必要なら`apps/webapp/js/app/bind-browser-events.ts`
- `apps/webapp/css/maps.css`
- E2E

### 削除

なし。

## 実装手順

1. ヘッダーに「地図」ボタンがあり、route未開始でも全画面surfaceを開けるRED E2Eを追加する。
2. surfaceにmap area selector、閉じる操作、地図viewport、transform layerを用意する。
3. 初期areaは現在地フォームのareaが有効ならそれを使う。そうでなければ未購入circleがある最初のareaを使う。
4. `MapAreaCatalog`と既存`RouteMapAssetsLoader`を通してmap file / points / grid metadataを取得する。UIからinfrastructure moduleをdeep importしない。
5. `calculateMapViewportLayout()`、`calculateNativeImageScale()`、`GestureZoomController`を再利用し、pinch / wheel / panを既存地図と同じ操作感にする。
6. map surfaceのopen/close、area変更だけでは`routeGuidanceSession`、snapshot、current targetを変更しない。
7. Escape、focus return、aria-modal、safe-area、200% zoomを既存dialog契約に合わせる。

## テスト方針

- route未開始でも地図を開ける。
- active dayのmap area一覧が表示される。
- area変更でmap assetが切り替わる。
- open/close前後でRoute Guidance snapshotが同一。
- 390pxと200% zoomで横スクロールが発生しない。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-map-view.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "地図"
npm run check:webapp
git diff --check
```

## 受入条件

- ヘッダーから独立地図を開閉できる。
- Route Guidance未開始でも利用できる。
- areaを切り替えられる。
- 地図閲覧だけでnavigation stateを変更しない。
- mobile / keyboard / zoom契約を満たす。

## 予定コミットメッセージ

```text
feat(phase-07-4): add standalone map surface
```
