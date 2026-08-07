# Phase 5D Task 8: browser bindingの責務所有を修復する

## 目的

`apps/webapp/js/app/bind-browser-events.ts`へ移ってしまったfeatureの状態、Use Case組立て、Repository/Worker生成、経路案内workflow、event/day操作、設定画面projectionを、本来の所有者へ戻す。

このTaskでは「ファイルを短くすること」自体を目的にしない。最終的に`bind-browser-events.ts`がbrowser eventを既に組み立て済みのpublic Controller/actionへ転送し、listenerを解除するだけの層になるための責務移管を行う。物理的なevent binder分割はTask 9で行う。

## Task 7で判明した問題

現行`BrowserEventBinding`はbrowser bindingだけではなく、少なくとも次を所有している。

- `StorageService`、`LocalStorageEventDayRepository`等のconcrete infrastructure生成
- circle status / GAS outboxのUse Case・Controller生成
- `RouteGuidanceSession`、route map assets loader、snapshot/matrix repository、ALNS Worker runtimeの生成
- route guidance stateのproxy propertyと更新順序
- event registry取得、event/day open
- circle purchase/hold/resetとroute guidance進行の調整
- local data deletion Use Case生成
- settings画面用model生成と表示更新
- route assets取得、candidate ranking、次目的地検索、resume/snapshot操作

これはTask 5の「browser bindingは組立て済みController/public actionを受け取る」とTask 6のguardrail方針を満たしていない。特にarchitecture checkerは現在`bind-browser-events.ts`をapp層concrete infrastructure検査から例外扱いしており、問題を検出できていない。

## 目標構造

| 責務 | 所有者 |
|---|---|
| concrete infrastructure、Session、Use Case、Controller、Viewの生成 | `app/assemble-comipath-application.ts` |
| event/day stateと切替 | `features/event-day/` |
| circle status / GAS outbox | `features/circle-status/` |
| source preview/request cancellation | `features/circle-data-source/` |
| local data deletion | `features/local-data-deletion/` |
| route state、route assets、snapshot、distance matrix、Worker lifecycle | `features/route-guidance/` |
| 複数featureをまたぐ「購入/保留後に現在サークルを完了して次へ進む」処理 | 小さなapp-level operation |
| settings shellのread-only projection | 小さなapp-level rendering function |
| DOM/window eventからpublic operationへの転送とlistener解除 | `app/bind-browser-events.ts` |

## 対象外

- UIデザイン変更
- snapshot更新
- Dijkstra、距離行列、ALNS、目的関数の変更
- 新しい汎用Runtime、Manager、Coordinator、EventBusの導入
- dependency injection frameworkの導入
- Task 9で行うevent binderの物理分割
- 行数上限をarchitecture ruleとして追加すること

## 対象ファイル

### 作成

- `apps/webapp/js/app/complete-circle-visit.ts`
  - purchase/holdとRoute Guidance進行をまたぐ処理だけを持つ。
  - DOM、Repository concrete class、Worker、fetchを知らない。
- `apps/webapp/js/app/render-settings-screen.ts`
  - featureのread-only query/resultから既存settings shellへ表示modelを反映する。
  - stateを所有せず、mutation workflowを持たない。
- `tests/browser-binding-ownership.test.ts`
  - `BrowserEventBinding`が注入済みoperationだけを呼ぶことと、feature stateを所有しないことをfocusedに固定する。

### 変更

- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/bind-browser-events.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`（公開contract追加が必要な場合のみ）
- 必要に応じて既存の各feature Controller / Use Case。ただし責務をそのfeatureへ戻すための変更に限定する。
- `scripts/check-webapp-architecture.mjs`
- `tests/architecture-boundaries.test.mjs`
- `tests/application-assembly.test.ts`
- `tests/browser-application-lifecycle.test.ts`
- `tests/apps-behavior-characterization.test.ts`
- `tests/purchase-flow.test.ts`
- `tests/production-event-day-source-wiring.test.ts`
- route guidanceの既存focused tests

### 削除

原則なし。`BrowserEventBinding` class自体の置換・削除はTask 9で行う。

## app-level operation

`complete-circle-visit.ts`は複数featureにまたがるためapp層に置く。単一featureの処理をここへ移してはいけない。

```ts
export type CircleVisitAction = "purchase" | "hold";

