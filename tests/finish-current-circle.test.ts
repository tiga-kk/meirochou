import { describe, expect, it, vi } from "vitest";
import { InMemoryMapAreaCatalog } from "../apps/webapp/js/features/route-guidance/infrastructure/in-memory-map-area-catalog";
import type { RouteGuidanceSessionSnapshot } from "../apps/webapp/js/features/route-guidance/domain/route-guidance-types";
import { FinishCurrentCircleUseCase } from "../apps/webapp/js/features/route-guidance/use-cases/finish-current-circle";
import { RouteGuidanceNavigationOperations } from "../apps/webapp/js/features/route-guidance/use-cases/route-guidance-navigation-operations";
import { createRouteGuidanceSession } from "../apps/webapp/js/features/route-guidance/use-cases/route-guidance-session";
import type { RouteMapAssets } from "../apps/webapp/js/features/route-guidance/use-cases/route-map-assets-loader";

const currentCircle = { space: "東A01a", account: "current" };
const nextCircle = { space: "東A02b", account: "next" };

const assets: RouteMapAssets = {
  points: {
    image: { width: 30, height: 10 },
    points: [
      {
        identifier: "A",
        number: 1,
        center_x: 15,
        center_y: 5,
        portals: [{ col: 1, row: 0, x: 15, y: 5 }],
      },
      {
        identifier: "A",
        number: 2,
        center_x: 25,
        center_y: 5,
        portals: [{ col: 2, row: 0, x: 25, y: 5 }],
      },
    ],
  },
  gridMetadata: {
    width: 30,
    height: 10,
    cell_size: 10,
    cols: 3,
    rows: 1,
  },
  gridBytes: new Uint8Array([1, 1, 1]),
};

function navigationSnapshot(): RouteGuidanceSessionSnapshot {
  const currentRoute = {
    cost: 1,
    cells: [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ],
    points: [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
    ],
    startPosition: { x: 5, y: 5 },
    targetPosition: { x: 55, y: 65 },
    image: { width: 30, height: 10 },
  };
  return {
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
      targetSpace: currentCircle.space,
      lockedFirstLeg: {
        from: { type: "start", areaId: "east", gridIndex: 0 },
        toSpace: currentCircle.space,
      },
      provisionalOrder: [currentCircle.space, nextCircle.space],
      bestOrder: [currentCircle.space, nextCircle.space],
      optimizationGeneration: 1,
    },
    currentDestination: currentCircle,
    currentRoute,
    selectedDestination: currentCircle,
    selectedRoute: currentRoute,
    selectionStatus: "ready",
    routeOptimizationGeneration: 1,
  };
}

function createFixture(
  routeAssets: RouteMapAssets = assets,
  initialSnapshot: RouteGuidanceSessionSnapshot = navigationSnapshot(),
) {
  const session = createRouteGuidanceSession();
  session.replaceSnapshot(initialSnapshot);
  const replaceSnapshot = vi.spyOn(session, "replaceSnapshot");
  const loadMapAssets = vi.fn(async () => routeAssets);
  const useCase = new FinishCurrentCircleUseCase(
    session,
    new InMemoryMapAreaCatalog([{ areaId: "east" }]),
    { loadMapAssets, clearCachedMapAssets() {} },
    new RouteGuidanceNavigationOperations(),
  );
  return { session, replaceSnapshot, loadMapAssets, useCase };
}

