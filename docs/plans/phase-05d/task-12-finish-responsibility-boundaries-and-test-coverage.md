# Phase 5D Task 12: 残存する責務境界とテスト漏れを解消する

## このTaskの位置づけ

Task 11完了後の独立レビューで、unit/type/build/E2Eは成功している一方、Phase 5Dの目的である責務分離をまだ満たしていない箇所が確認された。

このTaskは新しい機能を追加しない。Task 1〜11で導入したfeature、Use Case、Controller、Session、composition rootを再利用し、残っている責務の重複と検証漏れだけを解消する。

このTaskの開始基準HEADは次である。

```text
9098ebe88e37332ce8e7a14d5d08497ee28ca03b
```

開始時は必ずremote `feature/phase-05d`をfetchし、remote HEADが進んでいる場合は差分を確認してから作業する。

## 目的

次の状態まで整理してPhase 5Dを本当に完了させる。

- `BrowserApplication`を、global lifecycle、browser shell、必要最小限のcross-feature orchestrationだけを持つ型付きapplication objectへ縮小する。
- event/dayの初期openと切替を`features/event-day/`の既存Use Case/Controllerへ一本化する。
- Route Guidanceのroute assets、route計算、snapshot、distance matrix、Worker runtimeを`features/route-guidance/`から追える状態にする。
- featureの`ui/`が同featureのconcrete `infrastructure/`へ直接依存しないようにする。
- use caseが`fetch`、`localStorage`、`new Worker(...)`等のconcrete browser APIを直接所有しないようにする。
- architecture checkerが特定の巨大application fileを例外扱いしないようにする。
- `npm run test:webapp`から古いtest fileが黙って漏れないようにする。

ファイル行数を減らすこと自体は目的ではない。責務が正しい場所へ移った結果としてファイルが短くなることはよいが、別名の大きなclassへ処理を移すだけの変更は不合格とする。

## 独立レビューで確認した問題

### 1. `BrowserEventBinding`の残存責務が`BrowserApplication`へほぼ移動している

Task 9直前の`af51914`からTask 11 HEADまでの差分では、`bind-browser-events.ts`から約1800行が削除される一方、`browser-application.ts`が約1800行で追加されている。

現在の`browser-application.ts`は少なくとも次を直接扱っている。

- `// @ts-nocheck`
- Event DayのRepository、Session、registry、manifest load
- Route Guidanceのmap assets、route planner、candidate ranking、portal位置解決
- snapshot / distance matrixの操作
- Route Guidance Sessionの直接更新
- GAS outbox、local data deletion、settings表示のapplication state
- browser lifecycle、timer、UI通知
- dev demo用のroute計算

`BrowserApplication`を削除すること自体は要求しない。上記のうちfeature固有の処理だけを既存featureへ戻し、applicationに残す責務を明確にする。

### 2. architecture checkerが`browser-application.ts`を明示的に例外扱いしている

現在の`check-webapp-architecture.mjs`は、非composition-root app moduleのconcrete infrastructure検査から`browser-application.ts`を除外している。

さらに`tests/architecture-boundaries.test.mjs`には、`browser-application.ts`からRoute GuidanceのHTTP loaderをimportしても違反にしないことを期待するtestがある。

これは以前`bind-browser-events.ts`だけを例外にしていた問題を別ファイル名へ移した状態であり、Phase 5Dの受入条件と一致しない。

### 3. Event Dayの初期openが二つの経路に分かれている

現在は次の二つが存在する。

1. `BrowserApplication`の`bootstrapApp()` / `init()` / `openEventDay()`がregistryを読み、初期`EventDayRef`を決め、Repository/Sessionへ状態を反映する。
2. `assemble-comipath-application.ts`が`BrowserApplication.start()`後に`EventDaySelectorController`を作成して`start()`し、`OpenInitialEventDayUseCase` / `SwitchEventDayUseCase`経由でも初期event/dayを扱う。

初期event/dayを決め、永続化し、`ActiveEventDaySession`へ反映するownerは一つにする。

既存の`OpenInitialEventDayUseCase`、`SwitchEventDayUseCase`、`EventDaySelectorController`を再利用し、新しいstartup manager等は作らない。

### 4. `SwitchEventDayUseCase`がHTTP処理を内包している

`SwitchEventDayUseCase`は`loadManifest`を注入できるにもかかわらず、未注入時に`globalThis.fetch`、URL解決、HTTP status確認を自分で行うfallbackを持っている。

