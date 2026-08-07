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
- `apps/webapp/js/features/event-day/public-api.ts`
- `apps/webapp/js/features/event-day/use-cases/active-event-day-session.ts`
- `apps/webapp/js/features/event-day/use-cases/active-event-day-reader.ts`
- `apps/webapp/js/features/event-day/use-cases/switch-event-day.ts`
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
6. `SwitchEventDayUseCase`の現在のold-style constructor互換分岐を削除し、composition rootが明示的な依存を一つの形で渡すようにする。外部挙動は変えない。
7. `activateLegacySession`、deprecated undo/redo、旧method alias等、production callerが存在しないtest compatibilityは新構造へ移植せず削除し、testsをpublic feature contractへ書き換える。
8. legacy import preview/applyにproduction callerがないことをrepository-wide searchで確認できた場合は削除する。callerがある場合だけ上記の専用Use Caseへ移す。
9. `assemble-comipath-application.ts`で各feature dependencyを一度だけ生成し、Facade内部で再度Use Caseを組み立てる構造をなくす。
10. 全callerを切り替えた後、`EventDayDataStore`を削除する。

## テスト方針

既存Facadeのmethodを直接試すtestではなく、次を検証する。

- event/day切替後にactive sessionとrepositoryが一致する。
- purchase/hold等がlocal-firstで保存され、必要なGAS outboxが生成される。
- source import/refreshがactive event/dayへ反映される。
- production assemblyから各feature operationへ到達できる。
- legacy/test-only compatibilityを削除してもproduction behaviorが失われない。

mockしたFacadeだけで本番接続を証明しない。

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
- composition root以外でconcrete feature dependencyを再組立てする巨大Facadeがない。
- `SwitchEventDayUseCase`に旧constructor形状を判定するcompatibility分岐が残っていない。
- test-only legacy sessionやdeprecated wrapperを別名で復活させていない。
- 関連unit/characterization tests、architecture check、buildが成功する。

## 予定コミットメッセージ

```text
refactor(event-day): remove data store facade
```