describe("FinishCurrentCircleUseCase", () => {
  it("purchases the current target and commits the next route once", async () => {
    const { session, replaceSnapshot, useCase } = createFixture();

    await expect(
      useCase.execute({
        action: "purchase",
        completedSpace: currentCircle.space,
        remainingCircles: [nextCircle],
      }),
    ).resolves.toEqual({ kind: "advanced" });

    const snapshot = session.getSnapshot();
    expect(snapshot.navigationState).toMatchObject({
      stage: "navigating",
      targetSpace: nextCircle.space,
      currentPosition: {
        areaId: "east",
        gridIndex: 1,
        svgX: 55,
        svgY: 65,
        source: "arrived-circle",
        circleSpace: currentCircle.space,
      },
      lockedFirstLeg: {
        from: { type: "circle", space: currentCircle.space },
        toSpace: nextCircle.space,
      },
    });
    expect(snapshot.currentDestination).toMatchObject({
      ...nextCircle,
      gridDistance: 10,
      mapPosition: snapshot.currentRoute?.targetPosition,
    });
    expect(snapshot.selectedDestination).toEqual(snapshot.currentDestination);
    expect(snapshot.selectedRoute).toEqual(snapshot.currentRoute);
    expect(replaceSnapshot).toHaveBeenCalledOnce();
  });

  it("holds the current target without moving the confirmed position", async () => {
    const { session, replaceSnapshot, useCase } = createFixture();
    const initialPosition = session.getSnapshot().navigationState?.currentPosition;

    await expect(
      useCase.execute({
        action: "hold",
        completedSpace: currentCircle.space,
        remainingCircles: [nextCircle],
      }),
    ).resolves.toEqual({ kind: "advanced" });

    const snapshot = session.getSnapshot();
    expect(snapshot.navigationState).toMatchObject({
      stage: "navigating",
      targetSpace: nextCircle.space,
      provisionalOrder: [nextCircle.space],
      bestOrder: [nextCircle.space],
      lockedFirstLeg: {
        from: { type: "start", areaId: "east", gridIndex: 0 },
        toSpace: nextCircle.space,
      },
    });
    expect(snapshot.navigationState?.currentPosition).toEqual(initialPosition);
    expect(snapshot.currentDestination?.space).toBe(nextCircle.space);
    expect(replaceSnapshot).toHaveBeenCalledOnce();
  });

  it("ignores a non-current target without loading assets or changing Session", async () => {
    const { session, replaceSnapshot, loadMapAssets, useCase } = createFixture();
    const before = session.getSnapshot();

    await expect(
      useCase.execute({
        action: "purchase",
        completedSpace: "東A99z",
        remainingCircles: [currentCircle, nextCircle],
      }),
    ).resolves.toEqual({ kind: "ignored" });

    expect(loadMapAssets).not.toHaveBeenCalled();
    expect(replaceSnapshot).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toEqual(before);
  });

  it.each(["purchase", "hold"] as const)(
    "finishes %s guidance when no target remains",
    async (action) => {
      const initial = navigationSnapshot();
      const fixture = createFixture(assets, {
        ...initial,
        navigationState: {
          ...initial.navigationState!,
          provisionalOrder: [currentCircle.space],
          bestOrder: [currentCircle.space],
        },
      });

      await expect(
        fixture.useCase.execute({
          action,
          completedSpace: currentCircle.space,
          remainingCircles: [],
        }),
      ).resolves.toEqual({ kind: "finished" });

      const snapshot = fixture.session.getSnapshot();
      expect(snapshot.navigationState).toMatchObject({
        stage: "idle",
        targetSpace: null,
        lockedFirstLeg: null,
        provisionalOrder: [],
        bestOrder: [],
      });
      expect(snapshot.navigationState?.currentPosition?.source).toBe(
        action === "purchase" ? "arrived-circle" : "manual-start",
      );
      expect(snapshot).toMatchObject({
        currentDestination: null,
        currentRoute: null,
        selectedDestination: null,
        selectedRoute: null,
        selectionStatus: "idle",
      });
      expect(fixture.replaceSnapshot).toHaveBeenCalledOnce();
      if (action === "hold") {
        expect(fixture.loadMapAssets).not.toHaveBeenCalled();
      }
    },
  );

  it("keeps the original Session when the next route is unavailable", async () => {
    const blockedAssets = {
      ...assets,
      gridBytes: new Uint8Array([1, 0, 0]),
    };
    const { session, replaceSnapshot, useCase } = createFixture(blockedAssets);
    const before = session.getSnapshot();

    await expect(
      useCase.execute({
        action: "hold",
        completedSpace: currentCircle.space,
        remainingCircles: [nextCircle],
      }),
    ).resolves.toEqual({ kind: "failed", reason: "route-unavailable" });

    expect(replaceSnapshot).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toEqual(before);
  });

  it("keeps the original Session when purchase arrival cannot be reconstructed", async () => {
    const initial = navigationSnapshot();
    const { session, replaceSnapshot, useCase } = createFixture(assets, {
      ...initial,
      currentRoute: null,
    });
    const before = session.getSnapshot();

    await expect(
      useCase.execute({
        action: "purchase",
        completedSpace: currentCircle.space,
        remainingCircles: [nextCircle],
      }),
    ).resolves.toEqual({
      kind: "failed",
      reason: "arrival-position-unavailable",
    });

    expect(replaceSnapshot).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toEqual(before);
  });

  it("keeps the original Session when the next target is absent from remaining circles", async () => {
    const { session, replaceSnapshot, useCase } = createFixture();
    const before = session.getSnapshot();

    await expect(
      useCase.execute({
        action: "purchase",
        completedSpace: currentCircle.space,
        remainingCircles: [],
      }),
    ).resolves.toEqual({ kind: "failed", reason: "next-target-missing" });

    expect(replaceSnapshot).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toEqual(before);
  });
});
