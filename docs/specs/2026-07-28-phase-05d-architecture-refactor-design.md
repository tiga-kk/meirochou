# Phase 5D Webapp Architecture Refactor Design

**Status:** APPROVED
**Date:** 2026-07-28
**Scope:** ComiPath Webappの内部構造のみ。外部挙動、保存契約、最適化仕様、地図成果物は変更しない。

## 1. 背景

Phase 5C完了時点のWebappは、下位のpure kernel、repository、service、Web Worker、Lit componentには責務分割が存在する。一方で、最上位の`App`、`DataManager`、`UIManager`が複数機能の状態、処理順序、DOM操作、永続化、通信を横断して保持している。

現状の主な責務集中は次のとおりである。

- `apps/webapp/js/app.js`
  - composition root
  - startup / dispose
  - DOM event binding
  - event/day transition
  - CSV/GAS source management
  - outbox retry/discard
  - storage deletion
  - navigation state
  - route asset fetch/cache
  - route planning
  - ALNS lifecycle
  - snapshot save/recovery
  - toastと画面更新
- `apps/webapp/js/data-manager.ts`
  - active event/day state
  - repository生成
  - source preview
  - GAS refresh
  - purchase/hold mutation
  - outbox
  - sync coordinator
  - legacy-compatible derived arrays
  - CSV import/export
- `apps/webapp/js/ui-manager.js`
  - DOM lookup
  - location input
  - navigation rendering
  - settings rendering
  - statistics
  - map
  - modal
  - toast

問題はファイルの行数そのものではなく、変更理由が異なる責務が同じクラスへ集まり、機能追加時に影響範囲を限定できないことである。

## 2. 決定

厳密な教科書型Clean Architectureを全体へ一括導入しない。機能別モジュラーモノリスを基本とし、各機能内部へClean Architectureの依存方向を適用する。

```text
UI / Lit Components
        ↓
Feature Controller / View
        ↓
Application Use Case
        ↓
Domain

Application Use Case
        ↓ uses
Port / Repository interface
        ↑ implements
LocalStorage / GAS / fetch / Web Worker
```

フォルダは技術層だけで横断分割せず、機能単位でまとめる。

```text
apps/webapp/js/
├── app/
│   ├── app.ts
│   ├── bootstrap.ts
│   ├── composition-root.ts
│   └── app-lifecycle.ts
├── features/
│   ├── event-day/
│   ├── circle-state/
│   ├── navigation/
│   ├── source-management/
│   └── storage-management/
├── shared/
│   ├── domain/
│   ├── infrastructure/
│   └── presentation/
└── components/
```

`components/`は既存Lit componentを維持する。componentはFeature Controllerへeventを通知し、view modelを受け取る。componentからLocalStorage、GAS client、Web Worker、repositoryを直接呼ばない。

## 3. 各層の責務

### 3.1 UI / Components

- DOMとLit propertyを表示へ反映する。
- click、change、custom eventをControllerへ通知する。
- ブラウザ固有のfocus、dialog、aria、safe-areaを扱う。
- 業務判断、永続化、通信、経路順序決定を行わない。

### 3.2 Feature Controller / View

- UI eventをruntime parserで検証する。
- Use Caseへ入力を渡す。
- Use Caseの結果をfeature view modelへ変換する。
- loading、error、success表示をViewへ指示する。
- Domain ruleやLocalStorage keyを実装しない。

### 3.3 Application Use Case

- ユーザー操作1件の処理順序を表す。
- Domain ruleを組み合わせ、必要なPortを呼ぶ。
- transaction順序、stale request、cancel、保存タイミングを扱う。
- DOM、`document`、`window`、LocalStorage、`fetch`、`Worker`を直接使用しない。

例:

- `OpenEventDay`
- `ChangeCircleState`
- `StartNavigation`
- `ResumeNavigation`
- `ChangeNavigationTarget`
- `PreviewCsvSource`
- `ApplySourcePreview`
- `RetryGasOutbox`
- `DeleteLocalData`

