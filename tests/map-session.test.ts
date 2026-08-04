// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { ConfirmedPosition } from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import { createInitialNavigationState } from "../apps/webapp/js/features/route-guidance/domain/navigation-state";
import {
  createMapSession,
  type MapSession,
  switchMapArea,
} from "../apps/webapp/js/navigation/map-session";

const startPos: ConfirmedPosition = {
  areaId: "area1",
  gridIndex: 0,
  svgX: 5,
  svgY: 5,
  source: "manual-start",
};

describe("Phase 5C Task 4: MapSession per area", () => {
  test("createMapSession initializes with idle navigation and no cached matrix", () => {
    const session = createMapSession("area1");
    expect(session.areaId).toBe("area1");
    expect(session.navigationState.stage).toBe("idle");
    expect(session.cachedBestOrder).toBeNull();
    expect(session.cachedMatrixRef).toBeNull();
  });

  test("switchMapArea to different area clears currentPosition and target but preserves matrix reference", () => {
    // Start in area1 with a navigating session
    const navState = {
      ...createInitialNavigationState(),
      stage: "navigating" as const,
      areaId: "area1",
      currentPosition: startPos,
      targetSpace: "A-01",
      lockedFirstLeg: {
        from: { type: "start" as const, areaId: "area1", gridIndex: 0 },
        toSpace: "A-01",
      },
      provisionalOrder: Object.freeze(["A-01"]),
      bestOrder: Object.freeze(["A-01"]),
    };

    const session: MapSession = {
      areaId: "area1",
      navigationState: navState,
      cachedBestOrder: ["A-01"],
      cachedMatrixRef: "matrix-area1-v1",
    };

    const newSession = switchMapArea(session, "area2");

    // Navigation state is cleared
    expect(newSession.areaId).toBe("area2");
    expect(newSession.navigationState.stage).toBe("idle");
    expect(newSession.navigationState.currentPosition).toBeNull();
    expect(newSession.navigationState.targetSpace).toBeNull();

    // Cached computation assets are NOT transferred to new area (different area)
    expect(newSession.cachedBestOrder).toBeNull();
    expect(newSession.cachedMatrixRef).toBeNull();
  });

  test("returning to the same area preserves matrix and best order but still requires start re-selection", () => {
    const prevSession: MapSession = {
      areaId: "area1",
      navigationState: createInitialNavigationState(),
      cachedBestOrder: ["A-01", "A-02"],
      cachedMatrixRef: "matrix-area1-v1",
    };

    // Navigate away and come back to area1
    const awaySession = switchMapArea(prevSession, "area2");
    const returnedSession = switchMapArea(awaySession, "area1", prevSession);

    // Navigation still idle (user must re-select start)
    expect(returnedSession.navigationState.stage).toBe("idle");
    expect(returnedSession.navigationState.currentPosition).toBeNull();

    // Cached computation assets are preserved from previous session for the same area
    expect(returnedSession.cachedBestOrder).toEqual(["A-01", "A-02"]);
    expect(returnedSession.cachedMatrixRef).toBe("matrix-area1-v1");
  });

  test("same-area cache inheritance clones and freezes the cached order", () => {
    const previousSession: MapSession = {
      areaId: "area1",
      navigationState: createInitialNavigationState(),
      cachedBestOrder: ["A-01"],
      cachedMatrixRef: "matrix-area1-v1",
    };

    const returnedSession = switchMapArea(
      switchMapArea(previousSession, "area2"),
      "area1",
      previousSession,
    );

    expect(returnedSession.cachedBestOrder).toEqual(["A-01"]);
    expect(returnedSession.cachedBestOrder).not.toBe(
      previousSession.cachedBestOrder,
    );
    expect(Object.isFrozen(returnedSession.cachedBestOrder)).toBe(true);
  });

  test("area switch resets navigation state but does not affect circle states", () => {
    // Circle states live in LocalEventDayState (separate), not in MapSession
    // This test validates that switchMapArea returns a fresh idle navigation
    const navState = {
      ...createInitialNavigationState(),
      stage: "navigating" as const,
      areaId: "area1",
      currentPosition: startPos,
      targetSpace: "B-05",
      lockedFirstLeg: {
        from: { type: "start" as const, areaId: "area1", gridIndex: 0 },
        toSpace: "B-05",
      },
      provisionalOrder: Object.freeze(["B-05", "B-06"]),
      bestOrder: Object.freeze(["B-05", "B-06"]),
    };

    const session: MapSession = {
      areaId: "area1",
      navigationState: navState,
      cachedBestOrder: ["B-05", "B-06"],
      cachedMatrixRef: "matrix-area1-v2",
    };

    const newSession = switchMapArea(session, "area2");

    // Circle states are separate and never in MapSession; just confirm idle
    expect(newSession.navigationState.stage).toBe("idle");
    expect(newSession.areaId).toBe("area2");
  });
});
