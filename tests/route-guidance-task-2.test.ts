import { describe, expect, it, vi } from "vitest";
import type { MapAreaCatalog } from "../apps/webapp/js/features/route-guidance/domain/map-area";
import { HttpRouteMapAssetsLoader } from "../apps/webapp/js/features/route-guidance/infrastructure/http-route-map-assets-loader";
import { StartRouteGuidanceUseCase } from "../apps/webapp/js/features/route-guidance/use-cases/start-route-guidance";

const routeAssets = {
  points: {
    image: { width: 50, height: 10 },
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
        center_x: 45,
        center_y: 5,
        portals: [{ col: 4, row: 0, x: 45, y: 5 }],
      },
    ],
  },
  gridMetadata: {
    width: 50,
    height: 10,
    cell_size: 10,
    cols: 5,
    rows: 1,
  },
  gridBytes: new Uint8Array([1, 1, 1, 1, 1]),
};

describe("Task 2 route guidance ownership", () => {
  it("binds the default browser fetch to globalThis", async () => {
    const originalFetch = globalThis.fetch;
    const fetcher = function (this: unknown, url: string): Promise<Response> {
      expect(this).toBe(globalThis);
      if (url.endsWith("points.json")) {
        return Promise.resolve(
          new Response(JSON.stringify(routeAssets.points), { status: 200 }),
        );
      }
      if (url.endsWith("grid-meta.json")) {
        return Promise.resolve(
          new Response(JSON.stringify(routeAssets.gridMetadata), { status: 200 }),
        );
      }
      return Promise.resolve(new Response(routeAssets.gridBytes, { status: 200 }));
    };

    globalThis.fetch = fetcher as typeof fetch;
    try {
      await new HttpRouteMapAssetsLoader().loadMapAssets({
        areaId: "demo-east",
        assets: {
          points: "https://example.test/points.json",
          gridMeta: "https://example.test/grid-meta.json",
          grid: "https://example.test/grid.bin",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("loads assets from the active map-area manifest instead of a fixed C108 path", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("points.json"))
        return new Response(JSON.stringify(routeAssets.points), {
          status: 200,
        });
      if (url.endsWith("grid-meta.json"))
        return new Response(JSON.stringify(routeAssets.gridMetadata), {
          status: 200,
        });
      return new Response(routeAssets.gridBytes, { status: 200 });
    });
    const loader = new HttpRouteMapAssetsLoader(fetcher as typeof fetch);

    await loader.loadMapAssets({
      areaId: "demo-east",
      assets: {
        points: "/assets/maps/demo-v2/demo-east/points.json",
        gridMeta: "/assets/maps/demo-v2/demo-east/grid-meta.json",
        grid: "/assets/maps/demo-v2/demo-east/grid.bin",
      },
    });

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/assets/maps/demo-v2/demo-east/points.json",
      "/assets/maps/demo-v2/demo-east/grid-meta.json",
      "/assets/maps/demo-v2/demo-east/grid.bin",
    ]);
    expect(fetcher.mock.calls.every(([url]) => !url.includes("c108-"))).toBe(
      true,
    );
  });

  it("chooses the nearest reachable pending circle and commits its first leg with geometry", async () => {
    const replaceSnapshot = vi.fn();
    const saveSnapshot = vi.fn();
    const assetsLoader = { loadMapAssets: vi.fn(async () => routeAssets) };
    const mapArea = {
      areaId: "demo-east",
      assets: {
        points: "points.json",
        gridMeta: "grid-meta.json",
        grid: "grid.bin",
      },
    };
    const mapAreaCatalog = {
      getMapArea: vi.fn(() => mapArea),
      findMapAreaForCircleSpace: vi.fn(() => mapArea),
    };

    await new StartRouteGuidanceUseCase(
      { replaceSnapshot } as any,
      mapAreaCatalog as unknown as MapAreaCatalog,
      assetsLoader as any,
      { saveSnapshot } as any,
    ).execute({
      eventDay: { eventId: "demo", dayId: "day1" },
      startPosition: {
        areaId: "demo-east",
        gridIndex: 0,
        svgX: 5,
        svgY: 5,
        source: "manual-start",
      },
      pendingCircles: [{ space: "東A02" }, { space: "東A01" }],
    });

    const snapshot = replaceSnapshot.mock.calls[0][0];
    expect(snapshot.navigationState.targetSpace).toBe("東A01");
    expect(snapshot.navigationState.lockedFirstLeg.toSpace).toBe("東A01");
    expect(snapshot.currentRoute.cells).toHaveLength(2);
    expect(snapshot.currentRoute.cost).toBe(10);
    expect(saveSnapshot).toHaveBeenCalledOnce();
  });

  it("does not commit a partial session when no pending circle is reachable", async () => {
    const replaceSnapshot = vi.fn();
    const saveSnapshot = vi.fn();
    const blockedAssets = {
      ...routeAssets,
      gridBytes: new Uint8Array([1, 0, 0, 0, 1]),
    };

    await expect(
      new StartRouteGuidanceUseCase(
        { replaceSnapshot } as any,
        {
          getMapArea: () => ({ areaId: "demo-east" }),
          findMapAreaForCircleSpace: () => ({ areaId: "demo-east" }),
        } as unknown as MapAreaCatalog,
        { loadMapAssets: vi.fn(async () => blockedAssets) } as any,
        { saveSnapshot } as any,
      ).execute({
        eventDay: { eventId: "demo", dayId: "day1" },
        startPosition: {
          areaId: "demo-east",
          gridIndex: 0,
          svgX: 5,
          svgY: 5,
          source: "manual-start",
        },
        pendingCircles: [{ space: "東A01" }],
      }),
    ).rejects.toThrow(/route|reachable|経路/i);

    expect(replaceSnapshot).not.toHaveBeenCalled();
    expect(saveSnapshot).not.toHaveBeenCalled();
  });
});
