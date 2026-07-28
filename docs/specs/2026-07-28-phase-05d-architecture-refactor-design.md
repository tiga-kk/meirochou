# Phase 5D Apps Internal Refactor Design

**Status:** APPROVED
**Date:** 2026-07-28
**Scope:** `apps/webapp/`の内部構造。外部挙動、保存契約、GAS契約、CSV契約、最適化仕様、地図成果物は変更しない。

## 1. Problem

Phase 5C完了時点では、pure algorithm、repository、Web Worker、Lit componentはある程度分割されている。一方、次の3 classが複数featureを横断している。

### `apps/webapp/js/app.js`

- browser startupとdispose
- dependency生成
- DOM event binding
- event/day切替
- CSV・Googleスプレッドシート読込
- pending GAS update再送・破棄
- local data deletion
- current location、destination、route
- route map assetsのHTTP読込とcache
- distance matrix、ALNS、Worker
- route guidance snapshot、resume
- user notificationと画面更新

### `apps/webapp/js/data-manager.ts`

- active event/day
- circle一覧と派生配列
- CSV parse・preview・apply・export
- GAS refresh
- circle status変更
- pending GAS update queue
- sync process
- LocalStorage repository
- legacy import

### `apps/webapp/js/ui-manager.js`

- DOM lookup
- current location form
- route guidance表示
- circle progress
- settings panel
- map、gallery、dialog
- user notification

問題は行数ではなく、変更理由が異なる責務が同じclassへ集まり、機能追加時の影響範囲を限定できないことである。

## 2. Decision

機能別モジュラーモノリスを採用し、各feature内部へClean Architectureの依存方向を適用する。

```text
Lit components / feature UI
            ↓
feature Controller
            ↓
Use Case
            ↓
Domain

Use Case
    ↓ depends on capability interface
Infrastructure implementation
    ↑ implements interface
```

`Port`、`Adapter`のようなarchitecture用語をclass名へ付けず、`EventDayRepository`、`RouteMapAssetsLoader`、`WebWorkerRouteOptimizer`のように責務と技術を名前へ含める。

## 3. Target structure

```text
apps/webapp/js/
├── app/
│   ├── browser-entrypoint.ts
│   ├── run-comipath-in-browser.ts
│   ├── assemble-comipath-application.ts
│   ├── comipath-application.ts
│   └── bind-browser-events.ts
├── features/
│   ├── event-day/
│   │   ├── domain/
│   │   ├── use-cases/
│   │   ├── infrastructure/
│   │   ├── ui/
│   │   └── public-api.ts
│   ├── circle-status/
│   ├── route-guidance/
│   ├── circle-data-source/
│   └── local-data-deletion/
├── shared/
│   ├── domain/
│   ├── browser/
│   └── ui/
└── components/
```

`public-api.ts`だけをcross-feature importに使う。出所を隠す`index.ts` barrel fileは作成しない。

## 4. Canonical feature responsibilities

### Event Day

- event registry
- active event/dayの単一runtime正本
- last opened event/day
- initial open
- event/day switch
- map manifest load
- transition prepare・commit・rollback

### Circle Status

- `pending`、`held`、`purchased`、`excluded`
- short-lived undo
- purchaseだけをGAS更新へ変換
- pending GAS updateの保存、再送、破棄
- background sender lifecycle
- circle progress表示用model

永続化field名`circleStates`と`gasOutbox`はschema互換のため維持する。新しいAPIでは`CircleStatus`と`PendingGasUpdate`を使う。

### Route Guidance

- current location
- map area catalog
- route map assets
- grid route
- distance matrix
- time-decayed ALNS
- current destination、selected destination、current route
- arrival、purchase/hold後の進行
- route guidance snapshot
- reload resume、reset start
- Worker generation、progress、cancel

既存persisted type名`NavigationState`は互換性のため維持できるが、新しいfeature、file、Controller名には`RouteGuidance`を使う。

### Circle Data Source

- CSV validation
- CSV import preview
- Googleスプレッドシートsheet一覧
- GAS circle import preview
- source diff
- preview apply・cancel
- CSV export
- source変更後のroute guidance invalidation request

pending GAS updateの再送・破棄はCircle Status featureが所有する。

### Local Data Deletion

- circles削除
- activity削除
- event-day削除
- all-events削除
- pending GAS updateによる削除block
- route guidance snapshotとdistance matrixの保持・削除境界
- 削除後のactive event/day fallback

## 5. Layer responsibilities

### Domain

- feature固有の型
- pure validation
- pure state transition
- pure algorithm
- browser APIを知らない

### Use Cases

- 一つのユーザー操作の処理順序
- stale token、cancel、保存タイミング
- domain ruleと外部依存interfaceの組み合わせ
- user-facing messageとDOMを知らない

### Infrastructure

- LocalStorage
- GAS
- HTTP `fetch`
- Web Worker
- browser download
- concrete clock・UUID

concrete class名には実装技術を含める。

### UI

- Controller
- View interface
- DOM View
- screen/panel/dialog model
- custom event detailのruntime validation
- loading・error・success表示
- focus、aria、safe-area

## 6. Application shell

final `ComiPathApplication`は次だけを担当する。

- controller start順序
- background process start順序
- initial event/day open
- global error boundary
- stop順序

