# Webapp Module Boundaries

この文書はPhase 5D以降の`apps/webapp/`における依存方向とstate ownershipの正本である。命名は`webapp-naming-guidelines.md`に従う。

## Allowed dependency direction

```text
components / feature UI
          ↓
feature use cases
          ↓
feature domain

feature use cases
          ↓ depend on contracts
feature infrastructure
          ↑ implements contracts
```

`app/assemble-comipath-application.ts`だけがconcrete infrastructureを生成し、feature間を接続する。

## Target directory roles

| Directory | Responsibility | May depend on |
|---|---|---|
| `app/` | browser entrypoint、dependency assembly、global lifecycle | feature public API、concrete infrastructure |
| `features/*/domain/` | feature固有型、pure rule、pure algorithm | same feature domain、`shared/domain` |
| `features/*/use-cases/` | ユーザー操作の処理順序、外部依存contract | same feature domain、same feature contracts、他feature `public-api.ts` |
| `features/*/infrastructure/` | LocalStorage、GAS、HTTP、Web Worker実装 | same feature domain/use-case contracts、`shared/browser` |
| `features/*/ui/` | Controller、View contract、DOM View、screen model | same feature use cases/domain、components、`shared/ui` |
| `features/*/public-api.ts` | cross-featureで利用可能な型と操作 | same feature内 |
| `shared/domain/` | 複数featureで意味が完全に同じpure type | browser APIなし |
| `shared/browser/` | clock、UUID、safe URL、download等のbrowser実装 | browser API、`shared/domain` |
| `shared/ui/` | notification、focus、image layout等の汎用UI | DOM、`shared/domain` |
| `components/` | Lit custom elements | feature UI contract、`shared/ui` |

## Forbidden imports

- `domain/`からDOM、LocalStorage、`fetch`、`Worker`を利用するmodule
- `use-cases/`から`components/`、feature `ui/`、concrete `infrastructure/`
- feature Aからfeature Bの`public-api.ts`以外へのimport
- `components/`からrepository、GAS client、HTTP loader、Worker optimizer
- `comipath-application.ts`からrouting algorithm、CSV parser、storage key、GAS protocol
- `shared/`へfeature固有state machineを移すこと
- deleted legacy fileをproductionまたはtestからimportすること
- cross-feature importのための`index.ts` barrel file
-新規file/class名に`Manager`、`Handler`、`Helper`、`Utils`、`Common`を使うこと

## State ownership

| State | Single owner |
|---|---|
| active event/day and persisted day state | `ActiveEventDaySession` |
| circle status mutation result | active event/day stateの`circleStates` |
| route target、route、selection、Worker generation | `RouteGuidanceSession` |
| source draft、preview、request token、AbortController | `CircleDataSourceSession` |
| UI-only state | 対応するfeature View |
| persistent data | 対応するRepository |

同じstateを複数classのmutable propertyへ複製しない。circle一覧、購入済み一覧、保留一覧はactive stateから都度導出する。

## Browser event binding

browser event bindingはfeature Controllerまたは`app/bind-browser-events.ts`に限定する。Use CaseはDOM event名とelement IDを知らない。

bindしたlistener、timer、coordinator、Workerはownerの`stop()`または`dispose()`で解除する。再起動でlistenerを二重登録しない。

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

raw CSV cell、GAS URL、sheet内容、外部投稿本文、credentialをerror、log、snapshotへ含めない。

## Enforcement

`scripts/check-webapp-architecture.mjs`と`tests/architecture-boundaries.test.mjs`を正本とする。

checkerは少なくとも次を検証する。

- directory dependency rule
- cross-feature `public-api.ts` rule
- vague new names
- deleted legacy import
- `comipath-application.ts`の責務とline数
- architecture allowlist外の違反

文書とcheckerが矛盾する場合は実装を停止し、同じTaskで両方を修正する。
