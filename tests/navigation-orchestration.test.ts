// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createInitialNavigationState } from "../apps/webapp/js/features/route-guidance/domain/navigation-state";
import { NavigationOrchestrationService } from "../apps/webapp/js/navigation/navigation-orchestration";
import type {
  CircleRecord,
  ConfirmedPosition,
} from "../apps/webapp/js/types/domain";

const startPos: ConfirmedPosition = {
  areaId: "e456",
  gridIndex: 0,
  svgX: 10,
  svgY: 10,
  source: "manual-start",
};

const circles: CircleRecord[] = [
  { space: "A-01", priority: 5 },
  { space: "A-02", priority: 3 },
  { space: "A-03", priority: 1 },
];

describe("Phase 5C Task 7: navigation-orchestration integration", () => {
  test("initial start immediately picks nearest candidate as target", () => {
    const service = new NavigationOrchestrationService();
    const navState = createInitialNavigationState();

    const startDistances = new Map([
      ["A-01", 100],
      ["A-02", 50], // Nearest
      ["A-03", 200],
    ]);

    const result = service.startNavigation({
      navState,
      startPosition: startPos,
      pendingCircles: circles,
      startDistances,
    });

    expect(result.navState.stage).toBe("navigating");
    expect(result.navState.targetSpace).toBe("A-02");
    expect(result.navState.provisionalOrder[0]).toBe("A-02");
    expect(result.navState.currentPosition).toEqual(startPos);
  });

  test("worker progress updates bestOrder but does NOT alter current target or position", () => {
    const service = new NavigationOrchestrationService();
    const navState = {
      ...createInitialNavigationState(),
      stage: "navigating" as const,
      areaId: "e456",
      currentPosition: startPos,
      targetSpace: "A-02",
      lockedFirstLeg: {
        from: { type: "start" as const, areaId: "e456", gridIndex: 0 },
        toSpace: "A-02",
      },
      provisionalOrder: Object.freeze(["A-02", "A-01", "A-03"]),
      bestOrder: Object.freeze(["A-02", "A-01", "A-03"]),
    };

    const newBestOrder = ["A-02", "A-03", "A-01"];
    const updated = service.handleWorkerProgress(navState, newBestOrder);

    expect(updated.targetSpace).toBe("A-02");
    expect(updated.currentPosition).toEqual(startPos);
    expect(updated.bestOrder).toEqual(newBestOrder);
  });

  test("worker result keeps the current target first and leaves the provisional order untouched", () => {
    const service = new NavigationOrchestrationService();
    const navState = {
      ...createInitialNavigationState(),
      stage: "navigating" as const,
      areaId: "e456",
      currentPosition: startPos,
      targetSpace: "A-02",
      lockedFirstLeg: {
        from: { type: "start" as const, areaId: "e456", gridIndex: 0 },
        toSpace: "A-02",
      },
      provisionalOrder: Object.freeze(["A-02", "A-01", "A-03"]),
      bestOrder: Object.freeze(["A-02", "A-01", "A-03"]),
    };

    const updated = service.handleWorkerProgress(navState, ["A-03", "A-01"]);

    expect(updated.targetSpace).toBe("A-02");
    expect(updated.bestOrder).toEqual(["A-02", "A-03", "A-01"]);
    expect(updated.provisionalOrder).toEqual(["A-02", "A-01", "A-03"]);
  });

  test("stale worker generation is ignored after a newer optimization starts or is cancelled", () => {
    const service = new NavigationOrchestrationService();
    const initial = {
      ...createInitialNavigationState(),
      stage: "navigating" as const,
      areaId: "e456",
      currentPosition: startPos,
      targetSpace: "A-02",
      lockedFirstLeg: {
        from: { type: "start" as const, areaId: "e456", gridIndex: 0 },
        toSpace: "A-02",
      },
      provisionalOrder: Object.freeze(["A-02", "A-01", "A-03"]),
      bestOrder: Object.freeze(["A-02", "A-01", "A-03"]),
    };

    const first = service.startOptimization(initial);
    const cancelled = service.cancelOptimization(first.navState);
    const ignored = service.handleWorkerProgress(
      cancelled,
      ["A-03", "A-01"],
      first.generation,
    );

    expect(ignored).toBe(cancelled);
    expect(ignored.bestOrder).toEqual(["A-02", "A-01", "A-03"]);
  });

  test("before-arrival hold keeps currentPosition at last confirmed position and advances target", () => {
    const service = new NavigationOrchestrationService();
    const navState = {
      ...createInitialNavigationState(),
      stage: "navigating" as const,
      areaId: "e456",
      currentPosition: startPos,
      targetSpace: "A-02",
      lockedFirstLeg: {
        from: { type: "start" as const, areaId: "e456", gridIndex: 0 },
        toSpace: "A-02",
      },
      provisionalOrder: Object.freeze(["A-02", "A-01", "A-03"]),
      bestOrder: Object.freeze(["A-02", "A-01", "A-03"]),
    };

    const result = service.handleBeforeArrivalHold(navState);

    // Position MUST NOT change to A-02 before arrival
    expect(result.navState.currentPosition).toEqual(startPos);
    expect(result.navState.targetSpace).toBe("A-01");
    expect(result.heldSpace).toBe("A-02");
    expect(result.navState.lockedFirstLeg).toEqual({
      from: { type: "start", areaId: "e456", gridIndex: 0 },
      toSpace: "A-01",
    });
  });

  test("arrival then purchase moves currentPosition to target and uses prepared next target", () => {
    const service = new NavigationOrchestrationService();
    const navState = {
      ...createInitialNavigationState(),
      stage: "navigating" as const,
      areaId: "e456",
      currentPosition: startPos,
      targetSpace: "A-02",
      lockedFirstLeg: {
        from: { type: "start" as const, areaId: "e456", gridIndex: 0 },
        toSpace: "A-02",
      },
      provisionalOrder: Object.freeze(["A-02", "A-01", "A-03"]),
      bestOrder: Object.freeze(["A-02", "A-01", "A-03"]),
    };

    const targetPos: ConfirmedPosition = {
      areaId: "e456",
      gridIndex: 5,
      svgX: 50,
      svgY: 50,
      source: "arrived-circle",
      circleSpace: "A-02",
    };

    // Arrive
    const arrivedState = service.handleArrival(navState, targetPos);
    expect(arrivedState.stage).toBe("atTarget");
    expect(arrivedState.currentPosition).toEqual(targetPos);

    // Purchase then next
    const purchasedState = service.handlePurchaseNext(arrivedState);
    expect(purchasedState.stage).toBe("navigating");
    expect(purchasedState.targetSpace).toBe("A-01");
    expect(purchasedState.currentPosition).toEqual(targetPos);
  });

  test("manual target change sets fixedFirstTarget and does not trigger matrix regeneration", () => {
    const service = new NavigationOrchestrationService();
    const navState = {
      ...createInitialNavigationState(),
      stage: "navigating" as const,
      areaId: "e456",
      currentPosition: startPos,
      targetSpace: "A-02",
      lockedFirstLeg: {
        from: { type: "start" as const, areaId: "e456", gridIndex: 0 },
        toSpace: "A-02",
      },
      provisionalOrder: Object.freeze(["A-02", "A-01", "A-03"]),
      bestOrder: Object.freeze(["A-02", "A-01", "A-03"]),
    };

    const result = service.handleManualTarget(navState, "A-03");

    expect(result.navState.targetSpace).toBe("A-03");
    expect(result.navState.provisionalOrder[0]).toBe("A-03");
    expect(result.navState.lockedFirstLeg).toEqual({
      from: { type: "start", areaId: "e456", gridIndex: 0 },
      toSpace: "A-03",
    });
    expect(result.requiresMatrixRegeneration).toBe(false);
  });

  test("manual target from an arrived circle starts the locked leg at the confirmed position", () => {
    const service = new NavigationOrchestrationService();
    const arrivedPosition: ConfirmedPosition = {
      areaId: "e456",
      gridIndex: 5,
      svgX: 50,
      svgY: 50,
      source: "arrived-circle",
      circleSpace: "A-02",
    };
    const navState = {
      ...createInitialNavigationState(),
      stage: "atTarget" as const,
      areaId: "e456",
      currentPosition: arrivedPosition,
      targetSpace: "A-02",
      lockedFirstLeg: {
        from: { type: "start" as const, areaId: "e456", gridIndex: 0 },
        toSpace: "A-02",
      },
      provisionalOrder: Object.freeze(["A-02", "A-01", "A-03"]),
      bestOrder: Object.freeze(["A-02", "A-01", "A-03"]),
    };

    const result = service.handleManualTarget(navState, "A-03");

    expect(result.navState.lockedFirstLeg).toEqual({
      from: { type: "circle", space: "A-02" },
      toSpace: "A-03",
    });
  });

  test("bulk return of held circles requires explicit confirmation before state change", () => {
    const service = new NavigationOrchestrationService();

    // Before confirmation: return pending action confirmation state
    const prompt = service.prepareHeldBulkReturn(["A-02"]);
    expect(prompt.requiresConfirmation).toBe(true);
    expect(prompt.heldCount).toBe(1);

    // After confirmation: return state
    const restored = service.confirmHeldBulkReturn(["A-02"]);
    expect(restored.restoredSpaces).toEqual(["A-02"]);
  });
});
