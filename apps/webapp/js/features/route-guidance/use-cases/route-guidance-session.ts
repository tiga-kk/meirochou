import type {
  RouteGuidanceSession,
  RouteGuidanceSessionSnapshot,
} from "../domain/route-guidance-types";

function createInitialSnapshot(): RouteGuidanceSessionSnapshot {
  return {
    navigationState: null,
    currentDestination: null,
    currentRoute: null,
    selectedDestination: null,
    selectedRoute: null,
    selectionStatus: "idle",
    routeOptimizationGeneration: 0,
  };
}

function freezeSnapshot(
  snapshot: RouteGuidanceSessionSnapshot,
): RouteGuidanceSessionSnapshot {
  const navigationState = snapshot.navigationState
    ? Object.freeze({
        ...snapshot.navigationState,
        provisionalOrder: Object.freeze([
          ...snapshot.navigationState.provisionalOrder,
        ]),
        bestOrder: Object.freeze([...snapshot.navigationState.bestOrder]),
      })
    : null;
  const freezeRoute = (route: RouteGuidanceSessionSnapshot["currentRoute"]) =>
    route
      ? Object.freeze({
          ...route,
          cells: Object.freeze(
            route.cells.map((cell) => Object.freeze({ ...cell })),
          ),
          points: Object.freeze(
            route.points.map((point) => Object.freeze({ ...point })),
          ),
          startPosition: Object.freeze({ ...route.startPosition }),
          targetPosition: Object.freeze({ ...route.targetPosition }),
          image: Object.freeze({ ...route.image }),
        })
      : null;

  return Object.freeze({
    ...snapshot,
    navigationState,
    currentRoute: freezeRoute(snapshot.currentRoute),
    selectedRoute: freezeRoute(snapshot.selectedRoute),
  });
}

export function createRouteGuidanceSession(): RouteGuidanceSession {
  let current: RouteGuidanceSessionSnapshot = createInitialSnapshot();
  const listeners = new Set<(snapshot: RouteGuidanceSessionSnapshot) => void>();

  const notify = (): void => {
    const snap = current;
    for (const listener of listeners) listener(snap);
  };

  return {
    getSnapshot: () => current,
    replaceSnapshot(snapshot) {
      current = freezeSnapshot(snapshot);
      notify();
    },
    clear() {
      current = createInitialSnapshot();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
