// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { GridMeta } from "../apps/webapp/js/features/route-guidance/domain/routing/grid-route-types";
import {
  type StartSelection,
  snapStartToWalkableCell,
} from "../apps/webapp/js/features/route-guidance/domain/start-selection";

/**
 * テスト用グリッド (3x3, cellSize=10):
 *   col: 0  1  2
 * row 0: [W][W][W]
 * row 1: [W][B][W]   B=blocked(0), W=walkable(1)
 * row 2: [W][W][W]
 *
 * SVG座標系: (col + 0.5) * cellSize, (row + 0.5) * cellSize
 *   (0,0)セルの中心: (5,  5)
 *   (1,0)セルの中心: (15, 5)
 *   (2,0)セルの中心: (25, 5)
 *   (0,1)セルの中心: (5,  15)
 *   (1,1)セルの中心: (15, 15)  ← blocked
 *   (2,1)セルの中心: (25, 15)
 *   (0,2)セルの中心: (5,  25)
 *   (1,2)セルの中心: (15, 25)
 *   (2,2)セルの中心: (25, 25)
 */
function make3x3Grid(): { grid: Uint8Array; meta: GridMeta } {
  const grid = new Uint8Array(9);
  // walkable = 1
  for (let i = 0; i < 9; i++) grid[i] = 1;
  // blocked center cell (row=1, col=1) → index = 1*3+1 = 4
  grid[4] = 0;

  const meta: GridMeta = {
    width: 30,
    height: 30,
    cell_size: 10,
    cols: 3,
    rows: 3,
  };
  return { grid, meta };
}

describe("Phase 5C Task 4: snapStartToWalkableCell", () => {
  test("tap exactly on walkable cell returns that cell", () => {
    const { grid, meta } = make3x3Grid();
    // Center of cell (0,0): svgX=5, svgY=5
    const sel: StartSelection = { svgX: 5, svgY: 5 };
    const result = snapStartToWalkableCell(sel, grid, meta, 20);
    expect(result).not.toBeNull();
    expect(result?.gridIndex).toBe(0); // row=0, col=0 → index=0
    expect(result?.svgX).toBe(5);
    expect(result?.svgY).toBe(5);
    expect(result?.snapDistancePx).toBeCloseTo(0);
  });

  test("tap on blocked cell snaps to nearest walkable cell", () => {
    const { grid, meta } = make3x3Grid();
    // Tap on center of blocked cell (1,1): svgX=15, svgY=15
    const sel: StartSelection = { svgX: 15, svgY: 15 };
    const result = snapStartToWalkableCell(sel, grid, meta, 20);
    expect(result).not.toBeNull();
    // Nearest walkable cells are the 4 orthogonal neighbors (distance=10 from center to center)
    // All have equal distance, so tie-breaking must be deterministic (lowest index wins)
    // (0,1)=index3, (1,0)=index1, (1,2)=index7, (2,1)=index5 → lowest index = 1
    expect(result?.gridIndex).toBe(1); // col=1, row=0 → index=1
    expect(result?.snapDistancePx).toBeGreaterThan(0);
  });

  test("tap beyond maxSnapDistancePx threshold returns null", () => {
    const { grid, meta } = make3x3Grid();
    // Tap far outside the grid
    const sel: StartSelection = { svgX: 200, svgY: 200 };
    const result = snapStartToWalkableCell(sel, grid, meta, 20);
    expect(result).toBeNull();
  });

  test("tie-breaking is deterministic (lowest gridIndex wins)", () => {
    const { grid, meta } = make3x3Grid();
    // Both (0,0) center=5,5 and (1,0) center=15,5 are equidistant from (10, 5)
    const sel: StartSelection = { svgX: 10, svgY: 5 };
    const result = snapStartToWalkableCell(sel, grid, meta, 20);
    expect(result).not.toBeNull();
    // Distance from (10,5) to (5,5) = 5, to (15,5) = 5 → tie; lowest index = 0
    expect(result?.gridIndex).toBe(0);
  });

  test("blocked cell near tap with walkable neighbor in range snaps correctly", () => {
    const { grid, meta } = make3x3Grid();
    // Tap slightly off center of blocked cell
    const sel: StartSelection = { svgX: 14, svgY: 14 };
    const result = snapStartToWalkableCell(sel, grid, meta, 20);
    expect(result).not.toBeNull();
    expect(result?.gridIndex).not.toBe(4); // Must not be the blocked cell
  });

  test("short grid buffers do not produce an endpoint outside the buffer", () => {
    const { meta } = make3x3Grid();
    const result = snapStartToWalkableCell(
      { svgX: 25, svgY: 25 },
      new Uint8Array([1]),
      meta,
      100,
    );

    expect(result).toBeNull();
  });

  test("non-finite snap thresholds reject the selection", () => {
    const { grid, meta } = make3x3Grid();

    expect(
      snapStartToWalkableCell({ svgX: 5, svgY: 5 }, grid, meta, Number.NaN),
    ).toBeNull();
  });
});
