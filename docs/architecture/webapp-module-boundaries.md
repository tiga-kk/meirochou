# Webapp Module Boundaries

この文書はPhase 5D以降の`apps/webapp/`における依存方向、concrete implementationの公開範囲、runtime state ownershipの正本である。命名は`webapp-naming-guidelines.md`に従う。

## Allowed dependency direction

```text
components / feature UI
          ↓
feature use cases
          ↓
feature domain

feature use cases
          ↓ depend on capability interfaces
feature infrastructure
          ↑ implements interfaces
```

`app/assemble-comipath-application.ts`だけがconcrete infrastructureを生成し、feature間を接続する。

## Directory roles

| Directory | Responsibility | May depend on |
|---|---|---|
| `app/` | browser entrypoint、dependency assembly、global lifecycle | feature public API。assemblyだけはfeature infrastructure |
| `features/*/domain/` | feature固有型、pure validation、pure state transition、pure algorithm | same feature domain、`shared/domain` |
| `features/*/use-cases/` | ユーザー操作の処理順序、外部能力interface、runtime state session | same feature domain/use-cases、`shared/domain`、他feature `public-api.ts` |
| `features/*/infrastructure/` | LocalStorage、GAS、HTTP、Web Worker、browser download | same feature domain、same feature use-case interfaces、`shared/browser` |
| `features/*/ui/` | Controller、View interface、DOM View、screen model、event parser | same feature domain/use-cases、components、`shared/ui`、他feature `public-api.ts` |
| `features/*/public-api.ts` | cross-featureで利用可能なdomain type、capability interface、factory-free operation | same feature内のdomain/use-cases/UI contracts |
| `shared/domain/` | 複数featureで意味が完全に同じpure type/interface | browser APIなし |
| `shared/browser/` | clock、UUID、URL、download、cancellation等のbrowser implementation | browser API、`shared/domain` |
| `shared/ui/` | notification、focus、image layout等の汎用UI | DOM、`shared/domain` |
| `components/` | Lit custom elements | feature UI model/event contract、`shared/ui` |

## Use Case allowlist

Use Case fileは次だけをimportできる。

1. 同じfeatureの`domain/`
2. 同じfeatureの`use-cases/`
3. `shared/domain/`
4. 別featureの`public-api.ts`
5. type-only importで、上記に属する型

次はpath名に`infrastructure`が含まれなくても禁止する。

- `state/storage-service`
- `state/storage-schema`
- `api/gas-api-client`
- `fetch`
- `localStorage`
- `document`
- `window`
- `Worker`
- `AbortController`
- `AbortSignal`
- concrete class名が`LocalStorage`、`Http`、`Browser`、`WebWorker`、`Gas*Client`で始まるmodule

architecture checkerは「import先pathに特定単語があるか」だけでなく、上記allowlistから外れるdependencyを検出する。

## Repository placement

Repository interfaceとconcrete classを同じfileに置かない。

```text
features/event-day/use-cases/event-day-repository.ts
  └── EventDayRepository interface only

features/event-day/infrastructure/local-storage-event-day-repository.ts
  └── LocalStorageEventDayRepository class
```

同じ規則を全featureへ適用する。

- interface名は保存対象を表す。
- concrete class名は技術を表す。
- LocalStorage keyはconcrete infrastructure内のprivate constantにする。
- schema migration、rollback、runtime parsingもconcrete infrastructureが行う。
- Use Caseはconcrete classをimportしない。

## Feature public API

`public-api.ts`は別featureへ見せるcontractであり、composition root向けconcrete barrelではない。

公開してよいもの:

- domain type
- capability interface
- Use Case interface
- Controller/View contractがcross-feature連携に必要な場合のtype
- pure factory。ただしfactoryがconcrete browser technologyを生成しない場合のみ

公開してはいけないもの:

- `LocalStorageEventDayRepository`
- `HttpRouteMapAssetsLoader`
- `WebWorkerRouteOptimizer`
- `BrowserCircleCsvDownloader`
- GAS/HTTP client concrete class
- DOM View concrete class
- storage key
- Worker protocol entrypoint

`assemble-comipath-application.ts`は必要なconcrete classをそのfeatureの`infrastructure/`pathから直接importする。

## Forbidden imports

