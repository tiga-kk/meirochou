import { describe, expect, it, vi } from "vitest";
import type { MapAreaCatalog } from "../apps/webapp/js/features/route-guidance/domain/map-area";
import type { RouteGuidanceSession } from "../apps/webapp/js/features/route-guidance/domain/route-guidance-types";
import type { RouteGuidanceSnapshotRepository } from "../apps/webapp/js/features/route-guidance/use-cases/route-guidance-snapshot-repository";
import type { RouteMapAssetsLoader } from "../apps/webapp/js/features/route-guidance/use-cases/route-map-assets-loader";
import { StartRouteGuidanceUseCase } from "../apps/webapp/js/features/route-guidance/use-cases/start-route-guidance";

describe("StartRouteGuidanceUseCase", () => {
  const assets = {
    points: {
      image: { width: 20, height: 10 },
      points: [
        {
          identifier: "A",
          number: 1,
          center_x: 15,
          center_y: 5,
          portals: [{ col: 1, row: 0, x: 15, y: 5 }],
        },
      ],
    },
    gridMetadata: { width: 20, height: 10, cell_size: 10, cols: 2, rows: 1 },
    gridBytes: new Uint8Array([1, 1]),
  };

  it("resolves walkable starting position and initializes route guidance session and snapshot", async () => {
    const session = {
      getSnapshot: () => ({
        navigationState: null,
        currentDestination: null,
        currentRoute: null,
        selectedDestination: null,
        selectedRoute: null,
        selectionStatus: "idle",
        routeOptimizationGeneration: 0,
      }),
      replaceSnapshot: vi.fn(),
    };

    const mapAreaCatalog = {
      findMapAreaForCircleSpace: vi.fn(() => ({ areaId: "e456" })),
    };

    const assetsLoader = {
      loadMapAssets: vi.fn(async () => assets),
    };

    const snapshotRepo = {
      saveSnapshot: vi.fn(),
    };

    const useCase = new StartRouteGuidanceUseCase(
      session as any,
      mapAreaCatalog as any,
      assetsLoader as any,
      snapshotRepo as any,
    );

    await useCase.execute({
      eventDay: { eventId: "c108", dayId: "day1" },
      bundleVersion: "bundle-v1",
      matrixRef: null,
      optimizationTimeLimitMs: 10000,
      startPosition: {
        areaId: "e456",
        gridIndex: 0,
        svgX: 1,
        svgY: 2,
        source: "manual-start",
      },
      pendingCircles: [{ space: "東A01" }],
    });

    expect(session.replaceSnapshot).toHaveBeenCalled();
    expect(snapshotRepo.saveSnapshot).toHaveBeenCalledOnce();
    expect(snapshotRepo.saveSnapshot).toHaveBeenCalledWith(
      { eventId: "c108", dayId: "day1" },
      expect.objectContaining({
        schemaVersion: 1,
        eventId: "c108",
        dayId: "day1",
        areaId: "e456",
        bundleVersion: "bundle-v1",
        matrixRef: null,
        navState: expect.any(Object),
        optimizationTimeLimitMs: 10000,
        savedAt: expect.any(String),
      }),
    );
  });

  it("uses the catalog area when the start position has no area id", async () => {
    const session = { replaceSnapshot: vi.fn() };
    const mapAreaCatalog = {
      findMapAreaForCircleSpace: vi.fn(() => ({ areaId: "e456" })),
    };
    const assetsLoader = { loadMapAssets: vi.fn(async () => assets) };
    const snapshotRepo = { saveSnapshot: vi.fn() };

    await expect(
      new StartRouteGuidanceUseCase(
        session as unknown as RouteGuidanceSession,
        mapAreaCatalog as unknown as MapAreaCatalog,
        assetsLoader as unknown as RouteMapAssetsLoader,
        snapshotRepo as unknown as RouteGuidanceSnapshotRepository,
      ).execute({
        eventDay: { eventId: "c108", dayId: "day1" },
        bundleVersion: "bundle-v1",
        matrixRef: null,
        optimizationTimeLimitMs: 10000,
        startPosition: {
          areaId: "",
          gridIndex: 0,
          svgX: 1,
          svgY: 2,
          source: "manual-start",
        },
        pendingCircles: [{ space: "東A01" }],
      }),
    ).resolves.toBeUndefined();
    expect(session.replaceSnapshot).toHaveBeenCalled();
  });
});
