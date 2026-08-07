import { describe, expect, it, vi } from "vitest";
import { createRouteGuidanceSession } from "../apps/webapp/js/features/route-guidance/use-cases/route-guidance-session";

describe("RouteGuidanceSession", () => {
  it("maintains current guidance state and notifies subscribers atomically", () => {
    const session = createRouteGuidanceSession();
    const snapshots: any[] = [];

    session.subscribe((snap) => {
      snapshots.push(snap);
    });

    expect(session.getSnapshot()).toEqual({
      navigationState: null,
      currentDestination: null,
      currentRoute: null,
      selectedDestination: null,
      selectedRoute: null,
      selectionStatus: "idle",
      routeOptimizationGeneration: 0,
    });

    session.replaceSnapshot({
      navigationState: {
        stage: "navigating",
        areaId: "e456",
        currentPosition: null,
        targetSpace: "A01",
        lockedFirstLeg: null,
        provisionalOrder: ["A01"],
        bestOrder: ["A01"],
        optimizationGeneration: 1,
      },
      currentDestination: { space: "A01" } as any,
      currentRoute: {
        cost: 14,
        cells: [
          { col: 0, row: 0 },
          { col: 1, row: 1 },
        ],
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        startPosition: { x: 0, y: 0 },
        targetPosition: { x: 10, y: 10 },
        image: { width: 100, height: 100 },
      },
      selectedDestination: null,
      selectedRoute: null,
      selectionStatus: "ready",
      routeOptimizationGeneration: 1,
    });

    expect(snapshots.length).toBe(1);
    expect(snapshots[0].selectionStatus).toBe("ready");
    expect(snapshots[0].currentDestination?.space).toBe("A01");
    expect(Object.isFrozen(snapshots[0].navigationState)).toBe(true);
    expect(Object.isFrozen(snapshots[0].navigationState.provisionalOrder)).toBe(
      true,
    );

    session.clear();
    expect(snapshots.length).toBe(2);
    expect(snapshots[1].selectionStatus).toBe("idle");
    expect(snapshots[1].currentDestination).toBeNull();
  });
});
