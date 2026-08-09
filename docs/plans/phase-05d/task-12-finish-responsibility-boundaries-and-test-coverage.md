# Phase 5D Task 12: 残存する責務境界とテスト漏れを解消する

## このTaskの位置づけ

Task 11完了後の独立レビューで、unit/type/build/E2Eは成功している一方、Phase 5Dの目的である責務分離をまだ満たしていない箇所が確認された。

このTaskは新しい機能を追加しない。Task 1〜11で導入したfeature、Use Case、Controller、Session、composition rootを再利用し、残っている責務の重複、依存方向の逆転、検証漏れだけを解消する。

独立レビューで確認したproduction codeの基準HEADは次である。

```text
9098ebe88e37332ce8e7a14d5d08497ee28ca03b
```

このSHAは診断対象を示す履歴情報であり、実装開始SHAを固定するものではない。レビュー時点では、このSHA以降のremote差分はTask 12計画、Phase README、進捗文書だけでありproduction/test codeは変わっていなかった。

実装開始時は必ずremote `feature/phase-05d`をfetchし、最新remote HEADから開始する。remoteが進んでいてproduction/test差分がある場合は、先に本Taskの前提を再評価する。上記SHAへresetして作業を開始してはいけない。

## 目的

次の状態まで整理してPhase 5Dを完了させる。

- `BrowserApplication`を、global lifecycle、browser shell、必要最小限のcross-feature orchestrationだけを持つ型付きapplication objectへ縮小する。
- initial event/dayの「候補Refを選ぶ責務」と「manifestを検証してdurable/runtime stateへcommitする責務」を分け、production startupと通常switchで同じcommit経路を使う。
- Event Dayを削除した後の次event/day選択も、同じ検証済みtransition経路を使う。
- Route Guidanceのroute assets、境界validation、route計算、snapshot、distance matrix、Worker runtimeを`features/route-guidance/`から追える状態にする。
- Route Guidance snapshotの重複contractを一本化する。
- featureの`ui/`が同featureのconcrete `infrastructure/`へ直接依存しないようにする。
- use caseが`fetch`、`localStorage`、`new Worker(...)`等のconcrete browser APIを直接所有しないようにする。
- Pending GAS UpdateとLocal Data Deletionのrequest lifecycleをfeature側のownerへ戻し、`BrowserApplication`がfeature固有のrequest version/busy stateを正本として持たないようにする。
- architecture checkerが特定の巨大application fileを例外扱いしないようにする。
- `npm run test:webapp`が、残存するwebapp unit/characterization testを手書きfile listの漏れなく実行するようにする。

ファイル行数を減らすこと自体は目的ではない。責務が正しい場所へ移った結果としてファイルが短くなることはよいが、別名の大きなclassへ処理を移すだけの変更は不合格とする。

## 外部挙動の基準

Task 12はrefactorであり、ユーザー向け挙動を変更しない。

特に次を維持する。

- 保存済みevent/dayがある場合も、startupで対応manifestを検証しmap areaを初期化してからruntime active stateを確立する。
- manifest取得・validationに失敗したevent/dayを、新しいactive event/dayとしてpartial commitしない。
- 同じevent/dayを既にruntimeでactiveにした後の再選択で、不要な二重transitionを起こさない。
- purchase/hold、GAS outbox、source preview、local deletionのTask 8〜11で固定したsemanticsを変えない。
- Route Guidance start/resume/destination change時のroute geometry、fixed first leg、snapshot、matrix、Worker stale-response無効化を変えない。
- valid snapshotでresume dialogを表示し、自動`searchNext`しない。
- invalid snapshotを破棄する。
- 始点再設定ではnavigation snapshotを破棄するが、再利用可能なdistance matrixは保持する。
- resume時にroute geometryを再構築し、再構築失敗時は再試行可能なresume状態を保持する。
- `?demo_ui=1`の既存デモ表示とroute candidate挙動を維持する。
- LocalStorage schema、snapshot schema version、matrix format、GAS/CSV contract、Dijkstra/ALNSの計算内容を変えない。

## 独立レビューで確認した問題

### 1. `BrowserEventBinding`の残存責務が`BrowserApplication`へ移っている

Task 9で`bind-browser-events.ts`は大幅に縮小したが、現行`browser-application.ts`は約1800行あり、少なくとも次を直接扱っている。

- `// @ts-nocheck`
- Event Day Repository / Session / registry / manifest startup
- Route Guidance map assets、route planner、candidate ranking、portal位置解決
- Route Guidance Sessionへの直接snapshot merge
- snapshot / distance matrix操作
- Pending GAS Updateのrequest version、busy、result/error state
- Local Data Deletionのrequest version、busy、error stateと削除後のevent/day再選択
- settings画面projection
- browser lifecycle、timer、UI通知
- dev demo用route計算

`BrowserApplication`を削除すること自体は要求しない。feature固有のstate/workflowだけを既存featureへ戻し、applicationに残す責務を明確にする。

### 2. architecture checkerが`browser-application.ts`を明示的に例外扱いしている

現行`check-webapp-architecture.mjs`は、非composition-root app moduleのconcrete infrastructure検査から`browser-application.ts`を除外している。

さらに`tests/architecture-boundaries.test.mjs`には、`browser-application.ts`からRoute GuidanceのHTTP loaderをimportしても違反にしないことを期待するfixtureがある。