export interface CompleteCircleVisitInput {
  readonly circleSpace: string;
  readonly action: CircleVisitAction;
}

export interface CompleteCircleVisitOperation {
  execute(input: CompleteCircleVisitInput): Promise<void>;
}
```

内部では注入されたpublic contractだけを使う。

1. active event/dayを取得する。
2. `CircleStatusController`のpublic operationでstatusを変更する。
3. 変更後のpending circlesをreaderから取得する。
4. 完了したcircleが現在のroute targetなら`RouteGuidanceController.finishCurrentCircle(...)`を呼ぶ。
5. 表示更新はfeature Session/Viewの通知結果を使い、DOMを直接触らない。

GAS送信、LocalStorage保存、route計算をこのoperation自身で実装しない。

## Route Guidanceの責務移管

`bind-browser-events.ts`から次の処理をRoute Guidance featureへ戻す。

- route map assets取得とcurrent locationのgrid endpoint解決
- route start / resume / reset
- destination select / preview / compare / confirm / cancel
- current route / selected route / optimization generationのstate更新
- snapshot save / clear / validation
- distance matrixとALNS Workerのlifecycle
- route completion後の次destination決定

既存`RouteGuidanceController`、`RouteGuidanceSession`、`StartRouteGuidanceUseCase`、`ResumeRouteGuidanceUseCase`、`ChangeDestinationUseCase`、`FinishCurrentCircleUseCase`、`RouteGuidanceRuntimeController`等を再利用する。足りないoperationがある場合は、まず既存Controllerの依存contractを追加する。第二の`RouteGuidanceRuntime`やapp-level route facadeを作らない。

`RouteGuidanceController`がconcrete infrastructureをimportしてはいけない。snapshot/asset/optimizerが必要なら既存のUse Case contractを依存として受ける。

## Event Day / Circle Data Sourceの責務移管

- `event-day-select`は既存`EventDaySelectorController.start()`がlistenerを所有しているため、global bindingで二重登録しない。
- event registry取得は`BrowserEventBinding`から外し、composition/startup側でロードして`SwitchEventDayUseCase`と`EventDaySelectorController`を構築する。
- `options.registry`が渡されたtestではHTTP取得を行わない。
- Circle Data Sourceのrequest token、AbortController、busy、previewは既存`CircleDataSourceSession`/Controllerを正本とし、`BrowserEventBinding`からmethod wrapperやstate proxyを削除する。

## Local Data Deletion / GAS outbox

- `DeleteLocalDataUseCase`、`LocalDataDeletionController`、`PendingGasUpdatesController`はcomposition rootで一度だけ生成する。
- `BrowserEventBinding`内のgetterやlazy factoryで再生成しない。
- browser event側は選択・確定・取消・retry/discardを対応Controllerへ転送するだけにする。

## settings projection

`render-settings-screen.ts`は既存`shared/ui/management-view-model.ts`等のpure model builderを再利用し、read-only情報をsettings componentへ反映する。

ここへ次を入れない。

- Repository write
- GAS request
- source preview mutation
- deletion実行
- route guidance mutation
- event listener登録

## composition rootの変更

`assemble-comipath-application.ts`で次を明示的に一度だけ生成する。

- event/day repository、session、reader、registry/manifest loader、Controller
- circle status / GAS outbox Use CasesとControllers
- circle data source session、Use Cases、Controller
- local data deletion Use Case、Controller
- route guidance session、assets loader、snapshot/matrix repository、Worker runtime、Use Cases、Controller
- `CompleteCircleVisitOperation`
- settings rendering functionに渡すread-only dependencies
- 最後に`BrowserEventBinding`

依存関係を隠すためだけのfactory群には分けない。composition rootが長くなること自体は不合格理由にしない。

## architecture checker修正

現行checkerの次の例外を削除する。

```text
!importer.endsWith("/bind-browser-events.ts")
```

これにより`bind-browser-events.ts`も他の非composition-root app moduleと同じくconcrete infrastructure importを禁止する。

加えて非composition-root `app/` moduleについて、少なくとも次の直接所有を検出するfocused rule/testを追加する。

- `localStorage`
- `new Worker(...)`
- repository/client/loader/optimizer等のconcrete infrastructure import

`document`、`window`、`addEventListener`自体はbrowser bindingの正当な責務なので禁止しない。

## 実装手順

1. `bind-browser-events.ts`のfield、constructor生成物、methodを責務表へ分類する。
2. 既存featureに同じUse Case/Controller/Sessionがあるものは新規実装せず、それをproduction assemblyへ接続する。
3. composition rootへconcrete infrastructure生成を移す。
4. Route Guidanceのbusiness workflowとstate mutationをfeature Controller/Use Caseへ移す。
5. event/day、circle data source、deletion、outboxの既存Controllerを直接利用し、binding側のduplicate wrapperを削除する。
6. cross-feature circle completionだけを`complete-circle-visit.ts`へ切り出す。
7. settings read-only projectionだけを`render-settings-screen.ts`へ切り出す。
8. `BrowserEventBinding`のconstructorを、組立て済みpublic operation/View/queryのみ受け取る形へ変更する。
9. `// @ts-nocheck`を削除し、binding dependencyをTypeScriptで型検査できる状態にする。
10. architecture checkerの`bind-browser-events.ts`例外を削除し、negative fixture testを追加する。
11. production behavior focused testsを実行し、Task 9へ進める状態を確認する。

