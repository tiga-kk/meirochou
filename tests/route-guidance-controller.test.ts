import { describe, expect, it, vi } from "vitest";
import { InMemoryMapAreaCatalog } from "../apps/webapp/js/features/route-guidance/infrastructure/in-memory-map-area-catalog";
import { RouteGuidanceController } from "../apps/webapp/js/features/route-guidance/ui/route-guidance-controller";
import { ChangeDestinationUseCase } from "../apps/webapp/js/features/route-guidance/use-cases/change-destination";
import { RouteGuidanceNavigationOperations } from "../apps/webapp/js/features/route-guidance/use-cases/route-guidance-navigation-operations";
import { createRouteGuidanceSession } from "../apps/webapp/js/features/route-guidance/use-cases/route-guidance-session";

const circles = [
  { space: "東A01a", account: "current" },
  { space: "東A02b", account: "second" },
  { space: "東A03c", account: "third" },
];

const crossAreaCircles = [
  { space: "東A01a", account: "east-current" },
  { space: "西A01a", account: "west-current" },
  { space: "西A02b", account: "west-next" },
];

const routeAssets = {
  points: {
    image: { width: 40, height: 10 },
    points: circles.map((_circle, index) => ({
      identifier: "A",
      number: index + 1,
      center_x: index * 10 + 15,
      center_y: 5,
      portals: [{ col: index + 1, row: 0, x: index * 10 + 15, y: 5 }],
    })),
  },
  gridMetadata: {
    width: 40,
    height: 10,
    cell_size: 10,
    cols: 4,
    rows: 1,
  },
  gridBytes: new Uint8Array([1, 1, 1, 1]),
};

function createChangeDestinationFixture({
  loadMapAssets = vi.fn(async () => routeAssets),
  areas = [{ areaId: "east", circleSpaces: circles.map((circle) => circle.space) }],
  snapshotOverrides = {},
}: {
  loadMapAssets?: ReturnType<typeof vi.fn>;
  areas?: Array<{ areaId: string; circleSpaces?: readonly string[] }>;
  snapshotOverrides?: Record<string, unknown>;
} = {}) {
  const session = createRouteGuidanceSession();
  const currentRoute = {
    cost: 10,
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ],
    points: [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
    ],
    startPosition: { x: 5, y: 5 },
    targetPosition: { x: 15, y: 5 },
    image: { width: 40, height: 10 },
  };
  session.replaceSnapshot({
    navigationState: {
      stage: "navigating",
      areaId: "east",
      currentPosition: {
        areaId: "east",
        gridIndex: 0,
        svgX: 5,
        svgY: 5,
        source: "manual-start",
      },
      targetSpace: circles[0].space,
      lockedFirstLeg: {
        from: { type: "start", areaId: "east", gridIndex: 0 },
        toSpace: circles[0].space,
      },
      provisionalOrder: circles.map((circle) => circle.space),
      bestOrder: circles.map((circle) => circle.space),
      optimizationGeneration: 1,
    },
    currentDestination: circles[0],
    currentRoute,
    selectedDestination: circles[0],
    selectedRoute: currentRoute,
    selectionStatus: "idle",
    routeOptimizationGeneration: 1,
    ...snapshotOverrides,
  });
  const useCase = new ChangeDestinationUseCase(
    session,
    new InMemoryMapAreaCatalog(areas),
    { loadMapAssets, clearCachedMapAssets() {} },
    new RouteGuidanceNavigationOperations(),
  );
  return { session, useCase };
}