これは以前`bind-browser-events.ts`だけを例外にしていた問題を別fileへ移した状態である。Task 12ではproduction codeを先に境界へ適合させ、その後この例外とpositive fixtureを削除する。

### 3. initial event/dayのownerが二重で、same-ref startupに隠れた罠がある

現在は次の二経路が存在する。

1. `BrowserApplication.bootstrapApp()` / `init()` / `openEventDay()`がregistryを読み、初期Refを決め、manifestを読み、Repositoryへ保存し、`ActiveEventDaySession`へ反映する。
2. `assemble-comipath-application.ts`が`BrowserApplication.start()`後に`EventDaySelectorController`を作成して`start()`し、`OpenInitialEventDayUseCase` / `SwitchEventDayUseCase`を使う。

さらに、単純に1の経路を削除して2へ寄せるだけでは安全ではない。

- `OpenInitialEventDayUseCase`はRefを選ぶだけで、manifest load/commitを行わない。
- `EventDaySelectorController.start()`はRepositoryに既存stateがある場合、`SwitchEventDayUseCase`を通さず`ActiveEventDaySession`へ直接setする。
- `SwitchEventDayUseCase.execute()`はRepositoryの`getLastOpenedEventDay()`がrequested Refと同じなら早期returnする。

つまり「durableなlast-opened Refが同じ」であることと「このbrowser runtimeですでにmanifest検証・map area初期化・active session確立済み」であることが混同されている。

Task 12では次を明示的に分ける。

- `OpenInitialEventDayUseCase`: startup候補Refの解決。
- `SwitchEventDayUseCase`相当のtransition: manifest preparation、durable commit、after-switch runtime反映。
- `ActiveEventDaySession`: 現在runtimeでactiveなRef/stateの正本。

初回startupでは、durable last-opened Refがrequested Refと同じでもmanifest preparationとruntime activationを省略してはいけない。一方、すでに同じRefがruntimeでactiveな状態からの再選択は不要な二重commitを起こさない。

このため早期return条件をRepositoryのlast-openedだけで判断しない。正確な修正位置は既存Controller/Use Caseの最小変更で決め、startup専用Managerを追加しない。

### 4. `SwitchEventDayUseCase`がHTTP fallbackを内包している

`SwitchEventDayUseCase`は`loadManifest`を注入できるにもかかわらず、未注入時に`globalThis.fetch`、URL解決、HTTP status確認を自分で行うfallbackを持つ。

Use Caseはmanifest取得operationへ依存し、HTTP実装はcomposition rootから既存`http-map-manifest-loader`を接続する。

`fetch`を別helperへ移してUse Caseから呼ぶだけの修正は行わない。

`options.registry`等を注入するtestでも、暗黙に`globalThis.fetch`へfallbackしてはいけない。manifestが必要なtestはmanifest loader/operationを明示的に注入するか、既存manifestを明示入力する。testのためにmanifest validationを迂回しない。

### 5. Route Guidance snapshot contractは実質3系統ある

現在は少なくとも次が存在する。

1. `features/route-guidance/use-cases/route-guidance-snapshot-repository.ts`の簡易`NavigationSnapshot`。
2. `features/route-guidance/infrastructure/local-storage-route-guidance-snapshot-repository.ts`の実際の永続化`NavigationSnapshot`。
3. `features/route-guidance/use-cases/resume-route-guidance.ts`の`ResumeNavigationSnapshot`。2とほぼ同じ実snapshot shapeを再定義している。

さらに`StartRouteGuidanceUseCase`は1を保存するcontractを持つ一方、production composition rootはそのsnapshot引数を使わず、後から`RouteGuidanceController.saveSnapshot()`を呼ぶadapterへ接続している。

このため次の問題がある。

- 型名が同じでも意味とshapeが違う。
- resume用型が実永続化shapeを複製している。
- composition rootに`loadSnapshot: () => null`と、後から差し替えるsave/clear callbackがある。
- testがprivate `.deps`へ侵入しないとproduction wiringを確認しにくい。

Task 12ではproductionで永続化するsnapshot data contractを一つにする。LocalStorage parser/repository、resume use case、runtime portが同じcontractを参照する。

ただし「infrastructureの型をそのままuse-case directoryへ移す」こと自体を目的にしない。UI ControllerへLocalStorage schema責務を押し付けないよう、snapshot生成・保存を既存Route Guidance public operationのどこが所有するかも合わせて整理する。

### 6. `RouteGuidanceController`がconcrete infrastructureへ直接依存している

現行`features/route-guidance/ui/route-guidance-controller.ts`は同featureの次を直接importしている。

- `infrastructure/local-storage-route-guidance-snapshot-repository`
- `infrastructure/route-guidance-runtime-controller`

UI Controllerはconcrete classではなく、実際に使うoperationだけを持つ非infrastructure contractへ依存する。

既存`ResumeRuntimeController`等のstructural contractを再利用・整理できるなら優先する。依存を切るためだけにsnapshot用、matrix用、worker用など複数の細かいinterface fileを量産しない。必要ならRoute Guidance runtimeに対する一つの最小portへまとめる。

### 7. Route Guidance assetsのruntime validation ownerがEvent Day infrastructureに残っている

現行`BrowserApplication.loadGridRouteAssets()`は`HttpRouteMapAssetsLoader`から受けたJSONを、`features/event-day/infrastructure/application-boundary-parsers.ts`の`parsePointsPayload()` / `parseGridMeta()`でもう一度validationしている。