## テスト方針

- composition rootが各Repository/Session/Controllerを一度だけ生成する。
- bindingをfake operation群で構築でき、Repository/Worker等を要求しない。
- event/day/sourceの既存Controllerがlistenerを所有し、global bindingで同じeventを二重処理しない。
- purchase/holdのlocal-first保存とGAS outbox semanticsを維持する。
- purchase/hold後のRoute Guidance進行が維持される。
- route start/resume/selection/snapshot behaviorを維持する。
- stop後にstale callbackがfeature stateを変更しない。
- checkerが`bind-browser-events.ts`からconcrete infrastructure importや`new Worker`を検出する。

## 検証コマンド

```bash
npx vitest run --root . \
  tests/browser-binding-ownership.test.ts \
  tests/application-assembly.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/purchase-flow.test.ts \
  tests/production-event-day-source-wiring.test.ts \
  tests/architecture-boundaries.test.mjs
npm run test:route-guidance
npm run test:phase-05d-regressions
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

Task 8ではvisual snapshotを更新しない。E2E screenshot差分はTask 10で判断する。

## 受入条件

- `bind-browser-events.ts`がRepository、storage、HTTP loader、GAS client、route algorithm、snapshot/matrix repository、Workerを生成しない。
- `bind-browser-events.ts`がRoute Guidanceやevent/dayのmutable state正本を持たない。
- source request token/AbortControllerをbindingが所有しない。
- `assemble-comipath-application.ts`からproduction dependency graphを追える。
- 既存feature Controller/Use Caseを別名で複製していない。
- `BrowserEventBinding`は注入済みoperationへのevent転送とlistener cleanupだけに縮小している。
- `// @ts-nocheck`が`bind-browser-events.ts`から消えている。
- architecture checkerから`bind-browser-events.ts`特例が消え、再肥大化の主要原因を検出できる。
- focused tests、unit tests、typecheck、buildが成功する。

## 予定コミットメッセージ

```text
refactor(app): restore browser binding ownership boundaries
```
