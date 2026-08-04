# Webapp Module Boundaries

This document is the canonical dependency, concrete-implementation visibility, runtime ownership, and semantic-facade rule set for `apps/webapp/` after Phase 5D.

## Allowed dependency direction

```text
components / feature UI
          ↓
feature Controller
          ↓
feature Use Case
          ↓
feature Domain

Use Case ── depends on capability interface
                         ↑ implemented by
Infrastructure ──────────┘
```

`app/assemble-comipath-application.ts` is the only module that creates concrete infrastructure and connects features.

## Directory roles

| Directory | Responsibility | Allowed dependencies |
|---|---|---|
| `app/` | browser entrypoint, composition, global lifecycle, explicit browser-event binding | feature public APIs; only assembly may import feature infrastructure |
| `features/*/domain/` | feature types, pure validation, transitions and algorithms | same feature domain, `shared/domain` |
| `features/*/use-cases/` | user-operation ordering, capability interfaces, feature runtime Session | same feature domain/use-cases, `shared/domain`, other feature `public-api.ts` |
| `features/*/infrastructure/` | LocalStorage, GAS, HTTP, Worker, browser download | same feature domain and use-case interfaces, `shared/browser` |
| `features/*/ui/` | Controller, View interface, DOM View, screen model, custom-event parser | same feature domain/use-cases, components, `shared/ui`, other feature public APIs |
| `features/*/public-api.ts` | cross-feature domain/capability/controller contracts | same feature contracts only |
| `shared/domain/` | immutable types/interfaces whose business meaning is identical across features | no browser APIs |
| `shared/browser/` | browser-specific generic implementations | browser APIs, `shared/domain` |
| `shared/ui/` | generic notification/focus/image-layout UI | DOM, `shared/domain` |
| `components/` | Lit elements | feature UI models/events and `shared/ui` |

## Use Case import allowlist

A Use Case file may import only:

1. the same feature's `domain/`;
2. the same feature's `use-cases/`;
3. `shared/domain/`;
4. another feature's `public-api.ts`;
5. type-only imports satisfying the same rules.

It may not access DOM, LocalStorage, `fetch`, Worker, AbortController/AbortSignal, concrete clients/loaders/repositories, components, or feature UI.

## Repository and client placement

- interfaces live under the owning feature `use-cases/`;
- LocalStorage/HTTP/GAS/Worker/browser implementations live under `infrastructure/`;
- interface and concrete class do not share a file;
- storage keys and schema parsing are private to concrete infrastructure;
- assembly imports concrete paths directly;
- public APIs do not export concrete infrastructure.

## Feature public API

May export:

- domain types;
- capability interfaces;
- Use Case/controller/View contracts required by another feature or app assembly;
- pure factories that do not create browser/concrete infrastructure.

Must not export:

- LocalStorage, HTTP, GAS, Worker, or browser concrete classes;
- DOM View concrete classes;
- storage keys;
- Worker protocols;
- same-feature infrastructure barrels.

## Semantic facade prohibition

Deleting an old filename is not sufficient. A replacement is a forbidden semantic facade when it has one or more of these properties:

- owns mutable state belonging to two or more canonical features;
- performs DOM queries/rendering for two or more canonical features;
- constructs concrete dependencies for multiple features outside assembly;
- binds unrelated feature events and contains business branches;
- combines event/day, source, route, status, deletion, Worker, timer, and notification lifecycle;
- aggregates contracts or parsers whose business owners are different features.

Final prohibited paths include:

- `apps/webapp/js/comipath-browser-runtime.js`
- `apps/webapp/js/event-day-data-store.ts`
- `apps/webapp/js/comipath-dom-coordinator.js`
- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`

The checker must also reject equivalent replacements with different names. At minimum, a direct child of `apps/webapp/js/` outside `app/` may not combine state/DOM/lifecycle with internals from multiple canonical features.

## State ownership

| State | Single owner |
|---|---|
| active event/day and active persisted state | `ActiveEventDaySession` |
| derived circle lists | `ActiveEventDayReader` |
| circle status and pending GAS updates | active state `circleStates` and `gasOutbox`, changed by Circle Status use cases |
| route target, route, selection and Worker generation | `RouteGuidanceSession` |
| source draft, preview and request generation | `CircleDataSourceSession` |
| current cancelable source request | one Circle Data Source controller/request owner |
| feature-only transient UI state | corresponding feature View |
| persisted data | owning Repository implementation |

No state is copied into a root application/runtime facade.

## Pending GAS updates

The only persisted source of truth is `LocalEventDayState.gasOutbox`.

- no second LocalStorage queue/key;
- status change and outbox append are saved as one next state;
- background delivery begins only after durable save;
- success removal and failed-attempt update are persisted;
- existing field name and JSON shape remain unchanged.

## Cancellation boundary

Use Cases and Sessions do not expose AbortController/AbortSignal.

```ts
export interface CancelableRequest<T> {
  readonly result: Promise<T>;
  cancel(): void;
}
```

Only browser infrastructure uses AbortController internally. The owning controller cancels on replacement, settings close, event/day change, and stop. Stale completions do not update Session, repository, or View.

## Browser lifecycle and event binding

- `browser-entrypoint.ts`: assembly and runner call only;
- `run-comipath-in-browser.ts`: DOMContentLoaded, pagehide, pending start Promise;
- `assemble-comipath-application.ts`: all concrete dependency creation;
- `comipath-application.ts`: controller/background-process start/stop order only;
- `bind-browser-events.ts`: explicit custom-event/DOM routing and cleanup only.

Contracts:

- start/stop are idempotent;
- stop before DOM readiness settles the pending Promise;
- startup failure is terminal for the same instance;
- started resources stop once in reverse ownership order;
- stop cancels listeners, timers, requests and Workers;
- stale async continuation does not update state or View;
- event binder contains no business logic or message formatting.

## Central contract and parser prohibition

A single file must not aggregate types/parsers from several canonical features.

- types belong to the feature that defines their business meaning;
- other features import them through the owner public API;
- a shared type is allowed only when its meaning is identical in at least two features;
- parsers belong to the boundary that receives the unknown value;
- parser errors redact raw CSV cells, GAS URLs, sheet content, external posts, credentials and local paths.

Forbidden replacement names include `application-types`, `common-types`, `domain-types`, `boundary-parsers`, `shared-parser`, and equivalent god files.

## Testing and enforcement

Every new test is registered in normal `npm run test:webapp`.

Required tests/checker coverage:

- Domain/Use Case import allowlist;
- cross-feature public API rule;
- concrete public-export prohibition;
- component infrastructure prohibition;
- application shell line/responsibility rules;
- exact original and renamed facade absence;
- equivalent semantic facade fixtures;
- central contract/parser fixtures;
- production composition-root wiring for all canonical controllers;
- browser event registration and cleanup;
- characterization through real assembly with fake external boundaries;
- cancellation and lifecycle Promise settlement.

A characterization test must not mock the handler under test. It verifies repository effects, Session state and View calls.

`scripts/check-webapp-architecture.mjs` and `tests/architecture-boundaries.test.mjs` are the executable source of truth. If they conflict with this document, stop and repair both in the same Task.