use caseはmanifest取得operationへ依存し、HTTP実装はcomposition rootから既存loaderを注入する。

`fetch`を別のhelperへ移しただけでuse caseから呼ぶ形にはしない。既存`http-map-manifest-loader`を再利用する。

### 5. Route Guidanceのsnapshot contractが二重化している

現在は次の二つの`NavigationSnapshot`が存在する。

- `features/route-guidance/use-cases/route-guidance-snapshot-repository.ts`の簡易snapshot
- `features/route-guidance/infrastructure/local-storage-route-guidance-snapshot-repository.ts`の実際の永続化snapshot

`StartRouteGuidanceUseCase`は前者を保存するcontractを持つ一方、composition rootはそのsnapshot引数を実際には保存せず、後から`RouteGuidanceController.saveSnapshot()`を呼ぶadapterで接続している。

このためcomposition rootに、後から代入されるsnapshot callbackと、`loadSnapshot: () => null`を持つ実質的なadapterが存在する。

snapshotの永続化contractを一つにし、引数を無視するadapterを削除する。

このTaskではLocalStorage schemaやstorage keyを変更しない。

### 6. `RouteGuidanceController`がconcrete infrastructureへ直接依存している

`features/route-guidance/ui/route-guidance-controller.ts`は現在、同featureの次を直接importしている。

- `infrastructure/local-storage-route-guidance-snapshot-repository`
- `infrastructure/route-guidance-runtime-controller`

UI Controllerはdomain/use-case contractへ依存し、concrete classはcomposition rootからstructural interfaceとして注入する。

この修正のためだけに複数のinterface fileやbase classを作らない。既存型を非infrastructure側へ移すか、Controllerが実際に利用する最小のinterfaceを一つ定義する。

### 7. composition rootの型と接続に不要な迂回がある

`assemble-comipath-application.ts`には現在次がある。

- `let browserRuntime: any`
- controller作成後に差し替えるsnapshot callback
- `StartableApplication & Record<string, unknown>`への二重cast
- start後に作る`eventDaySelectorController` / `switchEventDay`を、start前の値のまま`Object.assign()`で返す形
- feature Controllerから`browserRuntime` methodへ戻るcallback

すべてを抽象化し直す必要はない。

少なくともsnapshot callbackの循環と`any`/`Record<string, unknown>`を解消し、productionで必要な公開contractだけを型で表す。

feature event callbackでlate bindingが必要な場合、1個の型付き`BrowserApplication | null`参照を残すことは許容する。それを消すためだけにEventBus、DI container、generic callback registryを導入してはいけない。

### 8. `test:webapp`の手書き列挙から古いtestが漏れている

`tests/navigation-runtime-startup.test.ts`は削除済み`comipath-browser-runtime.js`をimportしたまま残っているが、`npm run test:webapp`の手書きfile listに含まれていないためCIで検出されない。

このfileを単純に消して終わりにしない。既存testが持つ次のcontractを現行testへ対応付ける。

- valid snapshotでresume dialogを表示し、自動`searchNext`しない
- invalid snapshotを破棄する
- 始点再設定でsnapshotを削除しdistance matrixは保持する
- resume時にroute geometryを再構築する
- geometry再構築失敗時にresume可能状態を保持する

すでに`resume-route-guidance.test.ts`、`navigation-runtime-controller.test.ts`、`navigation-resume.spec.ts`等で同じcontractが証明されているものは重複testを増やさない。不足するassertionだけ現行testへ移し、その後`navigation-runtime-startup.test.ts`を削除する。

## `BrowserApplication`に残してよい責務

Task 12完了時も`BrowserApplication`自体は残してよい。

次はapplication/browser shellの責務として残してよい。

- applicationのstart/stopとcleanup
- `document` / `window`のbrowser boundary
- app-owned event binderの開始・停止
- timerのcleanup
- UI toast、dialog open/close等のbrowser shell処理
- featureのpublic operationを順番に呼ぶだけのcross-feature処理
- cross-featureなsettings画面のread-only表示集約
- dev demoかproductionかを選ぶ入口

ただしread-only表示集約のためにfeature Repositoryへwriteしてはいけない。全event/dayの一覧等が必要なら、composition rootから小さなread-only query functionを注入してよい。

## `BrowserApplication`から外す責務

次はTask 12完了時に残してはいけない。