一方`HttpRouteMapAssetsLoader`はJSONを`RouteMapAssets`へtype castするだけで、points/grid metadataのruntime validationを行わない。

したがってBrowserApplicationからparse呼出だけを消すと、次の既存validationまで失われる。

- image/grid dimensionの妥当性。
- OCR point/portal座標の妥当性。
- origin座標0の許可。
- identifier未解決entryのskip。
- duplicate OCR candidateを勝手にdedupeしないこと。

`parsePointsPayload` / `parseGridMeta`はRoute Guidance assetsのboundaryへ移す。実装は次のどちらか小さい方を選ぶ。

- `HttpRouteMapAssetsLoader`内のfocused private/pure parserとして持つ。
- reuse/testabilityが実際に必要なら、Route Guidance infrastructureに一つだけfocused parser moduleを作る。

Event Day側にroute asset parserを残したままre-exportして境界を偽装しない。

### 8. composition rootの型と接続に不要な迂回がある

`assemble-comipath-application.ts`には現在次がある。

- `let browserRuntime: any`
- controller作成後に差し替えるsnapshot callback
- `StartableApplication & Record<string, unknown>`へのcast
- start後に作る`eventDaySelectorController` / `switchEventDay`を、start前の値で`Object.assign()`へコピーする形
- feature Controllerから`browserRuntime` methodへ戻るcallback
- runtime catalogの`as unknown as MapAreaCatalog`

すべてを抽象化し直す必要はない。

少なくともsnapshot callbackの循環、不要な`any`/`Record<string, unknown>`、実値と一致しない公開戻り値を解消する。

feature event callbackでlate bindingが避けられない場合、1個の型付き`BrowserApplication | null`参照を残すことは許容する。それを消すためだけにEventBus、DI container、generic callback registryを導入しない。

### 9. Pending GAS Update / Local Data Deletionのfeature固有request stateがapplicationに残っている

`BrowserApplication`は現在、少なくとも次のmutable stateを持つ。

- `outboxRetryBusy`
- `outboxRequestVersion`
- `outboxResultMessage`
- `outboxErrorMessage`
- `localDeletionBusy`
- `localDeletionRequestVersion`
- `deleteErrorMessage`

`PendingGasUpdatesController`と`LocalDataDeletionController`はすでにevent lifecycleを所有しているが、request concurrency/result stateとmutation後workflowの一部はapplicationへ残っている。

Task 12では次を分ける。

- retry/discard、delete selection/confirm/cancelのfeature固有in-flight/stale request stateは対応featureが所有する。
- BrowserApplicationはfeatureのread-only状態をsettings表示へ投影してよい。
- active event/day削除後に「次Refを選ぶ → Event Day transition → Route Guidanceをinvalidateする」のように本当に複数featureをまたぐ順序だけはapplication-level orchestrationとして残してよい。

このcross-feature順序を新しいManager/Coordinator classへまとめない。既存Controller callbackまたは小さなplain functionで十分ならそれを使う。

### 10. `test:webapp`の手書き列挙から複数のtestが漏れている

`tests/navigation-runtime-startup.test.ts`は削除済み`comipath-browser-runtime.js`をimportしたまま残っているが、`npm run test:webapp`の手書きfile listに含まれないためCIで検出されない。

しかし漏れはこの1 fileだけではない。現行repositoryには、手書き`test:webapp`一覧へ含まれていないwebapp testが複数存在する。レビュー時点で確認できる例には次がある。

- distance matrix関連test。
- navigation runtime/controller/state関連test。
- route-guidance module boundary / Task 2 regression test。
- `tests/task10-demo-route-regression.test.mjs`。
- 一部の旧service/removed-file test。

ここで「漏れているtestを全部package.jsonへ手で追加する」修正は行わない。

まず現存する全`tests/**/*.{test,spec}.*`をowner別に分類する。

- 現行webapp unit/characterizationとして残す。
- E2EとしてPlaywright側で実行する。
- GAS専用verificationで実行する。
- legacy/supersededであり、現行contractへassertion移行後に削除する。

obsolete testをproductionへ合わせるために旧Facadeを復活させたり、現行productionを壊したりしてはいけない。

その分類後に`test:webapp`をpattern-based discoveryへ変更する。

### 11. 行数testが責務違反を検出していない

`tests/comipath-application-responsibility.test.mjs`は`comipath-application.ts`が200行以下かだけを確認している。

一方architecture checker fixtureにはすでに「長いcomposition root自体は拒否しない」testがある。

Task 12では200行上限を削除する。必要な責務checkが他testと重複していなければbehavior/ownership testへ置き換え、重複するならfile自体を削除してよい。別fileへ行数上限を移してはいけない。

### 12. dev demoが`BrowserApplication`のroute内部実装へ結び付いている

`BrowserApplication.searchNextDevDemo()` / `handleSetNextTargetDevDemo()`はroute plannerとSession snapshotを直接扱う。さらに`tests/task10-demo-route-regression.test.mjs`は`BrowserApplication.prototype.searchNextDevDemo`を直接呼び出している。

Task 12でproduction Route Guidance境界を強化すると、このtestがprivate application implementationを固定して妨げになる可能性がある。

既存デモ挙動は維持するが、「dev-only moduleを新設する」「Route Guidance public APIをchecker対策で広げる」と先に決めない。

