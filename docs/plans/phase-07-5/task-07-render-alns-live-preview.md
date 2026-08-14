# Phase 7.5 Task 7: ALNS best orderを地図上でlive preview

## 目的

探索中にbest orderが改善される様子を青〜紫の巡回順previewとして表示し、完了時に既存の正式赤routeへ戻す。

## 対象外

- 全区間のexact walkable route再構築。
- current red routeやwhite motion cueの置換。
- ALNS scoreの一般ユーザー向け詳細分析画面。

## 前提と依存関係

Task 6完了。Task 2の大きなroute mapを利用する。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `apps/webapp/js/app/browser-application.ts`

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/route-guidance/ui/optimization-preview-model.ts`
- `tests/optimization-preview-model.test.ts`

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/css/target.css`
- `tests/route-map-view-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

### 削除

なし。

## Interfaces

```ts
export interface OptimizationPreviewPoint {
  readonly space: string | null;
  readonly x: number;
  readonly y: number;
}

export function buildOptimizationPreviewPoints(input: {
  currentPosition: { svgX?: number; svgY?: number } | null;
  bestOrder: readonly string[];
  pointIndex: ReadonlyMap<string, readonly { center_x: number; center_y: number }[]>;
}): readonly OptimizationPreviewPoint[];
```

`DomRouteMapView`へ`showOptimizationPreview(preview)`, `clearOptimizationPreview()`, `setOptimizationPreviewGestureActive(active)`を追加する。preview DOMは`optimization-preview-overlay` 1個、polyline 1本、status 1個を再利用する。

## 実装手順

1. RED: bestOrderからstart + circle anchor順のpreview pointsが生成されるpure testを書く。missing pointはskipし、2点未満なら描画しない。
2. RED: current route overlayとは別にpreview overlayが1個だけ生成され、2回目progressでDOM個数が増えず`points`だけ変わるtestを書く。
3. `optimization-preview-model.ts`を実装する。
4. route mapに青〜紫系の`.optimization-preview-route`とcompact status overlayを追加する。current/candidate routeのz-orderと意味を混同しない。
5. BrowserApplication/route viewをTask 6 `onPreview`へ接続し、`探索中 elapsed/limit・best更新 N`を表示する。
6. update countはjobごとにresetする。
7. `GestureZoomController.onGestureActivityChange`でpreviewのDOM書換えを保留し、終了時にlatest previewだけ反映する。ALNS Worker自体は止めない。
8. `complete/cancel/error/manual target/purchase/hold/event-day switch`でpreview/statusをclearする。
9. complete時は正式bestOrder commit後にpreviewを消し、既存赤current exact routeを残す。
10. E2Eではfake workerを使い3つ以上の改善bestを順に送り、青紫polyline pointsが複数回変化し、progress中もcurrent red routeが存在することを確認する。
11. gesture中はpolyline attributeが固定され、pointer release後に最新bestへ1回で追いつくtestを追加する。
12. focused verificationを通してcommitする。

## テスト方針

「progress callbackが呼ばれた」だけでは不足。実DOMの同一overlayの`points`が変化すること、gesture中は変化しないこと、complete後にpreviewが消えることを証明する。

## 検証コマンド

```bash
npx vitest run --root . tests/optimization-preview-model.test.ts tests/route-map-view-contract.test.ts tests/navigation-runtime-controller.test.ts
npx playwright test tests/e2e/webapp.spec.ts --project=mobile-chromium
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- 探索開始後、青〜紫previewが複数回変化する。
- previewは巡回順表示であり、赤current exact routeを隠さない。
- 250ms以上の通知contractを崩さない。
- gesture中にpreview DOMを更新しない。
- complete後にpreview/statusが残留しない。
- preview stateをLocalStorageへ保存しない。

## 予定コミットメッセージ

```text
feat(phase-07-5): visualize evolving alns best route
```
