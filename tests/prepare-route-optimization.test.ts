// @vitest-environment node

import { describe, expect, test, vi } from "vitest";
import { PrepareRouteOptimizationUseCase } from "../apps/webapp/js/features/route-guidance/use-cases/prepare-route-optimization";

describe("PrepareRouteOptimizationUseCase", () => {
  test("uses only the filtered pendingCircles passed by searchNext", async () => {
    const matrixStart = vi.fn(async () => ({
      schemaVersion: 1 as const,
      cacheKey: "matrix-key",
      areaId: "east",
      spaces: ["東ア01", "東イ02"],
      size: 2,
      distances: [0, 10, 10, 0],
      createdAt: "2026-08-14T00:00:00Z",
    }));
    const useCase = new PrepareRouteOptimizationUseCase(
      {
        getMapArea: () => ({ areaId: "east" }),
      } as any,
      {
        loadMapAssets: vi.fn(async () => ({
          points: {
            image: { width: 100, height: 100 },
            points: [
              { group_id: "W_all", identifier: "ア", number: 1, center_x: 10, center_y: 10, portals: [{ col: 0, row: 0, x: 10, y: 10 }] },
              { group_id: "I_01", identifier: "イ", number: 2, center_x: 20, center_y: 10, portals: [{ col: 1, row: 0, x: 20, y: 10 }] },
            ],
          },
          gridMetadata: { cols: 2, rows: 1, width: 100, height: 100, cell_size: 10 },
          gridBytes: new Uint8Array([1, 1]),
        })),
      } as any,
      { start: matrixStart } as any,
    );

    const inputCircles = [
      { space: "東ア01", priority: 10 },
      { space: "東イ02", priority: 10 },
    ];
    const result = await useCase.execute({
      eventDay: { eventId: "event", dayId: "day" },
      bundleVersion: "bundle-1",
      areaId: "east",
      currentPosition: {
        areaId: "east",
        gridIndex: 0,
        svgX: 10,
        svgY: 10,
        source: "manual-start",
      },
      pendingCircles: [
        ...inputCircles,
      ],
      searchTimeLimitMs: 5000,
    });

    expect(matrixStart).toHaveBeenCalledWith(expect.objectContaining({
      endpoints: [
        { space: "東ア01", gridIndex: 0 },
        { space: "東イ02", gridIndex: 1 },
      ],
    }));
    expect(result.pendingCircles.map((circle) => circle.space)).toEqual([
      "東ア01",
      "東イ02",
    ]);
    expect(result.pendingCircles.map((circle) => circle.queueClass)).toEqual([
      "wall",
      "normal",
    ]);
    expect(inputCircles.map((circle) => circle.queueClass)).toEqual([
      undefined,
      undefined,
    ]);
    expect(result.matrixRef).toBe("matrix-key");
  });

  test("restores a cache hit to the pending circle order", async () => {
    const useCase = new PrepareRouteOptimizationUseCase(
      { getMapArea: () => ({ areaId: "east" }) } as any,
      {
        loadMapAssets: vi.fn(async () => ({
          points: {
            image: { width: 100, height: 100 },
            points: [
              { identifier: "ア", number: 1, center_x: 10, center_y: 10, portals: [{ col: 0, row: 0 }] },
              { identifier: "ア", number: 2, center_x: 20, center_y: 10, portals: [{ col: 1, row: 0 }] },
            ],
          },
          gridMetadata: { cols: 2, rows: 1, cell_size: 10 },
          gridBytes: new Uint8Array([1, 1]),
        })),
      } as any,
      {
        start: vi.fn(async () => ({
          schemaVersion: 1 as const,
          cacheKey: "matrix-key",
          areaId: "east",
          spaces: ["東ア02", "東ア01"],
          size: 2,
          distances: [0, 20, 10, 0],
          createdAt: "2026-08-14T00:00:00Z",
        })),
      } as any,
    );

    const result = await useCase.execute({
      eventDay: { eventId: "event", dayId: "day" },
      bundleVersion: "bundle-1",
      areaId: "east",
      currentPosition: {
        areaId: "east",
        gridIndex: 0,
        svgX: 10,
        svgY: 10,
        source: "manual-start",
      },
      pendingCircles: [
        { space: "東ア01", priority: 10 },
        { space: "東ア02", priority: 10 },
      ],
      searchTimeLimitMs: 5000,
    });

    expect(result.distanceMatrix).toEqual([0, 10, 20, 0]);
  });
});
