# Phase 7.4 タスク5: 任意検索基準地点とgrid origin解決

## 目的

独立地図で「現在地を使う」または「地図で基準地点を変更」を選び、検索用のgrid indexを安全に解決できるようにする。検索基準地点はRoute Guidanceの現在地と独立させる。

## 対象外

- 周辺circleランキング。
- お品書き描画。
- Route Guidance current positionの更新。
- GPS等の自動位置取得。

## 前提と依存関係

Task 4完了。

## 読むべき文書と既存実装

- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts`
- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-types.ts`
- `apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/ui/parse-current-location-form.ts`
- `apps/webapp/js/shared/domain/space-parser.ts`

## 対象ファイル

### 変更

- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view.ts`
- `apps/webapp/js/app/browser-application.ts`
- routing / nearby-map test

### 作成候補

- `tests/nearby-map-origin.test.ts`

### 削除

なし。

## 実装手順

1. `resolveNearestWalkableGridIndex(...)`相当の純粋関数へREDを追加する。入力はrequested col/row、grid metadata、grid bytes。walkableならそのindex、blockedなら距離の近いwalkable index、存在しなければ`null`。
2. 地図のclient座標をtransform済みstageの`getBoundingClientRect()`に対する比率へ変換し、元画像座標とgrid col/rowを求める純粋な変換を追加する。
3. 「基準地点を変更」を押したときだけselection modeへ入る。通常tapやdrag endで基準地点を変更しない。
4. selection mode中の次の有効tapでgrid originを解決し、基準地点markerを表示してselection modeを終了する。
5. blocked cellならresolverで最寄りwalkable cellへ補正する。補正不能なら既存originを維持してエラーを表示する。
6. 「現在地を使う」は現在地フォームを既存space解決規則で解釈し、対応point portalのwalkable grid indexを使う。
7. origin stateはnearby map surface内だけに保持する。Route Guidance sessionや現在地formを書き換えない。

## テスト方針

- walkable cell → 同じindex。
- blocked cell → 最寄りwalkable。
- 同距離候補は固定した探索順で決定的になる。
- 全blocked → `null`。
- zoom / pan後のstage rectから正しい画像比率へ戻せる。
- selection mode外のtapではorigin不変。
- selection mode内のtapだけorigin変更。
- origin変更後もRoute Guidance snapshot不変。

## 検証コマンド

```bash
npx vitest run --root . tests/nearby-map-origin.test.ts tests/route-planner-contract.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "基準地点|地図"
npm run check:webapp
git diff --check
```

## 受入条件

- 現在地と任意tapの二種類から検索基準を選べる。
- blocked cell指定を安全に処理できる。
- pan操作を誤って地点指定にしない。
- 検索基準の変更がRoute Guidanceへ副作用を持たない。

## 予定コミットメッセージ

```text
feat(phase-07-4): select nearby map search origin
```
