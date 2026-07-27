// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  buildDistanceMatrixCacheKey,
  computeAllPairsDistances,
  type DistanceMatrixCacheKeyInput,
  dijkstraFromCell,
  distancesFromStartToEndpoints,
  type MatrixEndpoint,
  type MatrixGridInput,
} from "../apps/webapp/js/routing/distance-matrix";

// ---- Helpers ----

/** 3x3グリッド (cellSize=10). row1-col1がblocked(0), 他はwalkable(1) */
function make3x3Grid(): {
  grid: Uint8Array;
  cols: number;
  rows: number;
  cellSize: number;
} {
  const grid = new Uint8Array(9);
  for (let i = 0; i < 9; i++) grid[i] = 1;
  grid[4] = 0; // blocked center
  return { grid, cols: 3, rows: 3, cellSize: 10 };
}

/** すべてwalkable(crowdなし) 2x2グリッド */
function make2x2Grid(): {
  grid: Uint8Array;
  cols: number;
  rows: number;
  cellSize: number;
} {
  const grid = new Uint8Array(4);
  for (let i = 0; i < 4; i++) grid[i] = 1;
  return { grid, cols: 2, rows: 2, cellSize: 10 };
}

describe("Phase 5C Task 5: distance matrix cache key", () => {
  const base: DistanceMatrixCacheKeyInput = {
    eventId: "c108",
    dayId: "day1",
    areaId: "east",
    bundleVersion: "v1",
    gridWeightVersion: "gw1",
    endpoints: [
      { space: "A-01", gridIndex: 0 },
      { space: "A-02", gridIndex: 2 },
    ],
    schemaVersion: 1,
  };

  test("same input produces same key", () => {
    const key1 = buildDistanceMatrixCacheKey(base);
    const key2 = buildDistanceMatrixCacheKey({ ...base });
    expect(key1).toBe(key2);
  });

  test("metadata-only change (eventId, dayId, areaId) does NOT change key", () => {
    // Cache key must be content-addressable (grid + endpoints), not per-event metadata
    const keyA = buildDistanceMatrixCacheKey(base);
    const keyB = buildDistanceMatrixCacheKey({
      ...base,
      eventId: "c108-other",
      dayId: "day2",
      areaId: "west",
    });
    expect(keyA).toBe(keyB);
  });

  test("endpoint change produces different key", () => {
    const keyA = buildDistanceMatrixCacheKey(base);
    const keyB = buildDistanceMatrixCacheKey({
      ...base,
      endpoints: [
        { space: "A-01", gridIndex: 0 },
        { space: "A-03", gridIndex: 5 }, // different
      ],
    });
    expect(keyA).not.toBe(keyB);
  });

  test("gridWeightVersion change produces different key", () => {
    const keyA = buildDistanceMatrixCacheKey(base);
    const keyB = buildDistanceMatrixCacheKey({
      ...base,
      gridWeightVersion: "gw2",
    });
    expect(keyA).not.toBe(keyB);
  });

  test("bundleVersion change produces different key", () => {
    const keyA = buildDistanceMatrixCacheKey(base);
    const keyB = buildDistanceMatrixCacheKey({ ...base, bundleVersion: "v2" });
    expect(keyA).not.toBe(keyB);
  });
});

describe("Phase 5C Task 5: flat matrix indexing and symmetry", () => {
  test("distance from A to B equals distance from B to A (symmetric grid)", () => {
    const { grid, cols, rows, cellSize } = make2x2Grid();
    const input: MatrixGridInput = { grid, cols, rows, cellSize };
    // endpoints: cell 0 (top-left, svgX=5,svgY=5) and cell 1 (top-right, svgX=15,svgY=5)
    const endpoints: MatrixEndpoint[] = [
      { space: "A-01", gridIndex: 0 },
      { space: "A-02", gridIndex: 1 },
    ];
    const result = computeAllPairsDistances(input, endpoints);
    expect(result).not.toBeNull();
    // flat index(i, j, n) = i*n + j
    const n = endpoints.length; // 2
    const dAB = result?.distances[0 * n + 1];
    const dBA = result?.distances[1 * n + 0];
    expect(dAB).toBeCloseTo(dBA);
  });

  test("diagonal entries (same endpoint) are zero", () => {
    const { grid, cols, rows, cellSize } = make2x2Grid();
    const input: MatrixGridInput = { grid, cols, rows, cellSize };
    const endpoints: MatrixEndpoint[] = [
      { space: "A-01", gridIndex: 0 },
      { space: "A-02", gridIndex: 1 },
    ];
    const result = computeAllPairsDistances(input, endpoints);
    expect(result).not.toBeNull();
    const n = endpoints.length;
    expect(result?.distances[0 * n + 0]).toBe(0);
    expect(result?.distances[1 * n + 1]).toBe(0);
  });

  test("blocked path returns Infinity", () => {
    const { grid, cols, rows, cellSize } = make3x3Grid();
    const input: MatrixGridInput = { grid, cols, rows, cellSize };
    // Top-left (0) to bottom-right (8): must route around blocked center (4)
    // These should still be reachable via alternative paths
    const endpoints: MatrixEndpoint[] = [
      { space: "A-01", gridIndex: 0 },
      { space: "A-09", gridIndex: 8 },
    ];
    const result = computeAllPairsDistances(input, endpoints);
    expect(result).not.toBeNull();
    // 0 to 8 should be reachable going around the blocked cell (not Infinity)
    const n = endpoints.length;
    expect(result?.distances[0 * n + 1]).not.toBe(Infinity);
  });

  test("crowded cell (value=2) costs 1.5x for edge passing through it", () => {
    // 1x3 grid: cells 0, 1(crowded), 2. cellSize=10.
    const grid = new Uint8Array([1, 2, 1]);
    const input: MatrixGridInput = { grid, cols: 3, rows: 1, cellSize: 10 };
    const endpoints: MatrixEndpoint[] = [
      { space: "A-01", gridIndex: 0 },
      { space: "A-03", gridIndex: 2 },
    ];
    const result = computeAllPairsDistances(input, endpoints);
    expect(result).not.toBeNull();
    const n = endpoints.length;
    const dist = result?.distances[0 * n + 1]; // 0 to 2
    // Edge 0→1: (1.0 + 1.5)/2 * 10 = 12.5
    // Edge 1→2: (1.5 + 1.0)/2 * 10 = 12.5
    // Total: 25
    expect(dist).toBeCloseTo(25);
  });

  test("invalid endpoint and short grid inputs produce unreachable distances", () => {
    const result = dijkstraFromCell(99, {
      grid: new Uint8Array([1]),
      cols: 2,
      rows: 1,
      cellSize: 10,
    });

    expect([...result]).toEqual([Infinity, Infinity]);

    expect(
      dijkstraFromCell(0, {
        grid: new Uint8Array([1]),
        cols: Number.POSITIVE_INFINITY,
        rows: 1,
        cellSize: 10,
      }),
    ).toEqual(new Float64Array());
  });

  test("arbitrary start computes one distance vector without rebuilding the matrix", () => {
    const gridInput: MatrixGridInput = {
      grid: new Uint8Array([1, 1, 1]),
      cols: 3,
      rows: 1,
      cellSize: 10,
    };

    expect([...distancesFromStartToEndpoints(0, gridInput, [1, 2])]).toEqual([
      10, 20,
    ]);
  });
});