### 3.4 Domain

- `EventDayRef`
- `Circle`
- `CircleVisitState`
- `NavigationState`
- `CurrentPosition`
- `Route`
- circle state transition
- navigation state transition
- 同一area判定
- 時間減衰評価
- ALNSのpure algorithm
- weighted Dijkstraのpure algorithm

DomainはブラウザAPIをimportしない。入力から結果を返すpure functionまたは、外部技術を知らない小さなstate objectとして実装する。

### 3.5 Port / Repository interface

Applicationが必要とする外部操作の契約を、内側で定義する。

```ts
export interface EventDayStatePort {
  load(ref: EventDayRef): LocalEventDayState | null;
  save(ref: EventDayRef, state: LocalEventDayState): void;
}

export interface RouteAssetPort {
  load(areaId: string): Promise<RouteAssets>;
}

export interface NavigationSnapshotPort {
  load(ref: EventDayRef): NavigationSnapshot | null;
  save(ref: EventDayRef, snapshot: NavigationSnapshot): void;
  clear(ref: EventDayRef): void;
}

export interface RouteOptimizerPort {
  optimize(
    problem: TimeDecayedOptimizationProblem,
    options: OptimizationRunOptions,
  ): OptimizationRun;
}
```

Use Caseはinterfaceだけをimportする。具体的なLocalStorage key、GAS URL、Worker message protocolを知らない。

### 3.6 Infrastructure

- LocalStorage repository
- GAS API client
- GAS outbox transport
- `fetch`によるmap bundle取得
- Web Worker adapter
- browser download adapter
- clock、UUID生成

Infrastructureは内側のPortを実装する。実装の選択と生成は`composition-root.ts`だけで行う。

## 4. 最終責務

### 4.1 `App`

`App`はfeature controllerの起動、停止、event/day lifecycleの接続だけを行う。navigation、source、storageの業務分岐を持たない。

最終的な公開形は次を基準とする。

```ts
export interface App {
  init(): Promise<void>;
  dispose(): void;
}

export function createApp(deps: AppDependencies): App;
```

`apps/webapp/js/app/app.ts`は200 physical lines以下を完了条件とする。行数を減らすための圧縮は行わず、責務移動で達成する。

### 4.2 `DataManager`

`DataManager`は最終的に削除する。active stateは`ActiveEventDaySession`へ移し、各操作はUse Caseへ分離する。production sourceから`data-manager.ts`をimportしない。

### 4.3 `UIManager`

`UIManager`は最終的に削除する。次のfeature viewへ分割する。

- `NavigationView`
- `LocationInputView`
- `SourceManagementView`
- `EventDayView`
- `StorageManagementView`
- `StatisticsView`
- `ToastView`
- `MapView`

production sourceから`ui-manager.js`をimportしない。

## 5. Feature境界

### 5.1 Event Day

active event/day、registry確認、open、switch、transition rollbackを扱う。

### 5.2 Circle State

pending、held、purchased、excluded、短時間undo、GASへ送るpurchase mutationを扱う。

### 5.3 Navigation

現在地、route asset、distance matrix、ALNS、current target、manual target、arrival、snapshot、resumeを扱う。circle mutationは`CircleStateUseCases`の公開interfaceを通す。

### 5.4 Source Management

CSV/GAS preview、apply、refresh、CSV export、outbox retry/discard、source manager view modelを扱う。

### 5.5 Storage Management

circles、activity、event-day、all-events削除と、snapshot/matrixの保持・削除境界を扱う。

## 6. Feature間の依存

- Feature間のdeep importを禁止する。
- 各featureは`index.ts`で公開するtype、Use Case、Controller contractだけを公開する。
- NavigationからCircle Stateを利用する場合は、`features/circle-state/index.ts`のapplication contractだけをimportする。
- Feature infrastructure同士を直接参照しない。
- sharedへfeature固有ルールを逃がさない。
- `app/composition-root.ts`だけが複数featureのconcrete adapterを接続してよい。