```ts
export interface ComiPathApplication {
  start(): Promise<void>;
  stop(): void;
}
```

`apps/webapp/js/app/comipath-application.ts`は200 physical lines以下とする。圧縮ではなく責務移動で達成する。

dependency生成は`assemble-comipath-application.ts`だけに置く。browser起動は`browser-entrypoint.ts`と`run-comipath-in-browser.ts`へ置く。

## 7. Naming decisions

命名の正本は`docs/architecture/webapp-naming-guidelines.md`である。

Phase 5Dで次の曖昧な名前を削除する。

| Current | Final responsibility-specific replacement |
|---|---|
| `App` | `ComiPathApplication` |
| `DataManager` | feature Use Case、Repository、Session |
| `UIManager` | feature-specific DOM Views |
| `ModalManager` | `DomCircleGalleryView`、`DomMapImageDialogView` |
| `StatsRenderer` | `DomCircleProgressView` |
| `MapRenderer` | `DomRouteMapView` |
| `Config` | `MapAreaCatalog`とfeature-specific LocalStorage key |
| `TspSolver` | `DevDemoNearestNeighborOrder` |
| source management | circle data source |
| storage management | local data deletion |
| outbox | pending GAS updates（schema fieldを除く） |

## 8. Confirmed current-tree corrections

2026-07-28の`main`、commit `be3d604d2da0d333dc2dab850f8bb1202ef47e49`に対してsource pathを監査した。

- event/day keyの実在pathは`apps/webapp/js/data/event-day-key.ts`
- runtime configの実在pathは`apps/webapp/js/config.ts`
- `apps/webapp/js/ui/navigation-view-model.ts`は複数責務を持つため、一つのfileへmoveしない
  - route guidance screen formattingはTask 5で新規作成する`route-guidance-screen-model.ts`へ置く
  - old fileの残存機能はTask 8で責務別fileへ分割する
  - 分割完了後にold fileを削除する

## 9. State ownership

| State | Owner |
|---|---|
| active event/day | `ActiveEventDaySession` |
| active persisted day state | `ActiveEventDaySession` |
| derived circle lists | `ActiveEventDayReader` |
| route destination、route、selection、Worker generation | `RouteGuidanceSession` |
| source draft、preview、request token、abort | `CircleDataSourceSession` |
| user-visible transient UI state | corresponding DOM View |
| persisted data | corresponding Repository |

`DataManager` compatibility propertyは移行中だけgetterとして残し、独立mutable arrayを保持しない。

## 10. Migration strategy

全面書き換えを行わない。各Taskでproduction behaviorを維持し、legacy classを一時delegatorとして使いながら責務を一つずつ移す。

1. behavior test、architecture rule、naming ruleを固定する
2. browser startupとdependency assemblyを分離する
3. active event/dayを一元化する
4. circle statusとpending GAS updatesを抽出する
5. route guidanceを抽出する
6. circle data source flowを抽出する
7. event/day switchとlocal data deletionを抽出する
8. UIManagerと大きなUI utility fileを責務別Viewへ分割する
9. legacy application、data、UI、config、central type filesを削除する
10. clean verificationとhandoffを行う

各Task終了時にbuild可能で、既存主要機能を利用できる状態を保つ。新旧のmutable正本を同時に作らない。

## 11. Source-file move policy

- Task開始時に全Move sourceが存在することを確認する
- 全Create targetが存在しないことを確認する
- 同一target pathを複数TaskでCreate/Moveしない
- mechanical moveとlogic変更を同じstepへ混ぜない
- move後に旧path re-export shimを原則作らない
- compatibility shimが必要な場合はTask文書に削除Taskを明記する
- filenameとprimary exportを一致させる

## 12. Non-goals

Phase 5Dでは次を行わない。

- `tests/` directory構造の全面整理
- `docs/` directory構造の全面整理
- package scriptのtest suite全面再設計
- UIの広範なvisual変更
- dependency追加
- LocalStorage schema変更
- GAS request/response contract変更
- CSV column・意味変更
- ALNS objective、timing profile、search time変更
- Dijkstra weight変更
- map assets変更
- PWA、server state、multi-device sync
- external information provider

testsとdocsの構造整理はPhase 5E、visual polishはPhase 5Fで扱う。

## 13. Completion criteria

- `apps/webapp/js/app.js`が存在しない
- `apps/webapp/js/data-manager.ts`が存在しない
- `apps/webapp/js/ui-manager.js`が存在しない
- `apps/webapp/js/config.ts`が存在しない
- `apps/webapp/js/types/domain.ts`が存在しない
- `apps/webapp/js/types/boundary-parsers.ts`が存在しない
- `apps/webapp/js/app/comipath-application.ts`が200 physical lines以下
- active event/dayのmutable正本が一つ
- route guidance runtimeのmutable正本が一つ
- feature Use Caseがconcrete browser technologyをimportしない
- cross-feature importが`public-api.ts`だけ
- vague new namesがarchitecture checkerで拒否される
- architecture legacy allowlistが存在しない
- LocalStorage、GAS、CSV、circle status、route guidance、resume、delete契約が維持される
- `npm run verify`、`npm run test:e2e`、C108 smoke、public audit、architecture checkが成功する