まずproductionと同じRoute Guidance public operationで表現できる部分を再利用する。それでもdemo-only fallbackが必要な場合だけ、既存`dev-demo-data.js`周辺または責務が一意なdev boundaryへ最小限隔離する。architecture checkerの例外を追加しない。

## `BrowserApplication`に残してよい責務

Task 12完了時も`BrowserApplication`自体は残してよい。

次はapplication/browser shellの責務として残してよい。

- applicationのstart/stopとcleanup。
- `document` / `window`のbrowser boundary。
- app-owned event binderの開始・停止。
- app-owned timerのcleanup。
- UI toast、dialog open/close等のbrowser shell処理。
- featureのpublic operationを順番に呼ぶだけのcross-feature処理。
- cross-featureなsettings画面のread-only表示集約。
- dev demoかproductionかを選ぶ入口。

ただしread-only表示集約のためにfeature Repositoryへwriteしてはいけない。全event/dayの一覧等が必要なら、composition rootから小さなread-only query functionを注入してよい。

## `BrowserApplication`から外す責務

次はTask 12完了時に残してはいけない。

- concrete feature infrastructureのimportまたは生成。
- Event Day Repositoryへのsave/delete/remember等のwrite。
- event/day初期選択・永続化の独自実装。
- registry / manifestのHTTP load実装。
- points/grid metadataのRoute Guidance boundary validation。
- map area解決、candidate ranking、portal index/position計算等のproduction Route Guidance logic。
- `planRoute()` / `planRouteFromGridIndex()`等route algorithmの直接呼び出し。
- snapshot repository / distance matrix repositoryの直接操作。
- Route Guidance Sessionへproduction workflowのstateを直接組み立ててcommitする処理。
- Pending GAS / Local Data Deletion等feature固有のrequest versionやbusy stateの正本。
- feature固有のWorker / AbortController ownership。
- `// @ts-nocheck`。

`BrowserApplication`から外した処理を新しいapp-level classへまとめ直してはいけない。

## 実装の進め方

Task 12は複数の独立した境界修正を含むため、低レベルな実装担当へStage 12A〜12Fを一括で渡さない。

各Stageについて次を行う。

1. Stage開始時のremote HEADと対象fileを確認する。
2. 既存contractをfocused testで確認する。
3. そのStageだけ実装する。
4. focused test、`npm run check:webapp`、必要なbuildを実行する。
5. 独立commitする。
6. 次Stage開始前に最新コードを読み直す。

途中のStageで前提が変わった場合、後続Stageを文書どおり機械的に実行せず、最小差分になるよう再評価する。

## Stage 12A: 現行contractと全test inventoryを固定する

production architectureを変更する前に、現在の有効contractとtest実行漏れを整理する。

### A-1. 全testを分類する

`package.json`の`test:webapp`列挙だけを正本にしない。repository内の現存testを列挙し、少なくとも次に分類する。

- webapp unit/characterization。
- Route Guidance focusedだがwebapp全体でも実行すべきtest。
- GAS専用test。
- Playwright E2E。
- legacy/superseded test。

`tests/navigation-runtime-startup.test.ts`だけを特別扱いせず、現在`test:webapp`から漏れている全fileを確認する。

### A-2. obsolete startup testのcontractを移行する

`tests/navigation-runtime-startup.test.ts`が持つ次のcontractを現行testへ対応付ける。

- valid snapshotでresume dialogを表示し、自動`searchNext`しない。
- invalid snapshotを破棄する。
- 始点再設定でsnapshotを削除しdistance matrixを保持する。
- resume時にroute geometryを再構築する。
- geometry再構築失敗時にresume可能状態を保持する。

すでに`resume-route-guidance.test.ts`、`navigation-runtime-controller.test.ts`、`navigation-resume.spec.ts`等で同じcontractが証明されている場合は新しいtestを増やさない。不足assertionだけ現行ownerのtestへ追加する。

全contract移行後にだけobsolete testを削除する。

### A-3. Task 12で壊しやすい境界をcharacterizeする

新規testを無闇に増やさず、既存testへ最小限追加して次を固定する。

- durable last-opened Refとstartup requested Refが同じでも、runtime未初期化ならmanifest loaderとafter-switch runtime反映を一度通る。
- startupで同一Refを二重durable commitしない。
- runtimeですでに同一Refがactiveな状態の再選択では不要な二重transitionを起こさない。
- manifest preparation失敗時に新しいactive stateをcommitしない。
- points/grid asset validationの既存edge caseを維持する。
- demo route regressionを維持する。

Stage 12Aではproduction architectureを変更しない。

## Stage 12B: Event Day startupと削除後transitionを一本化する

### 目標

startup、通常switch、active event/day削除後の再選択が、同じmanifest validationとruntime activation contractを使う状態にする。

### 実装内容

- `OpenInitialEventDayUseCase`は候補Ref解決に限定する。
- manifest preparation、durable commit、map area/runtime反映は`SwitchEventDayUseCase`相当の一つのtransition経路へ集約する。
- `BrowserApplication.openEventDay()`相当のproduction処理を削除する。
- `BrowserApplication.bootstrapApp()` / `init()`からRepository writeとmanifest HTTP loadを削除する。
- `EventDaySelectorController.start()`が既存stateだからという理由だけでmanifest preparationを飛ばさないようにする。
- `SwitchEventDayUseCase.execute()`のsame-ref判定で、Repository last-openedをruntime active判定として使わない。
- registry/manifest HTTP loaderはcomposition rootで一度組み立てて注入する。
- `SwitchEventDayUseCase`から`globalThis.fetch` fallbackとHTTP URL/response処理を削除する。
- `afterSwitch`でmap area catalog、active session、現在manifestを一度だけ更新する。
- active event/day削除後の次Ref選択もこのtransition operationを使う。`repository.rememberLastOpenedEventDay()` + `activeEventDaySession.setActiveEventDay()`をapplicationが直接組み合わせない。
- `DomEventDaySelectorView`のproduction生成はcomposition rootへ置く。

