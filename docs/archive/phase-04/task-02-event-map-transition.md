# Phase 4 Task 2: Prepare and Commit Event-Scoped Map Transitions

> **Depends on:** Task 1. **Scope:** Loader, transition service, state activation, and regression tests. The selector component is Task 3.

## Goal

Replace the first-event compatibility alias at runtime with a registry-resolved manifest loader and a two-phase transition that never displays state and map from different events.

## Files

- Modify: `apps/webapp/js/map-manifest-loader.ts`
- Modify: `apps/webapp/js/data/event-registry.ts`
- Create: `apps/webapp/js/state/event-day-transition-service.ts`
- Create: `tests/event-day-transition-service.test.ts`
- Modify: `apps/webapp/js/data-manager.ts`
- Modify: `apps/webapp/js/state/event-day-repository.ts`
- Modify: `apps/webapp/js/app.js`
- Modify: `apps/webapp/js/ui-manager.js` only for explicit reset/render hooks
- Modify: `tests/map-manifest-loader.test.ts`
- Modify: `tests/event-registry.test.ts`
- Modify: `package.json`

## Interfaces: registry and loader

```ts
export interface LoadedEventRegistry {
  readonly registry: EventRegistryV1;
  readonly registryUrl: string;
}

export function resolveEventMapManifestUrl(
  registryUrl: string,
  event: EventRegistryEntryV1,
): string;

export function loadMapBundleManifestFromUrl(
  manifestUrl: string,
  options?: { readonly fetcher?: typeof fetch; readonly signal?: AbortSignal },
): Promise<MapBundleManifestV1>;
```

Deprecate fixed `./assets/maps/manifest.json` for runtime selection. Bootstrap loads `/assets/events/manifest.json`, resolves the default event's declared `mapBundle`, and then loads that event-scoped URL. The compatibility alias may remain in Vite for older direct tests but App must never call it after this Task.

## Interfaces: transition service

```ts
export interface PreparedEventDayTransition {
  readonly token: string;
  readonly ref: EventDayRef;
  readonly event: EventRegistryEntryV1;
  readonly manifest: MapBundleManifestV1;
  readonly state: LocalEventDayState;
  readonly createsState: boolean;
}

export class EventDayTransitionService {
  prepare(ref: EventDayRef, signal?: AbortSignal): Promise<PreparedEventDayTransition>;
  commit(prepared: PreparedEventDayTransition): LocalEventDayState;
}
```

`prepare()` performs all registry lookup, manifest fetch/parse/eventId match, and target-state validation without changing active state, last-opened, Config, caches, or DOM. It reuses the current validated manifest for a day-only switch.

`commit()` rejects an unknown, expired, superseded, or already-used token. Repository activation of an optional new empty state plus `last-opened` must be failure-safe; add a repository method that rolls back both keys/index on failure rather than calling `save()` and `setLastOpened()` independently.

## App commit port

Before mutating display state, App captures:

- active ref/state and legacy arrays;
- current manifest and `Config.AREAS`;
- route assets cache;
- current/selected/next targets and routes;
- selection state/token/message;
- current area/location values needed to rerender.

After service commit succeeds, App applies the prepared manifest, clears route/pin/selection caches, updates DataManager active memory, and asks UIManager to render the new state. If display application throws, restore the captured in-memory/config/UI snapshot and previous last-opened through a tested rollback method. Never continue with partially reset route objects.

## TDD steps

- [x] **Step 1: Write loader tests**

Cover relative URL resolution, traversal/absolute URL rejection from the registry parser, encoded paths, HTTP/JSON/parser errors, abort, and `manifest.eventId` mismatch. Assert requested URL is `/assets/maps/<eventId>/manifest.json`, never `/assets/maps/manifest.json` for a non-default event.

- [x] **Step 2: Write prepare tests**

Cover registered/unregistered ref, existing/empty target state, same-event day switch with no second manifest GET, event switch with one GET, overlapping prepares where the older result is superseded, and zero mutations before commit.

- [x] **Step 3: Write commit/rollback tests**

Cover new empty-state activation, existing state activation, repository quota failure, last-opened failure, used/stale token, Config/UI render failure, and preservation of the old map/state/caches on every failure.

- [x] **Step 4: Verify RED**

```bash
npx vitest run --root . tests/map-manifest-loader.test.ts tests/event-day-transition-service.test.ts
```

- [x] **Step 5: Implement two-phase transition**

Keep map asset loading relative to each parsed manifest URL. Do not mutate `Config` during `prepare()`. Make transition token/abort handling injectable and deterministic in tests.

- [x] **Step 6: Replace bootstrap fixed-alias use**

Bootstrap loads the registry then calls the same prepare/commit path used by later selector events. Default is the first registry event/day unless a valid last-opened ref exists. Invalid last-opened falls back without deleting it until default activation succeeds.

- [x] **Step 7: Verify regression and build contract**

```bash
npx vitest run --root . tests/map-manifest-loader.test.ts tests/event-day-transition-service.test.ts tests/event-registry.test.ts tests/map-bundle-selection.test.ts
npm run verify
npx biome check
npm run test:e2e
```

Original snapshots must remain byte-identical.

- [x] **Step 8: Present commit candidate** — Commit `f01ee48`

Proposed message: `feat(map): switch event bundles atomically`.

## Review checklist

- Prepare has no persisted/global/DOM side effects.
- EventId is checked in registry, manifest, and target ref.
- Day-only switch avoids redundant map fetch.
- Failure restores old display and last-opened without mismatch.
- App no longer relies on first-event alias for runtime selection.
