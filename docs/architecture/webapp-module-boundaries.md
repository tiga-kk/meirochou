# Webapp Module Boundaries

この文書はPhase 5D以降のproduction Webapp module依存規則の正本である。

## Allowed dependency direction

```text
components / presentation
          ↓
application
          ↓
domain

application
          ↓
ports
          ↑
infrastructure
```

`app/composition-root.ts`はconcrete infrastructureとfeature applicationを接続する唯一の場所である。

## Directory roles

| Directory | Role | May depend on |
|---|---|---|
| `app/` | bootstrap、composition、global lifecycle | feature public API、concrete infrastructure |
| `features/*/domain/` | feature固有型とpure rule | same feature domain、`shared/domain` |
| `features/*/application/` | Use Caseと処理順序 | same feature domain、ports、他feature public application contract |
| `features/*/ports/` | 外部操作のinterface | domain type |
| `features/*/infrastructure/` | LocalStorage、GAS、fetch、Worker adapter | same feature ports/domain、shared infrastructure |
| `features/*/presentation/` | Controller、View、view model | same feature application/domain、components |
| `shared/domain/` | 複数featureで意味が同一のpure type | no browser API |
| `shared/infrastructure/` | clock、UUID、download等の汎用adapter | browser API、shared domain |
| `shared/presentation/` | toast、focus等の汎用View | DOM |
| `components/` | Lit custom elements | presentation contract、shared presentation |

## Forbidden imports

- `domain/`から`document`、`window`、LocalStorage、`fetch`、`Worker`を利用するmodule
- `application/`から`components/`、`presentation/`、concrete `infrastructure/`
- feature Aからfeature Bの内部pathへのdeep import
- `components/`からrepository、GAS client、Worker controller
- `app/app.ts`からroute algorithm、CSV parser、storage key、GAS protocol
- `shared/`へfeature固有state machineを移すこと
- production sourceから削除済みlegacy facadeをimportすること

## Feature public API

各feature rootの`index.ts`だけをcross-feature importに使う。

```ts
// Allowed
import type { CircleStateCommands } from "../circle-state";

// Forbidden
import { PurchaseMutationService } from "../circle-state/infrastructure/purchase-mutation-service";
```

`index.ts`はconcrete infrastructureを公開しない。composition rootが同feature内のconcrete pathをimportすることだけは許可する。

## State ownership

- active event/day: `ActiveEventDaySession`
- circle states: active event/day state内の`circleStates`
- navigation runtime: Navigation feature session
- source preview request state: Source Management feature session
- view state: 対応するfeature View
- persistent state: repository / snapshot port

同じstateを複数classのmutable propertyへ複製しない。derived listはqueryで生成し、保存正本にしない。

## Event binding

DOM event bindingはfeature presentationまたは`app/app-lifecycle.ts`に限定する。Use CaseはDOM event名を知らない。

bindしたlistener、timer、coordinator、Workerは`dispose()`で解除する。

## Error boundary

Domain error -> Application error -> Controller messageの順で変換する。Infrastructure errorをUIへそのまま表示しない。

## Enforcement

`scripts/check-webapp-architecture.mjs`と`tests/architecture-boundaries.test.mjs`を正本とする。文書とcheckerが矛盾する場合は、Task実装を停止して両方を同じcommitで修正する。
