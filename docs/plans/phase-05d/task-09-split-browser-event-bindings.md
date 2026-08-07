# Phase 5D Task 9: browser event bindingを責務別に分割する

## 目的

Task 8で`BrowserEventBinding`からbusiness state、dependency assembly、feature workflowを除いた後、残ったbrowser event registrationをevent ownerごとの小さなmoduleへ分割する。

このTaskは「何行以下にする」という機械的な分割ではない。どのfeatureへの入力なのかをファイル名と依存関係から判断でき、各binderを単独で読んでlistenerの登録・解除を追える状態にする。

## 前提

Task 8が完了していること。

Task 8終了時点で`bind-browser-events.ts`は少なくとも次を満たしていなければならない。

- concrete infrastructureを生成・importしない。
- feature mutable stateを所有しない。
- event handlerは注入済みpublic operationを呼ぶだけである。
- `// @ts-nocheck`がない。

これを満たさない状態で物理分割だけを行うと巨大Facadeを複数ファイルへ散らすだけになるため、Task 9へ進まない。

## 対象外

- feature business logicの新規設計
- Route Guidance algorithm変更
- snapshot更新
- EventBus、DI container、generic command dispatcherの導入
- DOM elementごとに1ファイルを作ること
- 行数制限をCI ruleにすること

## 最終event ownership

既存Controllerがlistener lifecycleを既に持つeventはapp binderへ戻さない。

| event / input | owner |
|---|---|
| `event-day-select` | `EventDaySelectorController` |
| Circle Data Sourceのpreview/apply/cancel/export/request event | `CircleDataSourceController` |
| local data deletionのscope/select/confirm/cancel | local-data-deletion binder → `LocalDataDeletionController` |
| GAS outbox retry/discard | pending-GAS binder → `PendingGasUpdatesController` |
| purchase/hold/resetのページボタン | circle-status binder → public circle action / `CompleteCircleVisitOperation` |
| current location、search、route preview/confirm/cancel、resume | route-guidance binder → `RouteGuidanceController` |
| settings shellの開閉などfeature非依存のUI操作 | settings-shell binder |
| `DOMContentLoaded`、`pagehide` | 既存`run-comipath-in-browser.ts`。重複させない |
| online retry timer / listener | 既存background process。bindingへ戻さない |

## 対象ファイル

### 作成

- `apps/webapp/js/app/bind-route-guidance-events.ts`
- `apps/webapp/js/app/bind-circle-status-events.ts`
- `apps/webapp/js/app/bind-pending-gas-update-events.ts`
- `apps/webapp/js/app/bind-local-data-deletion-events.ts`
- `apps/webapp/js/app/bind-settings-shell-events.ts`
- `tests/browser-event-bindings.test.ts`

### 変更

- `apps/webapp/js/app/bind-browser-events.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- 必要に応じて各featureのpublic Controller contract
- `tests/browser-application-lifecycle.test.ts`
- `tests/apps-behavior-characterization.test.ts`
- `tests/architecture-boundaries.test.mjs`

### 削除

- Task 8で残っている`BrowserEventBinding` class。最終的にfunction-based rootへ置換する。

## 共通binder contract

各binderはlistenerを登録してcleanup functionを返す。新しい基底classや共通EventBinder classは作らない。

```ts
export type StopBrowserEventBinding = () => void;
```

各moduleは概ね次の形にする。

```ts
export function bindRouteGuidanceEvents(
  dependencies: RouteGuidanceBrowserEventDependencies,
): StopBrowserEventBinding;
```

`dependencies`にはそのbinderが実際に呼ぶpublic Controller/action、必要なDOM root、read-only queryだけを含める。Repository、Session concrete implementation、Worker、HTTP loaderを渡さない。

## root binder contract

`bind-browser-events.ts`は個別binderを呼び出し、cleanupを逆順に実行するだけにする。

```ts
export interface BrowserEventBindings {
  stop(): void;
}

