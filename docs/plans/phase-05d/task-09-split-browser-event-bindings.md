# Phase 5D Task 9: browser event bindingを責務所有者ごとに整理する

## 目的

Task 8で`BrowserEventBinding`からbusiness state、dependency assembly、feature workflowを除いた後、残ったbrowser event registrationを責務所有者ごとに整理する。

このTaskの目的はファイル数を増やすことではない。どのeventを誰が所有し、どこで登録・解除するかが一意で、`stop()`後に二重発火しない状態にする。

既存feature Controllerがlistener lifecycleを自然に所有できるeventは、そのfeatureへ残す。app層に「feature名ごとのbinderを必ず一つずつ作る」ことは要求しない。

## 前提

Task 8が完了していること。

Task 8終了時点で`bind-browser-events.ts`は少なくとも次を満たしていなければならない。

- concrete infrastructureを生成・deep importしない。
- feature mutable stateやそのproxyを所有しない。
- event handlerは注入済みpublic operationを呼ぶだけである。
- `// @ts-nocheck`がない。
- purchase/hold、destination selection、resume等のproduction workflowはfeature側へ移管済みである。

これを満たさない状態で物理分割だけを行うと巨大Facadeを複数ファイルへ散らすだけになるため、Task 9へ進まない。

## 対象外

- feature business logicの新規設計
- Route Guidance algorithm変更
- snapshot更新
- EventBus、DI container、generic command dispatcherの導入
- DOM elementごとに1ファイルを作ること
- featureごとにbinder fileを必ず作ること
- 行数制限をCI ruleにすること
- 既存Custom Element内部のlistener方式の全面変更

## event ownershipの原則

1. feature内部で完結するCustom Eventは、既存feature Controllerが`start()/stop()`で所有できるならfeature側で所有する。
2. 複数featureをまたぐpage-level action、またはfeature外のshell操作だけをapp binderへ残す。
3. 同一eventをfeature Controllerとapp binderの両方で登録しない。
4. listener登録先がDOM EventTargetである場合は、登録と解除を同じownerから追えるようにする。
5. callback propertyやcomponent固有callback APIまで、理由なくDOM `addEventListener`へ書き換えない。重要なのはcleanup可能な所有権であり、API形式の統一自体ではない。

## 想定する最終所有者

| event / input | 優先owner |
|---|---|
| `event-day-select` | `EventDaySelectorController` |
| Circle Data Sourceのpreview/apply/cancel/export/request event | `CircleDataSourceController` |
| local data deletionのscope/select/confirm/cancel | `LocalDataDeletionController`がlistener lifecycleを持てるなら同Controller。持たせると不自然な場合だけ小さなfeature-local/app binder |
| GAS outbox retry/discard | `PendingGasUpdatesController`がlistener lifecycleを持てるなら同Controller。持たせると不自然な場合だけ小さなfeature-local/app binder |
| purchase/hold/resetのページボタン | appのcircle-status/page-action binder → public Circle Status action / Task 8のcross-feature function |
| current location、search、destination select、route preview/confirm/cancel、resume | route-guidance binder → `RouteGuidanceController` |
| settings shellの開閉、Escape、gallery等feature非依存のUI操作 | settings-shell binderまたは既存Viewの明確なowner |
| `DOMContentLoaded`、`pagehide` | `run-comipath-in-browser.ts`。重複させない |
| online retry timer / listener | 既存background process。bindingへ戻さない |

`LocalDataDeletionController`と`PendingGasUpdatesController`には既にfeature operationが存在するため、2〜3個のevent転送だけのためにapp配下へ専用binderを必ず増やすのではなく、まず既存Controllerへtarget/lifecycleを追加する方が単純かを検討する。

## 対象ファイル

### 作成

Task 8後の実event一覧を確認して必要なものだけ作成する。

作成候補:

- `apps/webapp/js/app/bind-route-guidance-events.ts`
  - Route Guidanceのpage-level DOM inputが複数残るため、原則作成する。
- `apps/webapp/js/app/bind-circle-status-events.ts`
  - purchase/hold/reset等のpage-level actionが残る場合に作成する。
