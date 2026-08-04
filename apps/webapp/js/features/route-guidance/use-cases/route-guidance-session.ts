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
      current = Object.freeze({ ...snapshot });
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
