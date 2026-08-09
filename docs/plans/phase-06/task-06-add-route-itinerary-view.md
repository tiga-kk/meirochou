# Phase 6 Task 6: 今後の巡回予定を一覧と地図で表示する

## 目的

ユーザーが「これからどのサークルをどの順番で回るのか」をいつでも確認できるようにし、文字列の順序一覧と地図上の番号付きピンを提供する。

## 対象外

- 将来区間すべての経路線の新規計算
- ALNSの目的関数変更
- itinerary編集・ドラッグ並び替え
- navigation orderの手動固定

## 前提と依存関係

- Task 4のheader/案内バーに「予定」導線を追加できる余地がある。
- `NavigationState.bestOrder`を正本とし、空の場合のみ`provisionalOrder`へfallbackする。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/domain/route-guidance-types.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/app/browser-application.ts`

## 対象ファイル

### 作成

- `apps/webapp/js/features/route-guidance/ui/route-itinerary-model.ts`
- `apps/webapp/js/features/route-guidance/ui/route-itinerary-dialog.ts`
- `tests/route-itinerary-model.test.ts`

### 変更

- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/index.html`またはTask 4で作成したheader導線
- 関連CSS
- E2E test

### 削除

なし。

## 実装手順

1. pure function `buildRouteItineraryModel(snapshot, circles)`を作る。
2. 入力:
   - `RouteGuidanceSessionSnapshot`
   - 現在event/dayのcircle一覧
3. 出力:
   - 表示順を持つreadonly entry配列
   - 各entryは少なくとも`index`, `space`, `circle`, `isCurrent`を持つ。
4. 順序は`navigationState.bestOrder`を優先し、空の場合だけ`provisionalOrder`を使う。購入済み等で現在pending listに存在しないspaceは表示しない。
5. 独立したfeature UIとして`route-itinerary-dialog.ts`を作り、headerの「予定」から開閉できるようにする。既存Lit方針に従い、dialog単体の表示に限定する。
6. dialogの一覧は`1. 東A12`, `2. 東B3`のように順序が一目で分かる形式にする。お品書きや補助情報を大きく積まない。
7. 地図表示切替を追加し、予定表示中は同一map area内の対象circleへ番号付きピンを描画する。
8. 異なるmap areaのcircleを一つの地図へ無理に重ねない。現在表示areaに属するentryだけを番号付きで描画し、一覧側では全順序を維持する。
9. 全区間route geometryは計算しない。現在区間の通常赤線は既存のまま維持する。
10. itinerary表示がNavigationStateを変更しないread-only機能であることをテストする。

## テスト方針

- `bestOrder`優先。
- `bestOrder`空時だけ`provisionalOrder`。
- pending circlesにないspaceを除外。
- current targetの`isCurrent`。
- 番号が1から連続する。
- itineraryを開閉してもSession snapshotが変化しない。
- 異なるareaを地図へ誤配置しない。

## 検証コマンド

```bash
npx vitest run tests/route-itinerary-model.test.ts
npm run test:route-guidance
npm run test:webapp
npm run check:webapp
npm run test:e2e:ci
git diff --check
```

## 受入条件

- 「予定」から現在の巡回順を確認できる。
- 順序一覧と番号付き地図ピンが同じ順番を示す。
- 新たな全区間経路計算を行わない。
- itinerary表示が現在案内を変更しない。

## 予定コミットメッセージ

`feat(route-guidance): add route itinerary view`