- concrete infrastructureのimportまたは生成
- Event Day Repositoryへのsave/delete等のwrite
- event/day初期選択・永続化の独自実装
- registry / manifestのHTTP load実装
- grid points/metaのparse
- route planner / candidate ranking / portal index計算
- snapshot repository / distance matrix repositoryの直接操作
- Route Guidance Sessionへproduction workflowの状態を直接組み立ててcommitする処理
- feature固有のrequest token、Worker、AbortController等のownership
- `// @ts-nocheck`

`BrowserApplication`から外した処理を新しいapp-level classへまとめ直してはいけない。

## 実装順序

一つのCodex sessionで連続実行してよいが、次の区切りごとにfocused testとcommitを行う。複数段階を一つの巨大commitへまとめない。

### Stage 12A: 現行contractとテスト漏れを固定する

production codeの責務移管を始める前に、既存挙動を現行のpublic contractで固定する。

1. `tests/navigation-runtime-startup.test.ts`の各contractを現行testへ対応付ける。
2. すでに同じcontractがある場合は新しいtestを増やさない。
3. 不足するassertionだけ現行Route Guidance testまたはE2Eへ追加する。
4. 全contractの移行後にobsolete testを削除する。
5. 初期event/day openについて、同じ`EventDayRef`をstartup中に二重commitしないことをfocused testで固定する。

Stage 12Aではproduction architectureを変更しない。

### Stage 12B: Event Day startupとHTTP依存を一本化する

- initial event/dayの解決は`OpenInitialEventDayUseCase`を使用する。
- durable stateのcommitとevent/day切替は`SwitchEventDayUseCase` / `EventDaySelectorController`を正本にする。
- `BrowserApplication.openEventDay()`相当のproduction処理を削除する。
- `BrowserApplication.bootstrapApp()` / `init()`からRepository writeを削除する。
- registry/manifest HTTP loadはcomposition rootで既存loaderを組み立てる。
- `SwitchEventDayUseCase`から直接`fetch`するfallbackを削除する。
- startupと通常のevent/day switchで別のRepository/Session commit経路を作らない。
- `DomEventDaySelectorView`と`DomRouteGuidanceView`のproduction生成はcomposition rootへ置く。

startup順序を直すためだけの新しい`StartupManager`、`BootstrapCoordinator`等は作らない。既存`assembleComipathApplication()`のstart処理を整理する。

### Stage 12C: Route Guidanceのsnapshot/runtime contractを整理する

- `StartRouteGuidanceUseCase`から、引数を実際には保存しない簡易snapshot repository依存を削除する。
- route start後のsnapshot保存はRoute Guidanceの既存public operationを一度だけ通す。
- 永続化される`NavigationSnapshot`型を非infrastructure側のcontractへ移し、LocalStorage implementationとControllerが同じ型を使う。
- `RouteGuidanceController`は`RouteGuidanceRuntimeController` concrete classではなく、実際に使うmethodだけを持つ型へ依存する。
- composition rootの`loadSnapshot: () => null` adapterと、後から差し替えるsnapshot callbackを削除する。
- source change/local deletionによるsnapshot/matrix invalidationはRoute Guidanceのpublic operation経由にする。

LocalStorage schema、snapshot schema version、matrix format、ALNS behaviorは変更しない。

### Stage 12D: production route処理をRoute Guidance featureへ戻し、`BrowserApplication`を型付けする

現在`BrowserApplication`に残るproduction用の次をRoute Guidanceへ移す。

- map area解決
- route map assets load後のparse
- start spaceからgrid index /表示位置を解決する処理
- candidate ranking
- `planRoute()` / `planRouteFromGridIndex()`の直接呼び出し
- production `searchNext()`でのNavigationState組立て

既存`StartRouteGuidanceUseCase`、`RouteGuidanceController`、route-guidance domain functionを優先して拡張する。新しいroute service classは作らない。

`BrowserApplication`は現在地formを読み、Route Guidanceのpublic operationへ値を渡し、結果をUIへ表示するところまでにする。

`?demo_ui=1`だけがroute planner直呼びを必要とする場合、production applicationへ例外を残さず、既存dev demo codeまたは単一のdev-only moduleへ隔離する。dev demoのためにproduction architecture checkerを緩めない。

その後に次を行う。

