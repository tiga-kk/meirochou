# Phase 5D Task 8: browser bindingの責務所有を修復する

## 目的

`apps/webapp/js/app/bind-browser-events.ts`へ移ってしまったfeatureの状態、Use Case組立て、Repository/Worker生成、経路案内workflow、event/day操作、設定画面projectionを、本来の所有者へ戻す。

このTaskでは「ファイルを短くすること」自体を目的にしない。最終的に`bind-browser-events.ts`がbrowser eventを組み立て済みのpublic Controller/actionへ転送し、listenerを解除するだけの層になるための責務移管を行う。物理的なevent binder分割はTask 9で扱う。

既存feature Controller/Use Caseは移管先の骨格として再利用するが、現在のproduction behaviorより優先される完成仕様とは扱わない。現行`bind-browser-events.ts`にしか残っていない挙動を先にcharacterizationし、その挙動をfeature側へ移したことを確認してから旧処理を削除する。

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
- route assets取得、candidate ranking、route start/resume/selection/snapshot処理

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
| 複数featureをまたぐ購入/保留操作の順序調整 | 必要最小限のapp-level function |
| settings shellの表示集約 | 既存feature Viewとpure model builder。残る横断表示だけ必要なら小さなread-only function |
| DOM/window eventからpublic operationへの転送とlistener解除 | `app/bind-browser-events.ts` |

## 対象外

- UIデザイン変更
- snapshot更新
- Dijkstra、距離行列、ALNS、目的関数の変更
- 新しい汎用Runtime、Manager、Coordinator、EventBusの導入
- dependency injection frameworkの導入
- Task 9で行うevent binderの物理分割
- 行数上限をarchitecture ruleとして追加すること
- 既存feature Controllerを置き換えるためだけのapp-level Facade追加

## WIP再開時の段階ゲート

2026-08-07のWIP `24cf35fa9724e4b433e2c2573bf8b17d173481c2`は、基準コミット`ac8f2b035b3bf22b3ed03221eceebb8ccbf3f63a`上でTask 8を二度委譲した結果である。WIP commit自体はreset/rebase/amend等で消さず、その上から再開する。

WIPではTask 8全体の責務移管より先に、次のend-state作業だけが進んだ。

- `bind-browser-events.ts`から`// @ts-nocheck`を削除し、広い`any`/index signatureで型エラーを埋め始めた。
- architecture checker本体を変える前に、未実装ruleを要求するnegative fixtureを追加した。
- `complete-circle-visit.ts`を作る前に、それをimportするownership testを追加した。

この状態でfocused test/typecheckを停止条件にすると、まだ実装していない完成形を先に要求するため同じ失敗を繰り返す。以後はTask 8全体を一回で委譲せず、次のStageを一つずつ完了させる。一回の実装担当へ複数Stageをまとめて渡さない。

### Stage 8A: WIPを安全な中間baselineへ戻す

最初の一回はこれだけを行う。production behaviorや責務配置はまだ変更しない。

- `bind-browser-events.ts`の`// @ts-nocheck`削除はStage 8Fまで延期してよい。必要なら通常の新規commitで一時的に復元する。
- WIPで追加した`[key: string]: any`や、`@ts-nocheck`削除を通すためだけの広い`any`注釈は最終設計として固定しない。baselineへ戻す際に不要なら除去する。
- `tests/browser-binding-ownership.test.ts`の、未作成`complete-circle-visit.ts`をimportするtestは現時点のproduction contractを証明していない。Stage 8Dまで延期し、WIP commit履歴と本書に意図を残す。不存在moduleをstubで作ってtestだけ通してはいけない。
- `tests/architecture-boundaries.test.mjs`の未実装ruleを要求するnegative fixtureはStage 8Gまで延期する。checkerを現行binderが違反したまま先に厳格化しない。
- WIPの「最終的に何を検出・証明したいか」という意図は維持するが、現時点で必ずredになるtest行を保持すること自体を目的にしない。

