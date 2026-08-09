# Phase 6 Task 1: Route Guidanceの候補・確定状態を修正する

## 目的

通常案内、候補選択、経路比較、経路変更確定、購入後進行で`RouteGuidanceSession`と`NavigationState`が同じ目的地を指すようにし、赤線と青線の重複および経路変更後に購入しても次へ進まない不具合を解消する。

## 対象外

- 候補用bottom sheetのデザイン変更
- 地図ジェスチャー改善
- 最適化アルゴリズム変更
- 新しいRoute Guidance状態管理層の追加

## 前提と依存関係

- Phase 5D完了後の`main`を基準とする。
- `RouteGuidanceSession`を状態の正本として維持する。
- Task 2以降は本Taskで確定したselection statusの意味を前提にする。

## 読むべき文書と既存実装

- `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`
- `apps/webapp/js/features/route-guidance/domain/route-guidance-types.ts`
- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-navigation-operations.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/app/browser-application.ts`

## 対象ファイル

### 作成

なし。

### 変更

- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `tests/finish-current-circle.test.ts`
- `tests/route-guidance-controller.test.ts`
- `tests/purchase-flow.test.ts`
- 必要なら既存の候補経路表示テスト

### 削除

なし。

## 実装手順

1. selection statusの意味を次で固定する。
   - `idle`: 未確定候補を表示していない通常案内。
   - `loading`: 候補経路計算中。
   - `ready`: 候補は計算済みだが、青い比較経路はまだ表示しない。
   - `comparing`: 現在経路と候補経路を比較中。青い候補経路を表示する。
   - `error`: 候補経路計算失敗。
2. `FinishCurrentCircleUseCase.execute()`が`advanced`をcommitするとき、`selectedDestination`/`selectedRoute`を次の通常案内と同じ値へ揃えてよいが、`selectionStatus`は`idle`にする。
3. `DomRouteMapView.renderNavigation()`は候補の青線を`selectionState === "comparing"`の場合だけ描画する。`ready`は候補情報を保持していても青線を描画しない。
4. `ChangeDestinationUseCase.confirm()`では`currentDestination`/`currentRoute`だけを差し替えない。既存`RouteGuidanceNavigationOperations`の手動目的地変更契約を再利用し、同じcommitで少なくとも次を一致させる。
   - `navigationState.targetSpace`
   - `navigationState.lockedFirstLeg.toSpace`
   - `currentDestination.space`
   - `selectedDestination.space`
   - `currentRoute`
   - `selectedRoute`
5. confirm成功後は`selectionStatus`を`idle`へ戻す。
6. confirm時にNavigationState遷移が成立しない場合は部分commitしない。現在経路を維持する。
7. 経路変更確定後に購入済みを実行するintegration testを追加し、`FinishCurrentCircleUseCase`が`ignored`にならず次の目的地へ進むことを確認する。
8. 通常の購入後進行で同一経路の赤線・青線を二重表示する状態を作らないことをView/状態テストで固定する。

## テスト方針

最低限、次をテストする。

- 通常の`advanced`後は`selectionStatus === "idle"`。
- `ready`では候補routeが存在してもcandidate overlayを描画しない。
- `comparing`ではcandidate overlayを描画する。
- confirm後はNavigationStateと表示中目的地が一致する。
- confirm後の購入で次のpending circleへ進む。
- confirm失敗時はcurrent routeとcurrent destinationを変更しない。

## 検証コマンド

```bash
npx vitest run tests/finish-current-circle.test.ts tests/route-guidance-controller.test.ts tests/purchase-flow.test.ts
npm run test:route-guidance
npm run check:webapp
git diff --check
```

## 受入条件

- 通常経路だけの状態で青い候補線が表示されない。
- 経路変更確定後、表示目的地とNavigationStateの目的地が一致する。
- 経路変更確定後に購入済みを押すと次のサークルへ進む。
- 既存の候補計算、比較、cancelの正常系を壊さない。

## 予定コミットメッセージ

`fix(route-guidance): align confirmed destination state`