### dev demo

`?demo_ui=1`はnetworkなしで既存demo stateを用意できる性質を維持する。

ただしdemo state準備のために`BrowserApplication`へEvent Day Repository write例外を残さない。既存Event Day operationを再利用するか、composition/startup boundaryから明示的なdemo dependencyとして渡す小さい方を選ぶ。

### やってはいけないこと

- `StartupManager`、`BootstrapCoordinator`等の新しいstartup Facadeを作る。
- initial用とswitch用に別のcommit実装を作る。
- same-ref startupを単にskipしてmanifest/map area未初期化のままにする。
- testで`globalThis.fetch` fallbackに依存する。

## Stage 12C: Pending GAS / Local Data Deletionのrequest ownershipを戻す

### 目標

feature固有のrequest lifecycleを`BrowserApplication`から対応featureへ戻す。

### Pending GAS Update

- retry/discardのin-flight、stale request、result/errorのownerを`features/circle-status/`へ置く。
- 既存`PendingGasUpdatesController`を優先して拡張する。新しいSession classを作る前にController内の小さなstateで足りるか確認する。
- BrowserApplicationはpublic operationを呼び、必要ならread-only resultをsettings projectionへ渡すだけにする。
- settings close/stop後の古いretry完了callbackが新しいUI stateを上書きしない性質を維持する。

### Local Data Deletion

- scope selection、confirm/cancel、in-flight/stale requestは`LocalDataDeletionController` / Use Caseがownerになる。
- 削除後のfeature内stateはfeature側で確定する。
- active event/day削除後のEvent Day transitionとRoute Guidance invalidationだけはcross-feature順序なのでapplication-levelで調整してよい。
- その調整に新しいManager/Coordinator classを作らない。既存callbackまたはplain functionで十分ならそれを使う。

### settings projection

- `BrowserApplication`は各featureのread-only snapshot/queryからsettings modelを組み立ててよい。
- busy/error/resultを表示するために同じmutable stateをapplication側へ複製しない。

## Stage 12D: Route Guidance snapshot/runtime contractを一本化する

### D-1. snapshot data contractを一つにする

callerを検索し、次の3系統を一つへ統合する。

- 簡易`NavigationSnapshot`。
- LocalStorage実snapshot `NavigationSnapshot`。
- `ResumeNavigationSnapshot`。

production persistenceで必要なfieldは現在のLocalStorage schemaを基準に保持する。

```text
schemaVersion
eventId
dayId
areaId
bundleVersion
matrixRef
navState
optimizationTimeLimitMs
savedAt
```

schema、key、JSON shapeは変更しない。

### D-2. Start Routeの偽adapterを削除する

- `StartRouteGuidanceUseCase`から、productionで引数を無視される簡易snapshot repository依存を削除するか、実contractへ置き換える。
- composition rootの`loadSnapshot: () => null` adapterを削除する。
- controller作成後にsave/clear callbackを差し替える接続を削除する。
- start成功後のsnapshot保存はRoute Guidanceのpublic operationを一度だけ通す。
- route startが失敗した場合はsnapshotを保存しない。
- pending circleが0件の場合の現行idle snapshot挙動を、characterization testを確認せず変更しない。

### D-3. concrete runtime依存をportへ変える

- `RouteGuidanceController`からLocalStorage repositoryと`RouteGuidanceRuntimeController` concrete classのdirect importを削除する。
- `ResumeRouteGuidanceUseCase`の`ResumeRuntimeController`等、すでに存在するstructural contractを確認して重複を減らす。
- snapshot、matrix、Workerごとに細かいport fileを量産しない。
- 実際にController/Use Caseが利用するmethod群を表す一つの最小runtime portで足りるならそれを使う。
- `RouteGuidanceRuntimeController`自体は既存infrastructure implementationとして残してよい。

### D-4. invalidationもpublic operationへ寄せる

source change/local deletionがsnapshot/matrixを消す場合、BrowserApplicationからrepository concrete methodを直接呼ばず、Route Guidanceのpublic operationを通す。

## Stage 12E: Route Guidance asset boundaryとproduction route処理をfeatureへ戻す

### E-1. points/grid validationをRoute Guidanceへ移す

対象:

- `parsePointsPayload()`
- `parseGridMeta()`

既存validation semanticsを変えず、Route GuidanceのHTTP asset boundaryで実行する。

優先順位:

1. `HttpRouteMapAssetsLoader`内の小さなpure validationで十分ならそこで完結する。
2. 共有する実callerがある場合だけRoute Guidance infrastructureにfocused parser moduleを一つ作る。

Event Day `application-boundary-parsers.ts`からroute-owned parserを削除するのは、全callerとtestを移した後に行う。

### E-2. production `searchNext()`のroute固有処理を移す

`BrowserApplication`から次をRoute Guidanceへ移す。

