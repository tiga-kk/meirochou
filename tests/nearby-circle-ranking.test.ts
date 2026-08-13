import { describe, expect, it } from "vitest";
import {
  buildDistanceMapFromGridIndex,
  rankCandidatesByGridDistanceFromGridIndex,
} from "../apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner";
import { rankNearbyCircles } from "../apps/webapp/js/features/route-guidance/ui/nearby-circle-model";

const points = {
  image: { width: 50, height: 30 },
  points: [
    { identifier: "A", number: "1", portals: [{ col: 0, row: 1, x: 5, y: 15 }] },
    { identifier: "A", number: "2", portals: [{ col: 4, row: 1, x: 45, y: 15 }] },
    { identifier: "A", number: "3", portals: [{ col: 0, row: 2, x: 5, y: 25 }] },
    { identifier: "A", number: "4", portals: [{ col: 4, row: 2, x: 45, y: 25 }] },
  ],
};
const gridMeta = { width: 50, height: 30, cell_size: 10, cols: 5, rows: 3 };
const grid = new Uint8Array([
  1, 1, 1, 1, 1,
  1, 0, 0, 0, 1,
  1, 1, 1, 1, 1,
]);

describe("nearby circle ranking", () => {
  it("builds one distance map from an arbitrary walkable grid origin", () => {
    const distanceMap = buildDistanceMapFromGridIndex(points, gridMeta, grid, 0);
    expect(distanceMap?.distances[10]).toBe(20);

    const ranked = rankCandidatesByGridDistanceFromGridIndex(
      points,
      gridMeta,
      grid,
      0,
      [{ space: "東A2a" }, { space: "東A3a" }],
    );
    expect(ranked.map(({ candidate }) => candidate.space)).toEqual(["東A3a", "東A2a"]);
  });

  it("filters area, purchase, hold, and exact priority before distance and limit", () => {
    const result = rankNearbyCircles({
      pointsPayload: points,
      gridMeta,
      gridBytes: grid,
      originGridIndex: 0,
      area: { prefixes: ["東"], labels: ["A"] },
      circles: [
        { space: "東A2a", priority: 9 },
        { space: "東A3a", priority: 9 },
        { space: "東A4a", priority: 9 },
        { space: "西A1a", priority: 9 },
        { space: "東A1a", priority: 9 },
      ],
      getCircleStatus: (space) =>
        space === "東A2a" ? "held" : space === "東A1a" ? "purchased" : "pending",
      selectedPriorities: [9],
      includeHeld: false,
      limit: 5,
    });

    expect(result.map(({ candidate }) => candidate.space)).toEqual(["東A3a", "東A4a"]);
  });

  it("includes held circles only when requested and never counts unreachable circles", () => {
    const result = rankNearbyCircles({
      pointsPayload: points,
      gridMeta,
      gridBytes: new Uint8Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0]),
      originGridIndex: 0,
      area: { prefixes: ["東"], labels: ["A"] },
      circles: [
        { space: "東A2a", priority: 1 },
        { space: "東A3a", priority: 1 },
      ],
      getCircleStatus: () => "held",
      includeHeld: true,
      limit: 5,
    });

    expect(result.map(({ candidate }) => candidate.space)).toEqual(["東A3a"]);
  });
});