Stage 8Aの完了条件は、基準コミットで成功していたproduction挙動を変えず、WIP履歴を保持したまま通常のWebapp unit/type/build検証へ戻れることである。Task 8の最終ownership条件はまだ満たさなくてよい。

最低限の確認:

```bash
npm run verify:webapp
git diff --check
```

Stage 8Aでarchitecture checkerの新rule、Route Guidance workflow、`complete-circle-visit.ts`、snapshotを実装しない。

### Stage 8B: 既存composition rootと重複する非Route Guidance組立てだけを移す

Stage 8AがGREENになってから行う。

- `assemble-comipath-application.ts`が既に生成しているevent/day、circle status/GAS outbox、circle data sourceのRepository/Session/Controller/background processを`BrowserEventBinding`側で再生成しない。
- local data deletionの生成もcomposition rootへ寄せるが、Route Guidanceのworkflow/state移管はまだ行わない。
- productionの`BrowserEventBinding`はこれらを注入で受ける。
- test用fallbackとしてconcrete infrastructure生成をbinderに残さない。必要ならtest側でfake dependencyを渡す。
- listener二重startを増やさない。

このStageでRoute Guidanceのconcrete import/state proxyがbinderに残っていても一時的には許容する。architecture最終testをここでGREENにするためだけにRoute Guidanceまで同時変更しない。

主な検証:

```bash
npx vitest run --root . \
  tests/application-assembly.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/production-event-day-source-wiring.test.ts \
  tests/apps-behavior-characterization.test.ts
npm run test:webapp
npm run check:webapp
git diff --check
```

### Stage 8C: Route Guidanceの生成物とmutable state ownershipを移す

- `RouteGuidanceSession`、assets loader、snapshot/matrix repository、Worker runtime、Use Case、Controllerをcomposition root/Route Guidance featureで一度だけ生成する。
- `BrowserEventBinding`からRoute Guidance concrete infrastructure import、`Object.defineProperties`によるstate proxy、独自selected/current route stateを除く。
- このStageでは既存production workflowの実装場所を移す準備をし、purchase/hold/destination/resume semanticsを簡略化しない。

### Stage 8D: Route Guidance workflowとcross-feature購入・保留処理を移す

- destination selection、purchase、hold、resume、route再構築失敗時整合性を既存production behaviorのcharacterizationに合わせてfeature Use Case/Controllerへ移す。
- ここで初めて`complete-circle-visit.ts`を作成し、status mutationとRoute Guidance進行のcross-feature順序だけを持たせる。
- Stage 8Aで延期した`completeCircleVisit` focused testを、purchase/hold差・非current target・status失敗を含む現行contractに合わせて追加する。WIPの単純な「常にstatus→finishCurrentCircle」だけを完成仕様にしない。

### Stage 8E: 残るduplicate wrapperとsettings projectionを整理する

- event/day、circle data source、local deletion、outboxのduplicate state/request wrapperを削除する。
- settings表示を既存View/pure builderへ寄せる。
- 新しい巨大parameter object/Façadeへ移しただけの実装を作らない。

### Stage 8F: binder contractを型で固定する

- Stage 8B〜8Eで責務移管が完了してから`// @ts-nocheck`を最終的に削除する。
- binder dependenciesを実際に必要なpublic operation/View/queryだけの明示型にする。
- `[key: string]: any`や広い`any`でtypecheckを黙らせない。

### Stage 8G: architecture guardrailとTask 8最終検証

- 最後にcheckerの`bind-browser-events.ts`特例を削除する。
- `application-imports-concrete-infrastructure`、`localStorage`、`new Worker(...)`のnegative fixtureと、正当なDOM/public-api importのpositive fixtureを追加する。
- Stage 8Aで延期したownership/architecture testを最終sourceに対して復活・強化する。
- Task 8の全検証コマンドと受入条件をここで初めて一括適用する。

## 対象ファイル

### 作成

- `apps/webapp/js/app/complete-circle-visit.ts`
  - circle status変更とRoute Guidance進行の間に本当に必要なcross-feature順序だけを持つplain functionとする。
  - class、generic operation framework、base interfaceは作らない。
  - DOM、Repository concrete class、Worker、fetchを知らない。
