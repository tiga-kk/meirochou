# Webapp Naming Guidelines

この文書はPhase 5D以降の`apps/webapp/`で使用する名前の正本である。名前を見ただけで、対象、責務、実装技術が判断できることを優先する。

## 1. Canonical domain terms

同じ概念に複数の呼び方を使わない。

| Canonical term | Meaning | Avoid |
|---|---|---|
| event/day | 選択中の即売会イベントと開催日 | context、workspace、scope |
| circle | サークルの静的情報 | item、record、entry |
| circle status | `pending`、`held`、`purchased`、`excluded` | state management、action state |
| route guidance | 現在地、目的地、順路、経路表示、再開 | navigation runtime、route management |
| circle data source | CSVまたはGoogleスプレッドシートから得るサークル一覧 | source management、data management |
| pending GAS update | GASへ未送信の購入状態更新 | outbox item（保存schema名を除く） |
| local data deletion | circles、activity、event-day、all-eventsの削除 | storage management |
| map area | E456、E7、S12、W12など独立して巡回する地図単位 | area config |
| route map assets | points、grid metadata、grid binary | assets、data bundle（単独使用） |

既存の永続化契約に含まれる`circleStates`、`gasOutbox`、`NavigationState`などは互換性維持のため変更しない。新しいapplication APIとfile名にはcanonical termを使う。

## 2. Name by responsibility

次のような役割が分からない名前を新規追加しない。

- `Manager`
- `Handler`
- `Helper`
- `Utils`
- `Common`
- `Misc`
- `Data`だけで終わる名前
- `Service`だけで責務を表す名前
- `process`、`executeTask`、`handleData`のように対象が分からないmethod名

既存の`DataManager`、`UIManager`、`ModalManager`はPhase 5Dで削除する。

## 3. File and primary export

file名は主要exportをkebab-caseにしたものと一致させる。

```text
change-circle-status.ts       -> ChangeCircleStatus
route-map-assets-loader.ts    -> RouteMapAssetsLoader
local-storage-event-day-repository.ts
                              -> LocalStorageEventDayRepository
dom-route-guidance-view.ts    -> DomRouteGuidanceView
```

複数の無関係なexportを一つのfileへ集めない。型だけのfileでも`types.ts`ではなく、`event-day-types.ts`、`route-guidance-types.ts`のように対象を含める。

## 4. Use Case names

Use Caseはユーザーまたはapplicationが行う操作を動詞で始める。

- `OpenEventDay`
- `SwitchEventDay`
- `ChangeCircleStatus`
- `UndoCircleStatusChange`
- `StartRouteGuidance`
- `ResumeRouteGuidance`
- `ChangeDestination`
- `FinishCurrentCircle`
- `PreviewCsvImport`
- `PreviewGoogleSheetImport`
- `ApplyCircleDataPreview`
- `ExportCirclesToCsv`
- `DeleteLocalData`

`NavigationService`、`SourceService`のような広い名前にしない。

## 5. External dependency contracts

interface名はarchitecture用語の`Port`や`Adapter`ではなく、必要な能力を表す。

| Responsibility | Interface | Concrete implementation |
|---|---|---|
| event/day保存 | `EventDayRepository` | `LocalStorageEventDayRepository` |
| 地図asset読込 | `RouteMapAssetsLoader` | `HttpRouteMapAssetsLoader` |
| 順路最適化 | `RouteOptimizer` | `WebWorkerRouteOptimizer` |
| 案内snapshot保存 | `RouteGuidanceSnapshotRepository` | `LocalStorageRouteGuidanceSnapshotRepository` |
| GAS circle取得 | `GoogleSheetCircleClient` | `GasGoogleSheetCircleClient` |
| CSV download | `CircleCsvDownloader` | `BrowserCircleCsvDownloader` |
| 未送信更新保存 | `PendingGasUpdateQueue` | `LocalStoragePendingGasUpdateQueue` |

concrete class名には`LocalStorage`、`Gas`、`Http`、`WebWorker`、`Browser`など実装技術を含める。

## 6. Stateful object names

実行中にmutable stateを保持するobjectだけに`Session`を使う。

- `ActiveEventDaySession`
- `RouteGuidanceSession`
- `CircleDataSourceSession`

永続化objectには`Repository`、外部取得には`Loader`または`Client`、送信処理には`Sender`を使う。

## 7. UI names

UI contractは表示対象を含める。

- `RouteGuidanceView`
- `CurrentLocationFormView`
- `CircleDataSourceView`
- `EventDaySelectorView`
- `LocalDataDeletionView`
- `CircleProgressView`
- `UserNotificationView`
- `RouteMapView`

DOM実装には`Dom`を付ける。

- `DomRouteGuidanceView`
- `DomCurrentLocationFormView`
- `DomCircleProgressView`

画面へ渡す型は対象と用途を含める。

- `RouteGuidanceScreenModel`
- `CircleDataSourcePanelModel`
- `PendingGasUpdatesPanelModel`
- `LocalDataDeletionDialogModel`

`ViewModel`、`Model`だけの名前を使わない。

## 8. Method and boolean names

methodは副作用と対象を明示する。

- `getActiveEventDay()`
- `replaceActiveEventDayState()`
- `loadRouteMapAssets()`
- `saveRouteGuidanceSnapshot()`
- `sendPendingGasUpdates()`
- `showRouteCalculationError()`

booleanは`is`、`has`、`can`、`should`で始める。

- `isTransitioning`
- `hasPendingGasUpdates`
- `canResumeRouteGuidance`
- `shouldShowDeleteConfirmation`

## 9. Public API

各featureは`public-api.ts`だけをcross-feature importへ公開する。`index.ts`は出所を隠すため新規作成しない。

```ts
import type { CircleStatusActions } from "../circle-status/public-api";
```

feature内部のconcrete implementationをcross-featureでimportしない。

## 10. Abbreviations

次の既存技術名だけは略語を許可する。

- CSV
- GAS
- ALNS
- URL
- ID
- UI

独自略語や一文字名はloop indexなど狭いscope以外で使用しない。