- map area解決。
- route map assets load。
- current locationからgrid index / SVG positionを解決する処理。
- same-area candidate絞り込み。
- candidate ranking。
- `planRoute()` / `planRouteFromGridIndex()`の直接呼出。
- production navigation start後のRoute Guidance Session追加merge。

既存`StartRouteGuidanceUseCase`、`RouteGuidanceController`、route-guidance domain functionを優先して拡張する。新しい`RouteService`、`NavigationManager`等は作らない。

BrowserApplicationは現在地formの生値を読み、Route Guidance public operationへ渡し、結果をUIへ表示するところまでにする。map area catalogをapplicationが直接走査しないで済むcontractを優先する。

### E-3. display target補正もownerを一つにする

現在production start後にBrowserApplicationが`gridDistance` / `mapPosition`を追加してSessionを再mergeしている。

Route Guidance startの成功結果として必要な表示情報を一度だけSessionへcommitし、applicationから二度目のstate mergeを行わない。

### E-4. dev demo

production route境界を壊さず既存demo挙動を維持する。

- まずproductionと同じpublic Route Guidance operationで表現できる部分を使う。
- demo-only fallbackが本当に必要な場合だけ、既存dev boundaryへ最小限隔離する。
- checkerを通すためだけにRoute Guidance public APIへ内部algorithmを大量exportしない。
- `tests/task10-demo-route-regression.test.mjs`をprivate `BrowserApplication.prototype`実装へ固定し続けない。可能ならstable operationまたはuser-visible demo behaviorを検証する。

## Stage 12F: BrowserApplication型付け、architecture guardrail、test discovery、最終検証

production codeが12B〜12Eの境界を満たした後に行う。

### F-1. BrowserApplicationとcomposition rootを型付けする

- `browser-application.ts`から`// @ts-nocheck`を削除する。
- broad `any`、index signature、`as unknown as ...`で型エラーを隠さない。
- `this as unknown as BindBrowserEventsDependencies["application"]`を削除する。
- `assemble-comipath-application.ts`の`browserRuntime: any`を型付けする。
- `StartableApplication & Record<string, unknown>`をやめ、production/testで本当に公開する値だけを明示型にする。
- start後に生成したControllerを、start前の`null`値として戻りobjectへコピーしない。
- custom element/DOMの既存型不足が露出した場合、そのboundaryだけをfocusedに型付けする。全UI TypeScript化へ広げない。
- testからprivate `.deps`へ`as any`で侵入するassertionを、production behaviorまたは明示されたpublic contractのassertionへ置き換える。

### F-2. architecture checker

次を検出する。

1. `assemble-comipath-application.ts`以外の`app/` production moduleがfeature内部の`domain/`、`use-cases/`、`ui/`、`infrastructure/`をdeep importすること。feature利用は原則`public-api.ts`経由とする。
2. `features/*/ui/`から同featureの`infrastructure/`を直接importすること。
3. use case内の直接`fetch`、`localStorage`、`new Worker(...)`。
4. app binderのconcrete infrastructure import、`localStorage`、`new Worker(...)`。既存ruleは維持する。

focused fixtureでpositive caseも入れ、正当な依存まで禁止しない。

- composition rootからconcrete infrastructureを組み立てることは許可する。
- app moduleからfeature `public-api.ts`のpublic Controller/action/typeを使うことは許可する。
- use caseのpure domain operation、clock等を無差別にbrowser API扱いしない。

次をしてはいけない。

- `browser-application.ts`専用例外を残す。
- dev-demo専用のarchitecture allowlistを作る。
- 新しいallowlistでTask 12の違反を隠す。
- file名や行数だけで巨大Facadeを判定する。

### F-3. 200行testを削除する

`tests/comipath-application-responsibility.test.mjs`の物理行数上限は削除する。

同じ責務をarchitecture/behavior testがすでに証明するならfileを削除してよい。独立したlifecycle contractが不足する場合だけ、そのcontractへ置き換える。

### F-4. `test:webapp`をpattern-based discoveryへ変更する

Stage 12Aで分類した結果を基に、webapp unit/characterization testを自動検出する。

新しいconfigが必要な場合は`vitest.webapp.config.ts`一つで十分とする。原則として明示除外は次だけにする。

- `tests/e2e/**`
- `tests/gas-contract.test.mjs`
- `tests/gas-build.test.mjs`

追加除外が必要な場合は、「別runnerが必ず所有している」ことをpackage scriptと対応付ける。failureを避けるための除外は不可。

focused `test:route-guidance`やPhase regression scriptは残してよい。重複実行は許容する。

`test:webapp`のpackage scriptへ個別test filenameを再列挙してはいけない。

pattern discoveryへ変えた直後に初めて失敗するtestが出た場合、まずそのtestがcurrent contractかobsolete contractかを判定する。GREEN化のためにproductionを旧Facadeへ戻したり、testをexcludeしたりしない。

## 対象ファイル

以下は現在のコードから確認した主な対象である。実装開始時にcaller検索して最小化する。

### app / composition

- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/bind-browser-events.ts`（型contract調整が必要な場合のみ）
- `apps/webapp/js/app/complete-circle-visit.ts`（Route Guidance deep importをpublic contractへ寄せる場合のみ）

### Event Day

- `apps/webapp/js/features/event-day/use-cases/open-initial-event-day.ts`
- `apps/webapp/js/features/event-day/use-cases/switch-event-day.ts`
- `apps/webapp/js/features/event-day/ui/event-day-selector-controller.ts`
- `apps/webapp/js/features/event-day/infrastructure/http-event-registry-loader.ts`（composition接続確認）
- `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`（composition接続確認）
- `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`（route-owned parser移動）
- `apps/webapp/js/features/event-day/public-api.ts`（public contractが必要な場合のみ）

### Circle Status / Local Data Deletion

- `apps/webapp/js/features/circle-status/ui/pending-gas-updates-controller.ts`
- `apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-controller.ts`
- 対応する既存Use Case / public API（必要なcontract変更だけ）

### Route Guidance

- `apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/resume-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-snapshot-repository.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-map-assets-loader.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/http-route-map-assets-loader.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/local-storage-route-guidance-snapshot-repository.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/route-guidance-runtime-controller.ts`
- `apps/webapp/js/features/route-guidance/public-api.ts`
- route asset parser module（reuseが必要な場合のみ新規作成）

### shared / checker / test entrypoint

- `apps/webapp/js/shared/ui/management-view-model.ts`（read-only projection contract変更が必要な場合のみ）
- `scripts/check-webapp-architecture.mjs`
- `package.json`
- `vitest.webapp.config.ts`（pattern discoveryに必要な場合のみ新規作成）

### 主なtest

- `tests/navigation-runtime-startup.test.ts`（contract移行後に削除）
- `tests/application-assembly.test.ts`
- `tests/production-event-day-source-wiring.test.ts`
- `tests/event-day-selector-controller.test.ts`
- `tests/event-day-transition-service.test.ts`
- `tests/apps-behavior-characterization.test.ts`
- `tests/browser-application-lifecycle.test.ts`
- `tests/browser-event-bindings.test.ts`
- `tests/architecture-boundaries.test.mjs`
- `tests/comipath-application-responsibility.test.mjs`
- `tests/boundary-parsers.test.ts`
- `tests/start-route-guidance.test.ts`
- `tests/resume-route-guidance.test.ts`
- `tests/route-guidance-controller.test.ts`
- `tests/navigation-runtime-controller.test.ts`
- `tests/pending-gas-updates-controller.test.ts`
- `tests/local-data-deletion-controller.test.ts`
- `tests/management-view-model.test.ts`
- `tests/task10-demo-route-regression.test.mjs`
- `tests/e2e/navigation-resume.spec.ts`（unitで表現できないcontractがある場合のみ）

この一覧外のproduction fileを変更する場合は、上記責務を既存ownerへ戻すために必要であることを先に確認する。単にfileを小さくするために新規fileを増やさない。

## 過剰実装を防ぐ制約

このTaskでは次を禁止する。

- EventBus。
- DI container。
- generic repository framework。
- generic command / handler framework。
- 新しいManager / Coordinator / Runtime / Facade class。
- 全feature共通のbase Controller / base Use Case。
- directory構造を揃えるためだけのfile移動。
- 全JavaScriptのTypeScript化。
- UI componentの全面書き換え。
- route planner、Dijkstra、ALNS、目的関数の変更。
- LocalStorage schema migration。
- snapshot schema変更。
- GAS API contract変更。
- visual snapshotの一括更新。
- test threshold、retry、skipの緩和。
- file行数制限の追加。
- architecture checkerを通すためだけのpublic API拡大。
- architecture checkerを通すためだけのdev-only例外。

新しいinterfaceは、concrete infrastructure依存を切るために既存classが実際に使うmethodだけを表す場合に限る。1 methodのために複数のinterface fileを作らない。

pure helperは同じ処理が2箇所以上で必要になる場合、または既存functionがすでに存在する場合に限って切り出す。

## やってはいけない完了方法

次の状態ではTask 12を完了扱いにしない。

- `BrowserApplication`の中身を別のapp-level classへ移しただけ。
- `browser-application.ts`をarchitecture checkerのallowlist/例外へ残した。
- `@ts-nocheck`を大量の`any`へ置き換えただけ。
- durable last-opened Refが同じという理由だけでstartup manifest preparationをskipした。
- Event Dayのinitial pathとnormal switch pathを別実装として残した。
- route asset parserをBrowserApplicationから消しただけでruntime validationも消した。
- `NavigationSnapshot`を名前だけ変えて複数種類残した。
- `ResumeNavigationSnapshot`をcanonical snapshotから独立したduplicate typeとして残した。
- snapshot adapterが引数を無視したまま名前だけ変わった。
- Pending GAS / Local Deletionのrequest version stateを別名fieldとしてBrowserApplicationへ残した。
- obsolete testをcoverage確認なしで削除した。
- `test:webapp`から失敗testをexcludeしてGREENにした。
- manual test listへ漏れたfileを追加しただけでpattern discoveryにしていない。
- demo testを通すためにproduction architecture exceptionを追加した。
- E2E snapshotを理由なく更新した。
- production behaviorを変えて既存test側を合わせた。

## Stageごとの検証

各Stageでは、変更したownerのfocused testを最初に実行する。

例:

### Event Day

```bash
npx vitest run --root . \
  tests/event-day-selector-controller.test.ts \
  tests/production-event-day-source-wiring.test.ts \
  tests/application-assembly.test.ts
```

### Pending GAS / Local Data Deletion

```bash
npx vitest run --root . \
  tests/pending-gas-updates-controller.test.ts \
  tests/local-data-deletion-controller.test.ts \
  tests/management-view-model.test.ts