- `tests/browser-binding-ownership.test.ts`
  - bindingが注入済みoperationだけを呼ぶことと、feature state/concrete infrastructureを所有しないことをfocusedに固定する。

`apps/webapp/js/app/render-settings-screen.ts`は必須作成物ではない。既存feature Viewと`shared/ui/management-view-model.ts`のpure builderを接続した後にも複数featureをまとめるread-only projectionが残る場合だけ作る。単に`updateManagementModels()`を別ファイルへ移しただけの新Facadeになるなら作らない。

### 変更

- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/bind-browser-events.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/use-cases/change-destination.ts`
- `apps/webapp/js/features/route-guidance/use-cases/finish-current-circle.ts`
- `apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/route-guidance-runtime-controller.ts`
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

原則なし。`BrowserEventBinding` class自体の物理的な置換はTask 9で扱う。

ただしTask 8の責務移管中にclassを残すためだけのproxy getter/setterや互換methodを新設してはいけない。既存proxyはcaller切替後に削除する。

## cross-feature購入・保留処理

`complete-circle-visit.ts`は複数featureにまたがる順序だけを持つ。productionのpurchaseとholdは同じRoute Guidance遷移ではないため、単に「statusを変えて`finishCurrentCircle()`を呼ぶ」実装へ縮退させてはいけない。

必要な性質:

1. status mutationは既存Circle Status public operationを通し、local-first保存とGAS outbox semanticsを維持する。
2. status保存が失敗した場合はRoute Guidanceを進めない。
3. GAS送信失敗はlocal mutationをrollbackせず、既存どおり未送信データとして保持する。
4. action対象が現在のRoute Guidance targetでない場合、statusだけを更新し、案内のcurrent target/current positionを勝手に進めない。
5. `purchase`で現在targetを完了する場合は、現在位置を購入したcircleの確定位置へ進めた上で次targetを選ぶ。
6. `hold`で現在targetを保留する場合は、現在位置を進めず、直前の確定位置から次targetへ進む。
7. 次targetへのroute再構築に失敗した場合も、すでに成功したstatus mutationをrollbackしない。一方、Route Guidance Sessionへ「新targetなのにrouteが旧targetのまま」のような不整合状態をcommitしない。
8. pending circleがなくなった場合は既存どおり案内を終了/idle化する。

app-level function自身がgrid geometry、snapshot schema、distance matrix、ALNS Workerを扱ってはいけない。上記5〜8はRoute Guidance Controller/Use Caseへ明示的なpublic operationとして渡し、そこで処理する。

既存`FinishCurrentCircleUseCase`は現状、`remainingCircles`の先頭をdestinationへ入れ替えるだけであり、productionのarrival/hold差、navigation state、route再構築、snapshotを再現していない。既存class名があることだけを理由にそのまま接続しない。

## Route Guidanceの責務移管

`bind-browser-events.ts`から次の処理をRoute Guidance featureへ戻す。

- route map assets取得とcurrent locationのgrid endpoint解決
- route start / resume / reset
- destination select / preview / compare / confirm / cancel
- current route / selected route / optimization generationのstate更新
- snapshot save / clear / validation
- distance matrixとALNS Workerのlifecycle
- purchase後のarrival処理、hold前の位置維持、次destination決定とroute再構築

既存`RouteGuidanceController`、`RouteGuidanceSession`、`StartRouteGuidanceUseCase`、`ResumeRouteGuidanceUseCase`、`ChangeDestinationUseCase`、`FinishCurrentCircleUseCase`、`RouteGuidanceRuntimeController`等を再利用する。ただし、次の現行骨格不足をproduction behaviorへ合わせて埋める。

- `ChangeDestinationUseCase`は現在selected circleをSessionへ入れるだけで、candidate route計算・失敗時のcurrent route維持を行わない。
- `FinishCurrentCircleUseCase`は現在remaining配列の先頭を選ぶだけで、purchase/holdの異なる位置遷移とroute再構築を行わない。
- `ResumeRouteGuidanceUseCase`は現在current route/distance matrix/optimization warm start等を復元していない。

これらを補う際も第二の`RouteGuidanceRuntime`やapp-level route facadeを作らない。既存Use Case/Controller/Runtime Controllerの責務へ必要最小限のoperationを追加する。

Route Guidanceの状態変更は原則として、必要なgeometry/asset取得やvalidationが成功した後に一回のSession commitへまとめる。途中状態をSessionへ書き、後続route計算失敗時に戻す方式を新規導入しない。

## Event Day / Circle Data Sourceの責務移管

- `event-day-select`は既存`EventDaySelectorController.start()`がlistenerを所有しているため、global bindingで二重登録しない。
- event registry取得は`BrowserEventBinding`から外し、startup/composition側で一度だけロードして`SwitchEventDayUseCase`と`EventDaySelectorController`を構築する。
- `options.registry`が渡されたtestではHTTP registry取得を行わない。
- 初期event/day openとevent/day切替で別の`SwitchEventDayUseCase`や別manifest経路を組み立てない。
- Circle Data Sourceのrequest sequence、CancelableRequest、busy、previewは既存`CircleDataSourceSession`/Controllerを正本とし、`BrowserEventBinding`から独自token/AbortController wrapperやstate proxyを削除する。

startup順序の変更でbackground process、EventDay Controller、Circle Data Source Controllerを二重startしない。各lifecycle participantはcomposition rootから一度だけstart/stopされることをtestする。

## Local Data Deletion / GAS outbox

- `DeleteLocalDataUseCase`、`LocalDataDeletionController`、`PendingGasUpdatesController`はcomposition rootで一度だけ生成する。
- `BrowserEventBinding`内のgetterやlazy factoryで再生成しない。
- event側は選択・確定・取消・retry/discardを対応Controllerへ転送するだけにする。
- 削除後のactive event/day再選択やRoute Guidance invalidationのようなcross-feature後処理が必要なら、`DeleteLocalDataUseCase`自体へconcrete featureを埋め込まず、composition rootから注入する明示的なcallback/operationで接続する。

## settings表示

まず既存`shared/ui/management-view-model.ts`のpure model builderと各feature Viewを再利用する。

新しいsettings projection functionが必要な場合も、read-only query/resultから既存settings shellへ表示modelを反映するだけとする。ここへ次を入れない。

- Repository write
- GAS request
- source preview mutation
- deletion実行
- route guidance mutation
- event listener登録
- busy/request token等のmutable state所有

`updateManagementModels()`の全依存を一つの巨大parameter objectへ移しただけなら責務移管とは扱わない。可能な項目は各featureのSession/View購読で更新し、cross-feature集計だけをapp層に残す。

## composition rootの変更

`assemble-comipath-application.ts`で次を明示的に一度だけ生成する。

- event/day repository、session、reader、registry/manifest loader、Controller
- circle status / GAS outbox Use CasesとControllers
- circle data source session、Use Cases、Controller
- local data deletion Use Case、Controller
- route guidance session、assets loader、snapshot/matrix repository、Worker runtime、Use Cases、Controller
- cross-feature購入/保留functionに渡すpublic operation
- settings表示に本当に必要なread-only dependencies
- 最後にbrowser binding

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

`document`、`window`、`addEventListener`自体はbrowser bindingの正当な責務なので禁止しない。文字列名だけで広範囲を誤検出するruleを増やさず、fixtureで「本当に禁止したい依存」と「正当なbrowser binding」を両方固定する。

## 実装手順

以下はTask 8全体の論理順序である。WIPからの再開では上記Stage 8A〜8Gを優先し、一回の実装担当が複数Stageを跨がない。

1. `bind-browser-events.ts`のfield、constructor生成物、methodを責務表へ分類する。
2. 移管前に、Route Guidanceのdestination selection、purchase、hold、resume、route再構築失敗、event/day切替、source cancellationのproduction characterizationを確認する。既存testで証明できないものだけfocused testを追加する。
3. 既存featureに同じUse Case/Controller/Sessionがあるものは新規実装せず、それをproduction assemblyへ接続する。ただし既存骨格がproduction behaviorを満たさない場合は骨格側を修正する。
4. composition rootへconcrete infrastructure生成を移す。
5. Route Guidanceのbusiness workflowとstate mutationをfeature Controller/Use Caseへ移す。
6. event/day、circle data source、deletion、outboxの既存Controllerを直接利用し、binding側のduplicate wrapperを削除する。
7. cross-feature circle completionだけを`complete-circle-visit.ts`へ切り出す。app-level class/interface階層は追加しない。
8. settings表示は既存View/pure builderへ寄せ、残ったcross-feature read-only projectionが十分大きい場合だけ専用functionへ切り出す。
9. `BrowserEventBinding`のconstructorを、組立て済みpublic operation/View/queryのみ受け取る形へ変更する。
10. `// @ts-nocheck`を削除し、binding dependencyをTypeScriptで型検査できる状態にする。
11. architecture checkerの`bind-browser-events.ts`例外を削除し、negative/positive fixture testを追加する。
12. production assemblyから実eventを一つ以上通し、fake operationだけではなく実Controller/Sessionへ到達することをcharacterizationで確認する。
13. focused unit/type/build verificationを実行し、Task 9へ進める状態を確認する。