## 7. 移行戦略

全面書き換えは行わない。各Taskでproduction behaviorを維持し、旧facadeをadapterとして一時的に残しながら責務を一つずつ移す。

1. characterization testとimport boundary checkerを追加する。
2. entrypointとcomposition rootを分離する。
3. active event/day stateを`ActiveEventDaySession`へ移す。
4. circle stateとGAS mutationをUse Caseへ移す。
5. navigationをController、Use Case、Portへ移す。
6. source managementをController、Use Caseへ移す。
7. event/day transitionとstorage managementをControllerへ移す。
8. UI viewを分割する。
9. `DataManager`、`UIManager`、旧`app.js`を削除する。
10. allowlistを空にし、clean verificationとhandoffを行う。

各Taskの終了時点でbuild可能かつ既存機能を利用可能にする。途中Taskで新構造と旧構造の二重正本を作らない。

## 8. 非目標

Phase 5Dでは次を行わない。

- UIの広範な見た目変更
- React、Vue、状態管理libraryの導入
- package dependency追加
- LocalStorage schema変更
- GAS contract変更
- CSV列追加または意味変更
- ALNS objective、timing profile、search time変更
- Dijkstra weight変更
- map asset、points、grid変更
- server-side state
- multi-device sync
- PWA / Service Worker
- 自動現在地推定
- 外部情報provider追加
- legacy browser互換の拡張

広範な視覚調整はPhase 5Eへ送る。

## 9. エラー処理

- Domainはtyped resultまたはdomain errorを返す。
- Applicationは外部errorをfeature errorへ分類する。
- Controllerだけがuser-facing messageへ変換する。
- raw CSV cell、GAS URL、sheet内容、外部投稿本文をmessage、log、snapshotへ含めない。
- storage失敗時のlocal-first、memory継続、再計算表示を既存契約どおり維持する。
- stale token、AbortController、Worker generationの意味を変更しない。

## 10. Testing

### 10.1 Characterization

既存のstartup、event/day、source、navigation、purchase/hold、delete、resumeの外部挙動を、facade内部実装ではなく公開eventとrender結果で固定する。

### 10.2 Unit

DomainとUse CaseはDOMなしでtestする。Repository、GAS、Worker、clockはPortのfakeを注入する。

### 10.3 Integration

ControllerとView contract、composition rootのsingleton ownership、event binding、disposeをtestする。

### 10.4 Architecture

`scripts/check-webapp-architecture.mjs`でimport graphを検査する。

- domain/applicationからDOM、LocalStorage、fetch、Workerへの依存禁止
- feature間deep import禁止
- app以外でconcrete infrastructureを組み立てない
- legacy allowlistはTaskごとに縮小し、Task 9で削除
- `data-manager.ts`、`ui-manager.js`、旧`app.js`のproduction import禁止
- `app/app.ts`の200 physical lines上限

### 10.5 End-to-end

既存desktop/mobile E2Eを維持する。見た目を変えないため、Phase 5Dを理由としたvisual snapshot更新を原則禁止する。DOM構造変更が避けられず、見た目が同一であることをレビューで確認した場合だけ更新する。

## 11. 完了条件

- `apps/webapp/js/app.js`が存在しない。
- `apps/webapp/js/data-manager.ts`が存在しない。
- `apps/webapp/js/ui-manager.js`が存在しない。
- `apps/webapp/js/app/app.ts`が200 physical lines以下である。
- business logicが`App`、component、Viewへ残っていない。
- active event/day stateの正本が`ActiveEventDaySession`に一つだけ存在する。
- 各featureのapplication codeがPort経由で外部技術を利用する。
- architecture legacy allowlistが存在しない。
- 既存LocalStorage、GAS、CSV、navigation、E2E契約が維持される。
- `npm run verify`、`npm run test:e2e`、public audit、architecture checkが成功する。