- `apps/webapp/js/app/bind-settings-shell-events.ts`
  - feature非依存のsettings/gallery/shell eventが複数残る場合に作成する。
- `tests/browser-event-bindings.test.ts`

次のapp binderは必須ではない。

- `bind-pending-gas-update-events.ts`
- `bind-local-data-deletion-events.ts`

それぞれ既存feature Controllerへlistener ownershipを寄せられず、app側に残す方が明確だと確認できた場合だけ作成する。

単一listenerしか持たず、既存root binderへ置いた方が読みやすいものを、ファイル数を増やすためだけに切り出さない。

### 変更

- `apps/webapp/js/app/bind-browser-events.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-controller.ts`（feature側でlistener lifecycleを持たせる場合）
- `apps/webapp/js/features/circle-status/ui/pending-gas-updates-controller.ts`（feature側でlistener lifecycleを持たせる場合）
- 必要に応じて各featureのpublic Controller contract
- `tests/browser-application-lifecycle.test.ts`
- `tests/apps-behavior-characterization.test.ts`
- `tests/architecture-boundaries.test.mjs`

### 削除

- Task 8で残っている`BrowserEventBinding` class。最終的にfunction-based rootへ置換する。

Task 8で既にclassが不要になっている場合は、Task 9開始まで維持するために復活させない。

## root binder contract

`bind-browser-events.ts`はTask 9後に残る個別binder/feature listener ownerを起動し、app側で登録したcleanupをまとめるだけにする。

```ts
export interface BrowserEventBindings {
  stop(): void;
}

export function bindBrowserEvents(
  dependencies: BindBrowserEventsDependencies,
): BrowserEventBindings;
```

必要な性質:

- `bindBrowserEvents()`を1回呼ぶとapp所有listenerを1回だけ登録する。
- `stop()`はidempotentで、app所有listenerをすべて解除する。
- feature Controller自身が所有するlistenerをroot binderが重複して解除・再登録しない。
- start→stop→start相当の再構築で二重発火しない。
- root binder自身はfeature workflowを実装しない。

新しい基底class、共通`EventBinder` class、registry、generic dispatcherは作らない。cleanup functionの配列で十分ならそれを使う。

## app binderの責務

### Route Guidance binder

所有してよいもの:

- current-location formのDOM value取得とsubmit/click event
- search/start button
- destination select event
- route preview/confirm/cancel
- resume confirm/reset-start
- optimization time input
- Route Guidance固有keyboard shortcut

handlerは`RouteGuidanceController`等のpublic operationを呼ぶ。grid計算、snapshot、Session mutation、route reconstruction、Worker操作を実装しない。

DOMから読み取った文字列を既存`parse-current-location-form.ts`等のpure parserへ渡すことは許容するが、binder自身へspace解析規則を複製しない。

### Circle Status/page-action binder

所有してよいもの:

- purchase button
- hold button
- reset等のpage-level操作

purchase/hold後のRoute Guidance進行はTask 8で確立したcross-feature functionを呼ぶ。binder内で`remainingCircles`、arrival position、next routeを組み立てない。

resetがCircle StatusだけでなくRoute Guidance等も無効化するcross-feature操作なら、binderへ直接処理を書かず、Task 8と同じ原則で小さなapp-level functionへ渡す。reset専用frameworkは作らない。

### Settings shell binder

所有してよいもの:

- settings表示/非表示
- Escapeでのshell close
- gallery等、現行仕様上どのfeatureにも属さないpage-level UI操作

source、event/day、GAS、deletion等のfeature eventを便宜上ここへ集約しない。

## feature Controllerへlistenerを寄せる場合

`EventDaySelectorController`や`CircleDataSourceController`は既に`start()/stop()`でlistener lifecycleを所有している。同じ形式が自然なfeature eventは、既存Controllerへ次だけ追加する。

- optional `targetElement`等のDOM boundary dependency
- `start()`でのlistener登録
- `stop()`での確実な解除
- malformed `CustomEvent.detail`のboundary validation

ControllerへRepository、HTTP client、他feature stateを新たに持たせない。listener ownershipのためだけにbusiness responsibilityを広げない。

## `onclick`とcallback APIの扱い