## テスト方針

- composition rootが各Repository/Session/Controller/background process/Worker runtimeを一度だけ生成・startする。
- bindingをfake operation群で構築でき、Repository/Worker等を要求しない。
- event/day/sourceの既存Controllerがlistenerを所有し、global bindingで同じeventを二重処理しない。
- purchase/holdのlocal-first保存とGAS outbox semanticsを維持する。
- purchase時はcurrent positionが購入circleへ進み、hold時はcurrent positionを進めない。
- purchase/hold後の次target route再構築と、再構築失敗時のSession整合性を維持する。
- destination選択でcandidate route計算失敗時にcurrent target/current routeを壊さない。
- resume時に既存snapshot validation、route再構築、必要なoptimization warm start semanticsを維持する。
- dev demo経路がproductionの責務境界を逆流させず、既存`?demo_ui=1` characterization/E2Eを壊さない。
- stop後にstale callbackがfeature stateを変更しない。
- checkerが`bind-browser-events.ts`からconcrete infrastructure importや`new Worker`を検出する一方、正当なDOM event bindingは許可する。

fakeだけの`browser-binding-ownership.test.ts`をproduction接続の証明にしない。`application-assembly`またはcharacterizationで、composition root→browser event→public Controller/Use Case→Session/Repositoryの代表経路を少なくとも一つ確認する。

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

- `bind-browser-events.ts`がRepository、storage、HTTP loader、GAS client、route algorithm、snapshot/matrix repository、Workerを生成・deep importしない。
- `bind-browser-events.ts`がRoute Guidanceやevent/dayのmutable state正本またはproxy propertyを持たない。
- source request token/AbortController/busy laneをbindingが所有しない。
- `assemble-comipath-application.ts`からproduction dependency graphを追える。
- 既存feature Controller/Use Caseを別名で複製していない。
- purchaseとholdの異なるRoute Guidance位置遷移、次route再構築、失敗時整合性がfeature側で維持されている。
- destination selectionとresumeが現行production behaviorを失っていない。
- settings表示を別の巨大app-level projectionへ移していない。
- `BrowserEventBinding`は注入済みoperationへのevent転送とlistener cleanupだけに縮小している。
- `// @ts-nocheck`が`bind-browser-events.ts`から消えている。
- architecture checkerから`bind-browser-events.ts`特例が消え、再肥大化の主要原因を検出できる。
- focused tests、unit tests、typecheck、buildが成功する。

## 予定コミットメッセージ

```text
refactor(app): restore browser binding ownership boundaries
```