export function bindBrowserEvents(
  dependencies: BindBrowserEventsDependencies,
): BrowserEventBindings;
```

必要な性質:

- `bindBrowserEvents()`を1回呼ぶと各binderを1回だけ登録する。
- `stop()`はidempotentで、全listenerを解除する。
- `stop()`後の二重解除で例外を投げない。
- 再start時にlistenerを二重登録しない。
- root binder自身はfeature workflowを実装しない。

## 各binderの責務

### `bind-route-guidance-events.ts`

所有してよいもの:

- current-location formのsubmit/click/input event読取
- search/start button
- destination select
- route preview/confirm/cancel
- resume confirm/reset-start
- optimization time input
- keyboard shortcutがRoute Guidance固有ならそのlistener

handlerは`RouteGuidanceController`等のpublic operationを呼び、計算・snapshot・state mutationの詳細を実装しない。

### `bind-circle-status-events.ts`

所有してよいもの:

- purchase button
- hold button
- circle status reset系のページ操作

purchase/hold後のRoute Guidance進行はTask 8の`CompleteCircleVisitOperation`を呼ぶ。binder内で`remainingCircles`を組み立てたりroute stateを書き換えたりしない。

### `bind-pending-gas-update-events.ts`

所有してよいもの:

- GAS retry
- selected outbox discard

`PendingGasUpdatesController`へ転送するだけとし、GAS clientやoutbox repositoryを知らない。

### `bind-local-data-deletion-events.ts`

所有してよいもの:

- delete scope select
- delete confirm
- delete cancel

`LocalDataDeletionController`へ転送する。LocalStorage key、snapshot repository、matrix repositoryを直接触らない。

### `bind-settings-shell-events.ts`

所有してよいもの:

- settings表示/非表示
- settings shell固有で、どのfeatureにも属さないUI event

source、event/day、GAS、deletion等のfeature eventをここへ集約しない。

## `onclick`の扱い

既存の`element.onclick = ...`と`addEventListener`を混在させず、このTaskで追加・整理するbindingは`addEventListener` + cleanup functionに統一する。

理由:

- `stop()`で確実に解除できる。
- testでlistener ownershipを検証できる。
- 他featureが設定したproperty handlerを上書きしない。

既存Custom Element内部のlistener実装までTask外で変更しない。

## 実装手順

1. Task 8後の`bind-browser-events.ts`に残るevent一覧を列挙する。
2. 既存Controllerが既に所有するeventをroot bindingから削除する。
3. 残りを上記5つのevent ownerへ分類する。
4. `tests/browser-event-bindings.test.ts`で各binderの「登録1回・operation呼出1回・stop後0回」をREDで固定する。
5. binderを一つずつ切り出し、切り出すたびfocused testをGREENにする。
6. `BrowserEventBinding` classを削除し、`bindBrowserEvents()` functionへ置換する。
7. `assemble-comipath-application.ts`から新root functionを呼ぶ。
8. rootのstopを`ComiPathApplication` lifecycleへ接続する。
9. `rg`で`BrowserEventBinding`参照とduplicate listenerを確認する。
10. full unit/type/build verificationを実行する。

## architecture guardrail

Task 8で追加したapp concrete infrastructure ruleに加えて、fixture testで次を確認する。

- `app/bind-route-guidance-events.ts`から`features/route-guidance/infrastructure/*`をimportするとFAIL。
- binderから別featureのinternal pathへdeep importするとFAIL。
- binderからpublic API / app-level operationへの依存はPASS。

ファイル名や行数のallowlistは追加しない。

## テスト方針

`tests/browser-event-bindings.test.ts`ではfake DOM EventTargetとfake operationを用いて少なくとも次を固定する。

- purchase clickが1回のoperation呼出になる。
- route preview/confirm/cancelが対応operationへ転送される。
- resume dialog eventがroute operationへ転送される。
- GAS retry/discardがpending controllerへ転送される。
- deletion select/confirm/cancelがdeletion controllerへ転送される。
- settings toggleがsettings shellだけを更新する。
- `stop()`後は全eventが無効になる。
- start→stop→start相当の再構築でも二重発火しない。

## 検証コマンド

```bash
npx vitest run --root . \
  tests/browser-event-bindings.test.ts \
  tests/browser-binding-ownership.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/architecture-boundaries.test.mjs
npm run test:webapp
npm run test:route-guidance
npm run test:phase-05d-regressions
npm run check:webapp
npm run build:webapp
git diff --check
```

Task 9でもsnapshotは更新しない。

## 受入条件

- `BrowserEventBinding` classが存在しない。
- `bind-browser-events.ts`は個別binderのcomposeとcleanupだけを行う。
- event/dayとCircle Data Sourceの既存Controller listenerを重複登録しない。
- 各binderの名前から対象feature/event ownerが分かる。
- binder間でmutable stateを共有しない。
- Repository、HTTP、GAS client、Worker、routing algorithmをbinderがimportしない。
- `onclick`によるapp-level bindingを新規追加せず、登録listenerをcleanupできる。
- unit/type/build検証が成功する。

## 予定コミットメッセージ

```text
refactor(app): split browser event bindings by owner
```
