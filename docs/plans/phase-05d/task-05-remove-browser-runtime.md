# フェーズ5D タスク5: ComiPathBrowserRuntimeを削除しbrowser bindingを明示化

## 目的

Task 2〜4でfeatureへ移した後に`ComiPathBrowserRuntime`へ残るbrowser event bindingとglobal lifecycleだけを`app/`へ明示的に置き、巨大runtime facadeを削除する。

`ComiPathApplication`は引き続き小さなlifecycle ownerとし、business workflowを戻さない。

## 対象外

- 新しい`Runtime`、`Manager`、`Coordinator`による置換
- feature内部ロジックの再設計
- UIの意図的変更
- 新機能追加

## 前提と依存関係

Task 2、3、4が完了していること。`ComiPathBrowserRuntime`にRoute Guidance state、event/day state、DOM renderingの正本が残っている場合は、このタスクで無理に移植せず、所有先featureへ戻してから削除する。

## 読むべき文書と既存実装

- `apps/webapp/js/comipath-browser-runtime.js`
- `apps/webapp/js/app/comipath-application.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/run-comipath-in-browser.ts`
- `apps/webapp/js/app/browser-entrypoint.ts`
- 各featureの`public-api.ts`とController
- `tests/application-assembly.test.ts`
- `tests/apps-behavior-characterization.test.ts`
- `tests/browser-application-lifecycle.test.ts`

## 対象ファイル

### 作成

- `apps/webapp/js/app/bind-browser-events.ts`

### 変更

- `apps/webapp/js/app/comipath-application.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/run-comipath-in-browser.ts`
- 必要なfeature Controller/Viewの`start()`/`stop()`境界
- `tests/application-assembly.test.ts`
- `tests/apps-behavior-characterization.test.ts`
- `tests/browser-application-lifecycle.test.ts`
- `tests/purchase-flow.test.ts`
- production wiringを旧runtime経由で検証している関連tests

### 削除

- `apps/webapp/js/comipath-browser-runtime.js`

`apps/webapp/js/comipath-browser-runtime.ts`は計画再作成時点のブランチには存在しない。削除対象として新規作成したり、互換wrapper/re-exportとして復活させたりしない。

## 実装手順

1. `ComiPathBrowserRuntime`の残存field/methodをrepository-wide searchで分類する。Task 2〜4の責務が残っていれば、対応featureへ移してから進む。
2. browser固有custom event、keyboard/global event、online/offline等のbindingだけを`bind-browser-events.ts`へ移す。
3. `bind-browser-events.ts`は既にassemblyされたController/public actionを引数で受け取る。Repository、GAS client、routing algorithm、Workerを生成しない。
4. event bindingの戻り値またはobjectに`stop()`を持たせ、登録したlistenerを同じownerが解除する。再startで二重登録しない。
5. timerやbackground processは、そのfeatureのlifecycle ownerが既に存在する場合はそこへ残す。global bindingへ集めるためだけに移動しない。
6. `assemble-comipath-application.ts`はconcrete infrastructure、Session、Use Case、Controller、Viewを明示的に生成し、最後にbrowser bindingsと`ComiPathApplication`へ渡す。
7. `ComiPathApplication`は各lifecycle participantをstart/stopするだけに保つ。各ユーザー操作の分岐を追加しない。
8. characterization testsは`new ComiPathBrowserRuntime()`ではなく、production assemblyまたはfeature public operationから同じ外部挙動を検証する形へ変更する。
9. runtimeへのproduction/test importが0件になったことを確認し、`.js`を削除する。存在しない`.ts`互換入口は作らない。

## テスト方針

- production assemblyがfeature Controllers/Viewsを一度だけ生成して起動する。
- public browser eventから対応Controller operationへ到達する。
- `stop()`でlistener、timer、background participantが解除される。
- stop→startで同じeventが二重処理されない。
- event/day切替、purchase/hold、route start/resume/change等の主要characterizationが旧runtimeなしで成立する。
- private runtime methodを直接呼ぶtestを残さない。

## 検証コマンド

```bash
npx vitest run --root . tests/application-assembly.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/purchase-flow.test.ts \
  tests/production-event-day-source-wiring.test.ts
npm run test:webapp
npm run test:route-guidance
npm run test:phase-05d-regressions
npm run check:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- `comipath-browser-runtime.js`が存在せず、計画再作成時点から存在しない`comipath-browser-runtime.ts`も作られていない。
- production entrypointから各featureへの処理経路が`app/`のassembly/bindingとfeature public APIで追える。
- `bind-browser-events.ts`がstate owner、Repository、routing engine、Worker factoryの役割を持たない。
- `ComiPathApplication`へ旧runtime相当の巨大なmethod群を移していない。
- listener/timer lifecycleがstop可能で、再start時に重複しない。
- testsが旧runtimeのprivate APIではなくproduction/public boundaryを検証している。
- focused tests、webapp tests、architecture check、buildが成功する。

## 予定コミットメッセージ

```text
refactor(app): remove browser runtime facade
```
