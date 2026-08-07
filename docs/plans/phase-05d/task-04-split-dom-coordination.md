# フェーズ5D タスク4: ComiPathDomCoordinatorをfeature別Viewへ解体

## 目的

`ComiPathDomCoordinator`に残っているDOM lookup、表示更新、route controls、gallery/progress、toast、settings bridgeを、すでに存在するfeature別DOM Viewとshared UIへ移し、巨大なUI coordinatorを削除する。

新しい汎用`UIManager`やPage Coordinatorは作らない。

## 対象外

- DOM ID、ARIA、focus behavior、表示内容の意図的変更
- CSS redesign
- Lit componentの全面書き換え
- business stateをViewへ移すこと

## 前提と依存関係

Task 3完了後に実施する。Viewが`EventDayDataStore`を受け取らず、featureのmodelまたはpublic actionだけで動作できる状態を前提とする。

## 読むべき文書と既存実装

- `apps/webapp/js/comipath-dom-coordinator.js`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-current-location-form-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-progress-view.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/features/circle-data-source/ui/dom-circle-data-source-view.ts`
- `apps/webapp/js/features/event-day/ui/dom-event-day-selector-view.ts`
- `apps/webapp/js/features/local-data-deletion/ui/dom-local-data-deletion-view.ts`
- `apps/webapp/js/shared/ui/dom-user-notification-view.ts`
- `tests/feature-dom-views.test.ts`
- `tests/navigation-view-model-split.test.ts`

## 対象ファイル

### 作成

原則なし。既存Viewに明確に属さないDOM責務が残った場合も、まず既存componentまたはshared UIの責務かを確認する。単なる移し先として新しい汎用Coordinatorを作らない。

### 変更

- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-current-location-form-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-progress-view.ts`
- `apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view.ts`
- `apps/webapp/js/features/circle-data-source/ui/dom-circle-data-source-view.ts`
- `apps/webapp/js/features/event-day/ui/dom-event-day-selector-view.ts`
- `apps/webapp/js/features/local-data-deletion/ui/dom-local-data-deletion-view.ts`
- `apps/webapp/js/shared/ui/dom-user-notification-view.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/comipath-browser-runtime.js`
- `tests/feature-dom-views.test.ts`
- `tests/navigation-view-model-split.test.ts`
- UI componentの既存unit tests

### 削除

- `apps/webapp/js/comipath-dom-coordinator.js`

## 実装手順

1. `ComiPathDomCoordinator`のfield/methodを、route guidance、circle status、circle data source、event/day、local deletion、shared notificationのどれに属するか分類する。
2. route target、route comparison、current location、route mapはRoute Guidanceの既存Viewへ移す。Viewには完成したscreen modelまたは明示的な入力だけを渡す。
3. progress/galleryはCircle Statusの既存Viewへ移す。Viewからactive stateやrepositoryを直接読む構造にしない。
4. source/settings表示はCircle Data Sourceの既存Viewと`comipath-settings` componentのproperty/event境界へ寄せる。
5. event/day selectorとlocal deletion dialogは各feature Viewへ寄せる。
6. toast timerは`DomUserNotificationView`を唯一のownerにし、別timerを残さない。
7. `DomRouteMapView`がTask 1で移動したRoute Guidance moduleだけをimportするようにする。root `route-planner.ts`等へ戻さない。
8. DOM event callbackは各ControllerまたはTask 5のbrowser bindingへ渡す。ViewがUse Caseを直接生成しない。
9. production assemblyで必要なroot elementを一度取得してconcrete Viewへ渡す。各renderごとに全画面を再lookupする構造を増やさない。
10. coordinatorのdelegation callerをすべてView/Controllerへ切り替え、旧fileを削除する。

## テスト方針

happy-dom等で、各View単位に次を確認する。

- route loading/empty/current/selected/comparisonの表示
- current location inputとvalidation/focus
- route map、pins、overlayの既存描画契約
- circle progressとgallery
- source/settings state
- event/day selectorとlocal deletion
- notification timerのcleanup
- `stop()`後のlistener/timer cleanupと再start時の二重登録防止

`ComiPathDomCoordinator`のmethodを直接呼ぶ互換testは残さない。

## 検証コマンド

```bash
npx vitest run --root . tests/feature-dom-views.test.ts \
  tests/navigation-view-model-split.test.ts \
  tests/route-overlay-contract.test.ts \
  tests/settings-component.test.ts \
  tests/source-manager.test.ts \
  tests/storage-delete-dialog.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

このタスクではvisual snapshotを更新しない。E2E visual差分の最終確認はTask 7で行う。

## 受入条件

- `apps/webapp/js/comipath-dom-coordinator.js`が存在しない。
- production Viewが`EventDayDataStore`、Repository、GAS client、Worker optimizerを直接参照しない。
- route/circle/source/event-day/deletionのDOM責務が対応featureから追える。
- toast timerやDOM listenerのownerが重複していない。
- coordinatorと同等の巨大な汎用UI classを別名で作っていない。
- DOM ID、ARIA、focus、主要表示内容を意図的に変更していない。
- focused tests、webapp tests、architecture check、buildが成功する。

## 予定コミットメッセージ

```text
refactor(ui): remove dom coordinator facade
```