app層が直接設定しているDOM elementの`onclick = ...`は、他ownerのproperty handlerを上書きせずcleanup可能にするため、原則`addEventListener` + removeへ移す。

ただし次は一律変換対象ではない。

- Custom Element内部の既存listener
- `setOnHoldListReset(...)`等、明示的にcallback登録/解除の契約を持つcomponent API

callback APIを残す場合は`stop()`時に解除できることだけを確認する。`addEventListener`へ統一すること自体を目的にしない。

## 実装手順

1. Task 8後の`bind-browser-events.ts`に残るevent一覧を、event名・DOM target・呼び出すoperation・現ownerとともに表にする。
2. 既存Controllerが既に所有するeventをroot bindingから削除する。
3. Local Data Deletion / Pending GASのeventは、既存Controllerへlistener lifecycleを寄せる方が単純かを先に確認する。2〜3listenerだけのapp binderを自動作成しない。
4. appに残るeventをRoute Guidance、Circle Status/page action、Settings shell等の実際の責務単位へ分類する。
5. `tests/browser-event-bindings.test.ts`で各ownerの「登録1回・operation呼出1回・stop後0回」を、ownerごとに必要な範囲だけREDで固定する。
6. binderを切り出す場合は一つずつ行い、切り出すたびfocused testをGREENにする。
7. `BrowserEventBinding` classを削除し、必要最小限の`bindBrowserEvents()` functionへ置換する。
8. `assemble-comipath-application.ts`から各feature Controllerのstart/stopとroot binder lifecycleを一度だけ接続する。
9. `rg`で`BrowserEventBinding`参照、同じCustom Event名のduplicate registration、app-level `onclick =`を確認する。
10. full unit/type/build verificationを実行する。

## architecture guardrail

Task 8で追加した非composition-root app concrete infrastructure ruleを、新しい`bind-*.ts`にもそのまま適用する。

fixture testで少なくとも次を確認する。

- app binderから`features/route-guidance/infrastructure/*`をimportするとFAIL。
- binderから別featureのinternal pathへdeep importするとFAIL。
- binderからfeature public API / app-level cross-feature functionへの依存はPASS。
- feature Controllerが自featureのUse Case contractを使うことは、app binderの禁止ruleで誤検出しない。

ファイル名や行数のallowlistは追加しない。

## テスト方針

`tests/browser-event-bindings.test.ts`では、実際にapp binderとして残したownerだけについて少なくとも次を固定する。

- purchase/hold clickが1回のcross-feature operation呼出になる。
- route preview/confirm/cancelが対応operationへ転送される。
- resume dialog eventがroute operationへ転送される。
- settings toggle/closeがshell操作だけを行う。
- `stop()`後はapp所有eventが無効になる。
- start→stop→start相当の再構築でも二重発火しない。

Pending GAS / Local Data Deletionをfeature Controller所有へ移した場合は、同じ性質を各Controller testで確認し、app binder testへ重複ケースを作らない。

fake EventTarget testだけでなく、`application-assembly`またはcharacterizationで実DOM Custom Eventがproduction assembly上の実Controllerへ一度だけ到達する代表ケースを確認する。

## 検証コマンド

```bash
npx vitest run --root . \
  tests/browser-event-bindings.test.ts \
  tests/browser-binding-ownership.test.ts \
  tests/browser-application-lifecycle.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/application-assembly.test.ts \
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
- `bind-browser-events.ts`はapp所有listenerのcomposeとcleanupだけを行う。
- event/dayとCircle Data Sourceの既存Controller listenerを重複登録しない。
- Pending GAS / Local Data Deletionを含むfeature内部eventが、理由なくapp binderへ残っていない。
- app binderは実際に残った責務単位だけ作られ、空に近いbinderや1listenerだけの形式的fileを増やしていない。
- binder間でmutable stateを共有しない。
- Repository、HTTP、GAS client、Worker、routing algorithmをbinderがimportしない。
- app-owned DOM listenerはstop時に解除できる。
- callback-based component APIを残す場合もstop時に解除できる。
- production assemblyで同一eventが一回だけ処理される。
- unit/type/build検証が成功する。

## 予定コミットメッセージ

```text
refactor(app): clarify browser event ownership
```
