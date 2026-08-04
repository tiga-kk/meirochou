import { describe, expect, it, vi } from "vitest";
import { StartRouteGuidanceUseCase } from "../apps/webapp/js/features/route-guidance/use-cases/start-route-guidance";

describe("StartRouteGuidanceUseCase", () => {
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
      loadMapAssets: vi.fn(async () => ({
        points: { points: [] },
        gridMetadata: { cols: 10, rows: 10 },
        gridBytes: new Uint8Array(100),
      })),
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
      startPosition: {
        areaId: "e456",
        gridIndex: 10,
        svgX: 1,
        svgY: 2,
        source: "manual-start",
      },
      pendingCircles: [{ space: "A01" }],
    });

    expect(session.replaceSnapshot).toHaveBeenCalled();
    expect(snapshotRepo.saveSnapshot).toHaveBeenCalled();
  });
});