describe("RouteGuidanceController", () => {
  it("coordinates start, destination selection, and resume operations", async () => {
    const startGuidance = { execute: vi.fn(async () => {}) };
    const resumeGuidance = { execute: vi.fn(async () => true) };
    const changeDestination = { execute: vi.fn(async () => {}) };
    const finishCircle = { execute: vi.fn(async () => {}) };
    const navigationRuntimeController = {
      getMatrixRef: vi.fn(() => null),
      initStartup: vi.fn(() => ({
        shouldShowResumeDialog: true,
        snapshot: {
          navState: { targetSpace: "東A01a" },
        },
      })),
    };

    const controller = new RouteGuidanceController({
      startGuidance: startGuidance as any,
      resumeGuidance: resumeGuidance as any,
      changeDestination: changeDestination as any,
      finishCircle: finishCircle as any,
      navigationRuntimeController: navigationRuntimeController as any,
    });

    await controller.resumeSavedGuidance(
      { eventId: "c108", dayId: "day1" },
      [],
    );
    expect(resumeGuidance.execute).toHaveBeenCalledOnce();
    expect(
      controller.initializeResumeStartup({
        eventDay: { eventId: "c108", dayId: "day1" },
        bundleVersion: "bundle-v1",
        circleStates: { 東A01a: "pending" },
        pendingCircleSpaces: ["東A01a"],
      }),
    ).toEqual({
      kind: "ready",
      targetSpace: "東A01a",
    });
    expect(navigationRuntimeController.initStartup).toHaveBeenCalledWith({
      eventId: "c108",
      dayId: "day1",
      bundleVersion: "bundle-v1",
      circleStates: { 東A01a: "pending" },
      pendingCircleSpaces: ["東A01a"],
    });

    await controller.startFromCurrentLocation({
      eventDay: { eventId: "c108", dayId: "day1" },
      bundleVersion: "bundle-v1",
      currentLocation: { areaId: "east", label: "A", number: "1" },
      pendingCircles: [{ space: "東A01a" }],
    });
    expect(startGuidance.execute).toHaveBeenCalledWith({
      eventDay: { eventId: "c108", dayId: "day1" },
      bundleVersion: "bundle-v1",
      currentLocation: { areaId: "east", label: "A", number: "1" },
      pendingCircles: [{ space: "東A01a" }],
      matrixRef: null,
      optimizationTimeLimitMs: 10000,
    });
  });

  it("delegates the finish input and result without rebuilding guidance", async () => {
    const finishCircle = {
      execute: vi.fn(async () => ({ kind: "advanced" as const })),
    };
    const controller = new RouteGuidanceController({
      startGuidance: {} as any,
      resumeGuidance: {} as any,
      changeDestination: {} as any,
      finishCircle: finishCircle as any,
    });
    const input = {
      action: "purchase" as const,
      completedSpace: "東A01a",
      remainingCircles: [{ space: "東A02b" }],
    };

    await expect(controller.finishCurrentCircle(input)).resolves.toEqual({
      kind: "advanced",
    });
    expect(finishCircle.execute).toHaveBeenCalledWith(input);
  });

  it("delegates the destination selection lifecycle to the use case", async () => {
    const changeDestination = {
      execute: vi.fn(async () => ({ kind: "selected" as const })),
      compare: vi.fn(() => true),
      confirm: vi.fn(() => circles[1]),
      cancelComparison: vi.fn(() => true),
      changeManually: vi.fn(async () => ({ kind: "changed" as const })),
      invalidatePendingSelection: vi.fn(),
    };
    const controller = new RouteGuidanceController({
      startGuidance: {} as any,
      resumeGuidance: {} as any,
      changeDestination: changeDestination as any,
      finishCircle: {} as any,
    });

    await controller.selectDestination(circles[1].space, circles);
    expect(controller.compareSelectedDestination()).toBe(true);
    expect(controller.confirmSelectedDestination()).toBe(circles[1]);
    expect(controller.cancelDestinationComparison()).toBe(true);
    await controller.setManualDestination(circles[1].space, circles);
    controller.invalidatePendingDestinationSelection();

    expect(changeDestination.execute).toHaveBeenCalledWith({
      circleSpace: circles[1].space,
      circles,
    });
    expect(changeDestination.compare).toHaveBeenCalledOnce();
    expect(changeDestination.confirm).toHaveBeenCalledOnce();
    expect(changeDestination.cancelComparison).toHaveBeenCalledOnce();
    expect(changeDestination.changeManually).toHaveBeenCalledWith({
      circleSpace: circles[1].space,
      circles,
    });
    expect(changeDestination.invalidatePendingSelection).toHaveBeenCalledOnce();
  });

  it("invalidates the active runtime job before clearing resume state on reset", () => {
    const session = { clear: vi.fn() };
    const navigationRuntimeController = {
      invalidateActiveOptimization: vi.fn(),
      setPendingResumeSnapshot: vi.fn(),
      setMatrixRef: vi.fn(),
    };
    const controller = new RouteGuidanceController({
      startGuidance: {} as any,
      resumeGuidance: {} as any,
      changeDestination: {} as any,
      finishCircle: {} as any,
      session: session as any,
      navigationRuntimeController: navigationRuntimeController as any,
    });

    controller.resetRuntimeState();

    expect(
      navigationRuntimeController.invalidateActiveOptimization,
    ).toHaveBeenCalledOnce();
    expect(
      navigationRuntimeController.setPendingResumeSnapshot,
    ).toHaveBeenCalledWith(null);
    expect(navigationRuntimeController.setMatrixRef).toHaveBeenCalledWith(null);
    expect(session.clear).toHaveBeenCalledOnce();
  });
});

