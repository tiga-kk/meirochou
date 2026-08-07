# フェーズ5D タスク3: EventDayDataStoreを削除して既存featureを直接接続

## 目的

`EventDayDataStore`がまとめているevent/day、circle status、GAS outbox、CSV import、legacy compatibilityの責務を、すでに存在する各featureのSession、Repository、Use Case、Controllerへ戻し、composition rootから直接接続する。

新しい統合Facadeは作らない。

## 対象外

- LocalStorage schema変更
- GAS/CSVの外部契約変更
- legacy data migration機能の新規追加
- Route Guidanceの状態設計変更
- UIの意図的な変更

## 前提と依存関係

Task 2完了後に実施する。Route Guidance側が`EventDayDataStore`の内部stateを正本として要求しない状態を前提とする。

## 読むべき文書と既存実装

- `apps/webapp/js/event-day-data-store.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/comipath-browser-runtime.js`の`bootstrapApp()`とevent/day初期化経路
- `apps/webapp/js/features/event-day/public-api.ts`
- `apps/webapp/js/features/event-day/use-cases/active-event-day-session.ts`
- `apps/webapp/js/features/event-day/use-cases/active-event-day-reader.ts`
- `apps/webapp/js/features/event-day/use-cases/load-event-registry.ts`
- `apps/webapp/js/features/event-day/use-cases/load-map-manifest.ts`
- `apps/webapp/js/features/event-day/use-cases/switch-event-day.ts`
- `apps/webapp/js/features/event-day/infrastructure/http-event-registry-loader.ts`
- `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`
- `apps/webapp/js/features/circle-status/public-api.ts`
- `apps/webapp/js/features/circle-data-source/public-api.ts`
- `tests/data-manager-event-day.test.ts`
- `tests/purchase-flow.test.ts`
- `tests/production-event-day-source-wiring.test.ts`

## 対象ファイル

### 作成

原則なし。

repository-wide searchで`previewLegacyImport`/`applyLegacyImport`に実際のproduction callerが存在し、機能として残す必要が確認できた場合だけ、legacy import処理を一つの明確なUse Caseへ分離する。その場合のpathは`apps/webapp/js/features/event-day/use-cases/import-legacy-event-day-state.ts`とする。

### 変更

- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/features/event-day/use-cases/switch-event-day.ts`
- 必要に応じて`apps/webapp/js/features/event-day/public-api.ts`
- `apps/webapp/js/comipath-browser-runtime.js`
- `tests/data-manager-event-day.test.ts`
- `tests/purchase-flow.test.ts`
- `tests/production-event-day-source-wiring.test.ts`
- `tests/apps-behavior-characterization.test.ts`
- event-day/circle-status/circle-data-sourceの関連unit tests

### 削除

- `apps/webapp/js/event-day-data-store.ts`

`DataManager`互換名や別名Facadeは作成しない。

## 実装手順

1. `EventDayDataStore`のpublic method/getterごとにproduction callerを`rg`で確認し、次のどの責務か分類する。
   - event/day open/switch/read
   - circle status mutation
   - pending GAS updates
   - circle data source import/refresh
   - legacy-only/test-only compatibility
2. event/dayの読み取りは`ActiveEventDayReader`、active state変更は`ActiveEventDaySession`とEvent Day Use Case、永続化は`EventDayRepository`へ直接接続する。
3. purchase/hold/reset/undo等のcircle status操作は`circle-status`のController/Use Caseをproduction callerから呼ぶ。`EventDayDataStore.addPurchased()`等のwrapperを残さない。
4. GAS outbox retry/discardは`PendingGasUpdatesController`等の既存public operationへ直接接続する。
5. CSV/GAS sourceのpreview/apply/refreshは`circle-data-source`の既存Controller/Use Caseへ直接接続する。
6. `SwitchEventDayUseCase`の現在のold-style constructor互換分岐を削除し、明示的な依存形状を一つにする。ただし、削除前にproductionで使う一つの`SwitchEventDayUseCase`へ`EventDayRepository`、検証済み`EventRegistry`、map manifestを取得する`loadManifest`相当のcollaborator、既存のswitch collaboratorを渡せるようにする。manifest loaderを持たないplaceholderの`SwitchEventDayUseCase`を先に組み立て、後から別instanceへ差し替える構造は残さない。
7. 現行productionでは`bootstrapApp()`が`loadEventRegistryWithUrl()`→対象eventのmap manifest取得・検証→`runtimeMapAreaCatalog.initializeMapAreas()`→event/day初期化の順で起動し、`EventDayDataStore.getTransitionService()`がevent切替時のmanifest loaderを`SwitchEventDayUseCase`へ渡している。`EventDayDataStore`削除時もこの二つの挙動を落とさない。Task 3の時点ではstartup ownerが一時的に`ComiPathBrowserRuntime`へ残ってもよいが、初期起動とevent/day切替が同じ検証済みregistry/manifest経路を使い、manifest準備失敗時にdurable event/day stateを先に切り替えないことを確認する。Task 5でruntimeを削除するときにstartup lifecycleの最終ownerを`app/`とfeatureへ移す。
8. `activateLegacySession`、deprecated undo/redo、旧method alias等、production callerが存在しないtest compatibilityは新構造へ移植せず削除し、testsをpublic feature contractへ書き換える。
9. legacy import preview/applyにproduction callerがないことをrepository-wide searchで確認できた場合は削除する。callerがある場合だけ上記の専用Use Caseへ移す。
10. `assemble-comipath-application.ts`では各feature dependencyを一度だけ生成する。特にevent/day切替について、manifest loaderを持たないinstanceとruntime内部で作るinstanceの二重構築を解消し、production eventから到達するoperationを一つにする。
11. 全callerを切り替えた後、`EventDayDataStore`を削除する。

## テスト方針

既存Facadeのmethodを直接試すtestではなく、次を検証する。

- event/day切替後にactive sessionとrepositoryが一致する。
- 別event/dayへのproduction切替がmanifest loaderへ到達し、`Event manifest loader is required`のようなassembly不足で失敗しない。
- manifestの取得・検証が失敗した場合、durable event/day stateを先に切り替えない。
- 初期起動でregistryと対象map manifestを読み、既存のmap area初期化を維持する。
- purchase/hold等がlocal-firstで保存され、必要なGAS outboxが生成される。
- source import/refreshがactive event/dayへ反映される。
- production assemblyから各feature operationへ到達できる。
- legacy/test-only compatibilityを削除してもproduction behaviorが失われない。

mockしたFacadeだけで本番接続を証明しない。`tests/production-event-day-source-wiring.test.ts`では、production assemblyからevent/day選択operationとmanifest loaderまでの接続を少なくとも一つ確認する。

## 検証コマンド

```bash
npx vitest run --root . tests/data-manager-event-day.test.ts \
  tests/purchase-flow.test.ts \
  tests/production-event-day-source-wiring.test.ts \
  tests/apps-behavior-characterization.test.ts
npm run test:phase-05d-regressions
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- `apps/webapp/js/event-day-data-store.ts`が存在しない。
- production sourceに`EventDayDataStore`、`DataManagerOptions`等へのimportが残っていない。
- event/day、circle status、GAS outbox、circle data sourceの責務が各feature public APIから追える。
- productionのevent/day切替operationが一つに定まり、そのoperationへ検証済みregistryとmap manifest loaderが接続されている。
- 初期起動とevent/day切替のmap manifest準備経路が`EventDayDataStore`削除によって失われていない。
- composition root以外でconcrete feature dependencyを再組立てする巨大Facadeがない。
- `SwitchEventDayUseCase`に旧constructor形状を判定するcompatibility分岐が残っていない。
- test-only legacy sessionやdeprecated wrapperを別名で復活させていない。
- 関連unit/characterization tests、architecture check、buildが成功する。

## 予定コミットメッセージ

```text
refactor(event-day): remove data store facade
```
