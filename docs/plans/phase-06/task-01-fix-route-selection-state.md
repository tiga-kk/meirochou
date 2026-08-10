# Phase 6 Task 1: Route Guidanceの候補・確定状態を修正する

## 目的

通常案内、候補選択、経路比較、経路変更確定、購入後進行で`RouteGuidanceSession`と`NavigationState`が同じ目的地を指すようにし、赤線と青線の重複および経路変更後に購入しても次へ進まない不具合を解消する。

特に、案内開始直後・案内再開直後・購入後進行直後の通常案内では、`selectedDestination`/`selectedRoute`が現在案内と同じ値を保持していても候補選択中とは扱わない。

## 対象外

- 候補用bottom sheetのデザイン変更
- 地図ジェスチャー改善
- 最適化アルゴリズム変更
- 新しいRoute Guidance状態管理層の追加
- `SelectionStatus`に残る既存`calculating`値の整理だけを目的とした型変更

## 前提と依存関係

- Phase 5D完了後の`main`を基準とする。
- `RouteGuidanceSession`を状態の正本として維持する。
- Task 2以降は本Taskで確定したselection statusの意味を前提にする。

## 読むべき文書と既存実装

- `docs/specs/2026-08-09-phase-06-user-experience-improvements-design.md`
- `apps/webapp/js/features/route-guidance/domain/route-guidance-types.ts`
- `apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-navigation-operations.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/app/browser-application.ts`

## 対象ファイル

### 作成

なし。

### 変更

- `apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `tests/start-route-guidance.test.ts`
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
   - `ready`: 現在目的地とは異なる候補経路が計算済みで、比較開始前。
   - `comparing`: 現在経路と候補経路を比較中。青い候補経路を表示する。
   - `error`: 候補経路計算失敗。
   - 型に既存の`calculating`が残っていても、本Taskでは候補比較状態として扱わず、青線表示条件へ含めない。利用箇所のない値を整理するためだけの追加リファクタリングは行わない。
2. `StartRouteGuidanceUseCase.execute()`が通常案内の最初の目的地を確定するとき、`currentDestination`/`currentRoute`と`selectedDestination`/`selectedRoute`へ同じ値を保持してよいが、`selectionStatus`は`idle`にする。
3. `ResumeRouteGuidanceUseCase`の通常再開が既に`idle`を作る契約は維持し、開始・再開・購入後進行で通常案内の意味を揃える。
4. `FinishCurrentCircleUseCase.execute()`が`advanced`をcommitするとき、`selectedDestination`/`selectedRoute`を次の通常案内と同じ値へ揃えてよいが、`selectionStatus`は`idle`にする。
5. `DomRouteMapView.renderNavigation()`は候補の青線を`selectionState === "comparing"`の場合だけ描画する。`ready`、`idle`、`loading`、`error`、`calculating`ではcandidate overlayを描画しない。
6. `ChangeDestinationUseCase.confirm()`では`currentDestination`/`currentRoute`だけを差し替えない。既存`RouteGuidanceNavigationOperations.handleManualTarget()`を再利用し、同じcommitで少なくとも次を一致させる。
   - `navigationState.targetSpace`
   - `navigationState.lockedFirstLeg.toSpace`
   - `currentDestination.space`
   - `selectedDestination.space`
   - `currentRoute`
   - `selectedRoute`
7. `handleManualTarget()`が失敗する、または返却された`NavigationState`が選択候補をtargetとして成立していない場合はSessionを部分更新しない。現在経路と現在目的地を維持する。
8. confirm成功後は`selectionStatus`を`idle`へ戻す。confirm失敗時は現在案内を維持し、成功したような戻り値を返さない。
9. 案内開始直後、購入後進行直後、再開直後について、通常案内の赤線だけが描画対象になる状態をテストで固定する。
10. 経路変更確定後に購入済みを実行するintegration testを追加し、`FinishCurrentCircleUseCase`が`ignored`にならず次の目的地へ進むことを確認する。

## テスト方針

最低限、次をテストする。

- 新規案内開始後は`selectionStatus === "idle"`で、current/selectedが同じ経路でも候補扱いしない。
- 通常の`advanced`後は`selectionStatus === "idle"`。
- 案内再開後も通常案内は`idle`のままである。
- `ready`では候補routeが存在してもcandidate overlayを描画しない。
- `comparing`でだけcandidate overlayを描画する。
- confirm後はNavigationStateと表示中目的地が一致する。
- confirm後の購入で次のpending circleへ進む。
- confirm失敗時はcurrent route、current destination、NavigationStateを変更しない。
- current/selectedが同じ値であることだけを根拠に候補線を描画しない。

## 検証コマンド

```bash
npx vitest run tests/start-route-guidance.test.ts tests/finish-current-circle.test.ts tests/route-guidance-controller.test.ts tests/purchase-flow.test.ts
npm run test:route-guidance
npm run check:webapp
git diff --check
```

## 受入条件

- 案内開始、案内再開、通常の次目的地表示で青い候補線が表示されない。
- 青い候補線は明示的に経路比較へ入った間だけ表示される。
- 経路変更確定後、表示目的地とNavigationStateの目的地が一致する。
- 経路変更確定後に購入済みを押すと次のサークルへ進む。
- 既存の候補計算、比較、cancelの正常系を壊さない。

## 予定コミットメッセージ

`fix(route-guidance): align confirmed destination state`