- DomainからDOM、LocalStorage、`fetch`、Worker、Abort API
- Use CaseからUI、components、concrete infrastructure、browser API
- feature Aからfeature Bの`public-api.ts`以外
- componentsからrepository、GAS client、HTTP loader、Worker optimizer
- `comipath-application.ts`からrouting algorithm、CSV parser、storage key、GAS protocol
- `shared/`へfeature固有state machineを移すこと
- deleted legacy fileをproductionまたはtestからimportすること
- cross-feature importのための`index.ts`
- 新規file/class名に`Manager`、`Handler`、`Helper`、`Utils`、`Common`を使うこと

## State ownership

| State | Single owner |
|---|---|
| active event/day and active persisted day state | `ActiveEventDaySession` |
| derived circle lists | `ActiveEventDayReader` |
| circle status and pending GAS updates | active event/day state's `circleStates` and `gasOutbox` |
| route target、route、selection、Worker generation | `RouteGuidanceSession` |
| source draft、preview、request generation | `CircleDataSourceSession` |
| current cancelable source request | `CircleDataSourceController` or one named request coordinator |
| UI-only state | corresponding feature View |
| persistent data | corresponding Repository |

同じstateを複数classのmutable propertyへ複製しない。

### Pending GAS updates

pending GAS updatesの永続正本は既存`LocalEventDayState.gasOutbox`だけである。

- 別のLocalStorage keyを作らない。
- status変更とoutbox appendは同じnext stateを作り、一回のrepository saveで保存する。
- save成功後にだけbackground deliveryを要求する。
- network成功後のremove、失敗後のattempt updateもevent/day stateをrepositoryへ保存する。
- persisted field名とJSON shapeを変更しない。

## Cancellation boundary

Use Case contractへ`AbortController`または`AbortSignal`を露出しない。

browser infrastructureが必要な場合は次のような抽象contractを使う。

```ts
export interface CancelableRequest<T> {
  readonly result: Promise<T>;
  cancel(): void;
}
```

HTTP/GAS infrastructureだけが内部でAbortControllerを生成・使用する。Controllerは新しいrequest開始時と`stop()`時に`cancel()`を呼ぶ。SessionへAbortControllerを保存しない。

## Browser lifecycle

browser entrypoint、DOM readiness、application lifecycleのownerを分ける。

- `browser-entrypoint.ts`: assemblyとrunner呼出しだけ
- `run-comipath-in-browser.ts`: DOMContentLoaded、pagehide、pending start Promise
- `comipath-application.ts`: controller/background process start/stop順序
- `assemble-comipath-application.ts`: concrete dependency生成

契約:

- `start()`と`stop()`は二重実行してもlistener/processを重複させない。
- DOM準備前に`stop()`された場合、保留中の`start()` Promiseはresolveまたはdocumented cancellation errorでrejectし、永久pendingにしない。
- application start失敗はterminalである。同じinstanceをretryしない。
- start失敗時は所有resourceを一回だけstopする。
- stop後のasync continuationはstate、repository、Viewを更新しない。

## Browser event binding

browser event bindingはfeature Controllerまたは`app/bind-browser-events.ts`に限定する。Use CaseはDOM event名とelement IDを知らない。

bindしたlistener、timer、coordinator、Worker、cancelable requestはownerの`stop()`または`dispose()`で解除する。再起動でlistenerを二重登録しない。

## Error boundary

```text
Infrastructure error
        ↓ classify
Use Case error
        ↓ map
Controller message
        ↓ render
View
```

raw CSV cell、GAS URL、sheet内容、external post body、credentialをerror、log、snapshotへ含めない。

## Test and verification boundary

- 新しいtest fileは作成Task内で`npm run test:webapp`へ登録する。
- focused testだけ通してTask完了としない。
- Task 3.1以降、`npm run check:webapp`はarchitecture checkerとtypecheckを両方実行する。
- architecture fixture testは違反例が実際にFAILすることを検証する。
- characterization testは検証対象handlerをmockへ置換しない。
- repository、View、Loader、Clockなどの外部境界だけをfakeにする。
- cancel、stop、failure時にPromiseがsettleすることをtimeout付きで検証する。

## Enforcement

`scripts/check-webapp-architecture.mjs`と`tests/architecture-boundaries.test.mjs`を実装上の正本とする。

checkerは少なくとも次を検証する。

- Domain/Use Case allowlist
- cross-feature `public-api.ts` rule
- public API concrete export禁止
- componentsのinfrastructure import禁止
- application shell責務
- vague new names
- deleted legacy import
- allowlist外の違反
- `comipath-application.ts` line limit

文書とcheckerが矛盾する場合は実装を停止し、同じTaskで両方を修正する。