describe("ChangeDestinationUseCase", () => {
  it("keeps the current route and navigation state when a candidate route is unavailable", async () => {
    const unavailableCircles = [
      ...circles,
      { space: "東A99z", account: "missing-on-map" },
    ];
    const { session, useCase } = createChangeDestinationFixture({
      areas: [
        {
          areaId: "east",
          circleSpaces: unavailableCircles.map((circle) => circle.space),
        },
      ],
    });
    const before = session.getSnapshot();

    await expect(
      useCase.execute({
        circleSpace: unavailableCircles[3].space,
        circles: unavailableCircles,
      }),
    ).resolves.toEqual({
      kind: "route-unavailable",
      reason: "not-found",
    });

    const after = session.getSnapshot();
    expect(after.currentDestination).toEqual(before.currentDestination);
    expect(after.currentRoute).toEqual(before.currentRoute);
    expect(after.currentRoute).not.toBe(before.currentRoute);
    expect(after.navigationState).toEqual(before.navigationState);
    expect(after.selectedDestination).toEqual(unavailableCircles[3]);
    expect(after.selectedRoute).toBeNull();
    expect(after.selectionStatus).toBe("error");
  });

  it("returns invalid-origin before route planning when the start area and candidate area differ", async () => {
    const loadMapAssets = vi.fn(async () => routeAssets);
    const { session, useCase } = createChangeDestinationFixture({
      loadMapAssets,
      areas: [
        { areaId: "east", circleSpaces: ["東A01a"] },
        { areaId: "west", circleSpaces: ["西A01a", "西A02b"] },
      ],
    });
    const before = session.getSnapshot();

    await expect(
      useCase.execute({
        circleSpace: crossAreaCircles[1].space,
        circles: crossAreaCircles,
      }),
    ).resolves.toEqual({
      kind: "route-unavailable",
      reason: "invalid-origin",
    });

    const after = session.getSnapshot();
    expect(loadMapAssets).not.toHaveBeenCalled();
    expect(after.currentDestination).toEqual(before.currentDestination);
    expect(after.currentRoute).toEqual(before.currentRoute);
    expect(after.navigationState).toEqual(before.navigationState);
    expect(after.selectionStatus).toBe("error");
  });

  it("uses the locked first-leg circle area as the origin for cross-area validation", async () => {
    const loadMapAssets = vi.fn(async () => routeAssets);
    const { session, useCase } = createChangeDestinationFixture({
      loadMapAssets,
      areas: [
        { areaId: "east", circleSpaces: ["東A01a"] },
        { areaId: "west", circleSpaces: ["西A01a", "西A02b"] },
      ],
      snapshotOverrides: {
        navigationState: {
          stage: "navigating",
          areaId: "east",
          currentPosition: {
            areaId: "east",
            gridIndex: 0,
            svgX: 5,
            svgY: 5,
            source: "gps",
          },
          targetSpace: crossAreaCircles[1].space,
          lockedFirstLeg: {
            from: { type: "circle", space: crossAreaCircles[1].space },
            toSpace: crossAreaCircles[2].space,
          },
          provisionalOrder: crossAreaCircles.map((circle) => circle.space),
          bestOrder: crossAreaCircles.map((circle) => circle.space),
          optimizationGeneration: 1,
        },
        currentDestination: crossAreaCircles[1],
        selectedDestination: crossAreaCircles[1],
      },
    });
    const before = session.getSnapshot();

    await expect(
      useCase.execute({
        circleSpace: crossAreaCircles[0].space,
        circles: crossAreaCircles,
      }),
    ).resolves.toEqual({
      kind: "route-unavailable",
      reason: "invalid-origin",
    });

    const after = session.getSnapshot();
    expect(loadMapAssets).not.toHaveBeenCalled();
    expect(after.currentDestination).toEqual(before.currentDestination);
    expect(after.currentRoute).toEqual(before.currentRoute);
    expect(after.navigationState).toEqual(before.navigationState);
    expect(after.selectionStatus).toBe("error");
  });

  it("does not commit a stale candidate route over a newer selection", async () => {
    let resolveFirstLoad!: (assets: typeof routeAssets) => void;
    const firstLoad = new Promise<typeof routeAssets>((resolve) => {
      resolveFirstLoad = resolve;
    });
    let loadCalls = 0;
    const loadMapAssets = async () => {
      loadCalls += 1;
      return loadCalls === 1 ? firstLoad : routeAssets;
    };
    const { session, useCase } = createChangeDestinationFixture({
      loadMapAssets,
    });

    const staleSelection = useCase.execute({
      circleSpace: circles[1].space,
      circles,
    });
    await vi.waitFor(() => expect(loadCalls).toBe(1));
    await expect(
      useCase.execute({ circleSpace: circles[2].space, circles }),
    ).resolves.toEqual({ kind: "selected" });
    resolveFirstLoad(routeAssets);
    await expect(staleSelection).resolves.toEqual({ kind: "stale" });

    expect(session.getSnapshot()).toMatchObject({
      selectedDestination: { space: circles[2].space },
      selectionStatus: "ready",
    });
    expect(session.getSnapshot().selectedRoute?.targetPosition).toEqual({
      x: 87.5,
      y: 50,
    });
  });

  it("moves compare and cancel through ready -> comparing -> ready without touching the current route", async () => {
    const { session, useCase } = createChangeDestinationFixture();
    const before = session.getSnapshot();

    await expect(
      useCase.execute({ circleSpace: circles[1].space, circles }),
    ).resolves.toEqual({ kind: "selected" });

    const ready = session.getSnapshot();
    expect(ready.selectionStatus).toBe("ready");
    expect(ready.currentDestination).toEqual(before.currentDestination);
    expect(ready.currentRoute).toEqual(before.currentRoute);

    expect(useCase.compare()).toBe(true);
    const comparing = session.getSnapshot();
    expect(comparing.selectionStatus).toBe("comparing");
    expect(comparing.currentDestination).toEqual(before.currentDestination);
    expect(comparing.currentRoute).toEqual(before.currentRoute);
    expect(comparing.selectedDestination).toEqual(ready.selectedDestination);
    expect(comparing.selectedRoute).toEqual(ready.selectedRoute);

    expect(useCase.cancelComparison()).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      currentDestination: before.currentDestination,
      currentRoute: before.currentRoute,
      selectedDestination: ready.selectedDestination,
      selectedRoute: ready.selectedRoute,
      selectionStatus: "ready",
    });
  });

  it("commits a manually changed route and navigation state together", async () => {
    const { session, useCase } = createChangeDestinationFixture();
    const replaceSnapshot = vi.spyOn(session, "replaceSnapshot");

    await expect(
      useCase.changeManually({ circleSpace: circles[1].space, circles }),
    ).resolves.toEqual({
      kind: "changed",
      destination: expect.objectContaining({ space: circles[1].space }),
    });

    const snapshot = session.getSnapshot();
    expect(replaceSnapshot).toHaveBeenCalledOnce();
    expect(snapshot.navigationState).toMatchObject({
      targetSpace: circles[1].space,
      lockedFirstLeg: {
        from: { type: "start", areaId: "east", gridIndex: 0 },
        toSpace: circles[1].space,
      },
    });
    expect(snapshot.currentDestination).toMatchObject({
      space: circles[1].space,
      gridDistance: 20,
      mapPosition: { x: 62.5, y: 50 },
    });
    expect(snapshot.currentRoute?.cost).toBe(20);
    expect(snapshot.selectedDestination).toEqual(snapshot.currentDestination);
    expect(snapshot.selectedRoute).toEqual(snapshot.currentRoute);
    expect(snapshot.selectionStatus).toBe("idle");
  });
});