```

### Route Guidance

```bash
npm run test:route-guidance
npx vitest run --root . \
  tests/navigation-runtime-controller.test.ts \
  tests/application-assembly.test.ts \
  tests/boundary-parsers.test.ts \
  tests/task10-demo-route-regression.test.mjs
```

test file名がStage 12Aのinventoryでobsoleteとして削除・統合された場合は、名前を復活させるために新規testを作らない。同じcontractを証明する現存testを実行する。

## Task 12最終検証

Task 12の全Stage完了後、最新HEADから最低限次を実行する。

```bash
npm run test:webapp
npm run test:route-guidance
npm run test:phase-05d-regressions
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npm run test:e2e:ci
npm run verify:gas
node scripts/audit-public-tree.mjs
git diff --check
git status --short --branch
```

さらにsource reviewとして次を確認する。

```bash
rg -n "@ts-nocheck" apps/webapp/js/app apps/webapp/js/features
rg -n "comipath-browser-runtime|EventDayDataStore|ComiPathDomCoordinator" apps/webapp/js tests
rg -n "browser-application\.ts" scripts/check-webapp-architecture.mjs tests/architecture-boundaries.test.mjs
rg -n "loadSnapshot: \(\) => null|browserRuntime: any|Record<string, unknown>" apps/webapp/js/app
```

`rg`は単純な0件だけで機械判定しない。removed-file testやerror message等の正当なhitは内容を確認する。

visual snapshot差分が出た場合、Task 12はUI redesignを目的としていないため、まずREGRESSIONを疑う。Task 10で既に根拠付き更新したbaselineを、Task 12のGREEN化のために再更新しない。repository内の証拠から新baselineが一意に正しいと判断できない場合はPhase完了を止める。

## 受入条件

### Event Day

- `BrowserApplication`がEvent Day Repositoryへwriteしない。
- BrowserApplicationがregistry/manifest HTTP loadを実装しない。
- initial Ref解決とtransition commitの責務が区別されている。
- durable last-opened Refが同じでも、runtime未初期化のstartupでmanifest preparationとruntime activationが一度実行される。
- runtimeですでに同じRefがactiveな再選択では不要な二重commitがない。
- manifest失敗時に新しいruntime active stateをpartial commitしない。
- active event/day削除後の再選択も同じvalidated transition経路を使う。
- `SwitchEventDayUseCase`が直接HTTP requestを行わない。

### Route Guidance

- production Route Guidanceのroute assets、runtime validation、route計算、portal geometryがRoute Guidance feature内にある。
- Event Day infrastructureにRoute Guidance points/grid parserが残っていない。
- points/gridの既存validation semanticsが維持される。
- production snapshot data contractが一つである。
- 簡易`NavigationSnapshot`とduplicate `ResumeNavigationSnapshot`が独立contractとして残っていない。
- 引数を無視するsnapshot adapterと後差し替えcallbackがない。
- start成功時のsnapshot保存が一度だけで、start失敗時には保存しない。
- `RouteGuidanceController`が同featureのconcrete infrastructure classへ直接依存しない。
- source change/local deletionによるsnapshot/matrix invalidationがRoute Guidance public operationから追える。
- BrowserApplicationがproduction route algorithmやRoute Guidance Sessionのworkflow snapshotを直接組み立てない。
- demo behaviorを維持するためのarchitecture例外を追加していない。

### 他feature / app

- Pending GAS / Local Data Deletionのfeature固有request version/busy stateをBrowserApplicationが正本として持たない。
- BrowserApplicationに残るcross-feature処理はpublic operationの順序調整に限定される。
- `browser-application.ts`に`// @ts-nocheck`がない。
- binder接続のための広い`as unknown as ...`が不要になっている。
- composition rootの公開戻り値が`Record<string, unknown>`ではなく明示型である。
- start後に生成されるController/operationの公開値が実際のruntime値と一致する。

### Guardrail / test

- architecture checkerに`browser-application.ts`専用例外がない。
- non-composition app moduleのfeature deep importをguardrailが検出する。
- feature UIからconcrete infrastructureへの依存をguardrailが検出する。
- use caseによる直接`fetch`/`localStorage`/`new Worker`をguardrailが検出する。
- 行数制限ではなく責務境界をtestしている。
- `navigation-runtime-startup.test.ts`の有効contractが現行testへ移され、legacy runtime importが消えている。
- Stage 12Aで確認した他の未列挙webapp testも、current/obsolete/別runnerへ分類済みである。
- `npm run test:webapp`が残存webapp unit/characterization testをpatternで検出し、手書きfile listの漏れに依存しない。
- test failureを隠すexclude、threshold、retry、skipを追加していない。
- `npm run verify:webapp`相当、CI固定環境E2E、GAS verification、public tree audit、`git diff --check`が成功する。

## 予定コミット単位

実装内容に合わせて文言は調整してよいが、少なくとも責務ごとに分ける。

```text
test(phase-5d): inventory and preserve remaining contracts
refactor(event-day): unify browser transition ownership
refactor(features): return request lifecycle to feature owners
refactor(route-guidance): unify snapshot runtime contracts
refactor(route-guidance): own route asset and start processing
chore(architecture): close remaining boundary and test gaps
```

各commit前にそのStageのfocused testを実行する。Task 12全体を一つの巨大commitにまとめない。