- `browser-application.ts`から`// @ts-nocheck`を削除する。
- broad `any`、index signatureで型エラーを隠さない。
- `this as unknown as BindBrowserEventsDependencies["application"]`を削除し、実際のpublic method型でbinderへ渡せる状態にする。
- `assemble-comipath-application.ts`の`browserRuntime: any`を型付けする。
- `StartableApplication & Record<string, unknown>`をやめ、production/testで本当に必要な戻り値だけを型にする。
- testからprivate `.deps`へ`as any`で侵入するassertionは、production behaviorまたは明示されたpublic contractのassertionへ置き換える。

`BrowserApplication`の行数上限は設定しない。

### Stage 12E: architecture checkerとtest entrypointを修正して最終検証する

production codeが新しい境界を満たしてからguardrailを強化する。

#### architecture checker

次を検出する。

1. `assemble-comipath-application.ts`以外の`app/` moduleがfeature内部の`domain/`、`use-cases/`、`ui/`、`infrastructure/`をdeep importすること。feature利用は原則`public-api.ts`経由とする。
2. `features/*/ui/`から同featureの`infrastructure/`を直接importすること。
3. use case内の直接`fetch`、`localStorage`、`new Worker(...)`。
4. app binderのconcrete infrastructure import、`localStorage`、`new Worker(...)`。既存ruleは維持する。

次をしてはいけない。

- `browser-application.ts`専用例外を残す。
- 新しいallowlistでTask 12の違反を隠す。
- file名や行数だけで巨大Facadeを判定する。

`tests/comipath-application-responsibility.test.mjs`の200行上限testは削除するか、責務を直接検証するtestへ置き換える。別fileに行数上限を移してはいけない。

#### webapp unit testの実行範囲

`test:webapp`の長い手書きfile listを、Vitestのinclude/excludeでwebapp unit/characterization testを自動検出する構成へ変更する。

新しいconfigを作る場合は`vitest.webapp.config.ts`一つだけとし、原則として次だけを除外する。

- `tests/e2e/**`
- `tests/gas-contract.test.mjs`
- `tests/gas-build.test.mjs`

追加除外が必要な場合は、そのfileがなぜwebapp testではないかを既存script上のownerと対応付ける。test failureを避けるための除外は行わない。

`test:route-guidance`等のfocused scriptは残してよいが、`test:webapp`を通れば残存するwebapp test fileが黙って未実行にならない状態にする。

## 対象ファイル

### 主なproduction変更

- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/app/bind-browser-events.ts`（型contract調整が必要な場合のみ）
- `apps/webapp/js/app/complete-circle-visit.ts`（Route Guidance type importをpublic APIへ寄せる場合のみ）
- `apps/webapp/js/features/event-day/use-cases/open-initial-event-day.ts`（contract変更が必要な場合のみ）
- `apps/webapp/js/features/event-day/use-cases/switch-event-day.ts`
- `apps/webapp/js/features/event-day/ui/event-day-selector-controller.ts`（startup contract変更が必要な場合のみ）
- `apps/webapp/js/features/route-guidance/use-cases/start-route-guidance.ts`
- `apps/webapp/js/features/route-guidance/use-cases/route-guidance-snapshot-repository.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-controller.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/local-storage-route-guidance-snapshot-repository.ts`
- `apps/webapp/js/features/route-guidance/infrastructure/route-guidance-runtime-controller.ts`（contract適合の型変更が必要な場合のみ）
- `apps/webapp/js/features/route-guidance/public-api.ts`
- `scripts/check-webapp-architecture.mjs`
- `package.json`
- `vitest.webapp.config.ts`（pattern-based discoveryに必要な場合のみ作成）

### 主なtest変更

- `tests/navigation-runtime-startup.test.ts`（contract移行後に削除）
- `tests/application-assembly.test.ts`
- `tests/production-event-day-source-wiring.test.ts`
- `tests/apps-behavior-characterization.test.ts`
- `tests/browser-event-bindings.test.ts`
- `tests/architecture-boundaries.test.mjs`
- `tests/comipath-application-responsibility.test.mjs`
- `tests/start-route-guidance.test.ts`
- `tests/resume-route-guidance.test.ts`
- `tests/route-guidance-controller.test.ts`
- `tests/navigation-runtime-controller.test.ts`
- `tests/e2e/navigation-resume.spec.ts`（不足contractがunitで表現できない場合のみ）

一覧外のproduction fileを変更する場合は、上記責務を既存ownerへ戻すために必要であることを先に確認する。単にfileを小さくするために新規fileを増やさない。

## 過剰実装を防ぐ制約

このTaskでは次を禁止する。

- EventBus
- DI container
- generic repository framework
- generic command / handler framework
- 新しいManager / Coordinator / Runtime / Facade class
- 全feature共通のbase Controller / base Use Case
- directory構造を揃えるためだけのfile移動
- 全JavaScriptのTypeScript化
- UI componentの全面書き換え
- route planner、Dijkstra、ALNS、目的関数の変更
- LocalStorage schema migration
- snapshot schema変更
- GAS API contract変更
- visual snapshotの一括更新
- test threshold、retry、skipの緩和
- file行数制限の追加

新しいinterfaceは、concrete infrastructure依存を切るために既存classが実際に使うmethodだけを表す場合に限る。1 methodのために複数のinterfaceを作らない。

pure helperは同じ処理が2箇所以上で必要になる場合、または既存functionがすでに存在する場合に限って切り出す。

## やってはいけない完了方法

次の状態ではTask 12を完了扱いにしない。

- `BrowserApplication`の中身を別のapp-level classへ移しただけ。
- `browser-application.ts`をarchitecture checkerのallowlist/例外へ残した。
- `@ts-nocheck`を`any`へ置き換えただけ。
- `NavigationSnapshot`を名前だけ変えて二種類残した。
- obsolete testをcoverage確認なしで削除した。
- `test:webapp`から失敗testをexcludeしてGREENにした。
- E2E snapshotを理由なく更新した。
- production behaviorを変えて既存test側を合わせた。

## 検証

各Stageでは変更範囲のfocused testを先に実行する。

Task 12最終では最低限次を実行する。

```bash
npm run test:webapp
npm run test:route-guidance
npm run test:phase-05d-regressions
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
npm run test:e2e:ci
npm run verify:gas
git diff --check
```

さらに次を確認する。

```bash
rg -n "@ts-nocheck" apps/webapp/js/app apps/webapp/js/features
rg -n "comipath-browser-runtime|EventDayDataStore|ComiPathDomCoordinator" apps/webapp/js tests
rg -n "browser-application\.ts" scripts/check-webapp-architecture.mjs tests/architecture-boundaries.test.mjs
```

最初の`rg`は既存production TypeScript全体を無条件に0件へすることが目的ではない。Task 12で編集したapp/feature fileに新しい抑制を残していないことを確認し、既存の別問題が見つかった場合はこのTaskへ無制限に取り込まない。

visual snapshot差分が出た場合、このTaskはUI変更を目的としていないため原則REGRESSIONとして扱い、baseline更新で解決しない。

## 受入条件

- `BrowserApplication`がfeature固有のconcrete infrastructureをimport/生成しない。
- `BrowserApplication`がEvent Day Repositoryへwriteしない。
- initial event/day commit経路が一つで、startup中の同一Ref二重commitがない。
- `SwitchEventDayUseCase`が直接HTTP requestを行わない。
- production Route Guidanceのroute assets/route計算/portal geometryがRoute Guidance feature内にある。
- Route Guidance snapshot contractが一つで、引数を無視するsnapshot adapterがない。
- `RouteGuidanceController`が同featureのconcrete infrastructure classへ直接依存しない。
- `assemble-comipath-application.ts`にsnapshot callbackの後差し替えがない。
- `browser-application.ts`に`// @ts-nocheck`がない。
- binder接続のための`as unknown as ...`が不要になっている。
- composition rootの公開戻り値が`Record<string, unknown>`ではなく明示型である。
- architecture checkerに`browser-application.ts`専用例外がない。
- non-composition app moduleのfeature deep importをguardrailが検出する。
- feature UIからconcrete infrastructureへの依存をguardrailが検出する。
- use caseによる直接`fetch`/`localStorage`/`new Worker`をguardrailが検出する。
- `navigation-runtime-startup.test.ts`の有効なcontractが現行testへ移され、legacy importがpublic treeから消えている。
- `npm run test:webapp`が残存webapp testをpatternで検出し、手書きfile listの漏れに依存しない。
- 行数制限ではなく責務境界をtestしている。
- `npm run verify:webapp`相当、CI固定環境E2E、GAS verification、`git diff --check`が成功する。

## 予定コミット単位

実装内容に合わせて文言は調整してよいが、少なくとも次のように責務ごとにcommitを分ける。

```text
test(phase-5d): preserve remaining runtime contracts
refactor(event-day): unify browser startup ownership
refactor(route-guidance): unify runtime and snapshot contracts
refactor(app): reduce and type browser application
chore(architecture): close remaining boundary and test gaps
```

Task 12全体を一つの巨大commitにしない。
