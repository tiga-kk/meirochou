import type { GridMeta } from "../types/domain";

export interface StartSelection {
  readonly svgX: number;
  readonly svgY: number;
}

export interface SnappedStart {
  readonly gridIndex: number;
  readonly svgX: number;
  readonly svgY: number;
  readonly snapDistancePx: number;
}

/** GRID_BLOCKED value matching route-planner.ts */
const GRID_BLOCKED = 0;

/**
 * Maximum snap distance in SVG pixels.
 * Derived from typical grid cell size (e.g. 10px → allow 2 cells).
 * Must not be adjusted per area inside this file.
 */
export const DEFAULT_MAX_SNAP_DISTANCE_PX = 30;

/** グリッドインデックスからSVGセル中心座標を返す。 */
function gridIndexToSvgCenter(
  index: number,
  meta: GridMeta,
): { svgX: number; svgY: number } {
  const col = index % meta.cols;
  const row = Math.floor(index / meta.cols);
  return {
    svgX: (col + 0.5) * meta.cell_size,
    svgY: (row + 0.5) * meta.cell_size,
  };
}

/**
 * タップ座標からwalkableなグリッドセルへスナップする。
 *
 * - タップ先セルがwalkableならそのまま返す。
 * - blockedまたは範囲外なら最近傍walkableセルを探す。
 * - 距離がmaxSnapDistancePxを超える場合はnullを返す。
 * - タイ時は gridIndex が小さい方を選ぶ（決定的）。
 */
export function snapStartToWalkableCell(
  selection: StartSelection,
  grid: Uint8Array,
  meta: GridMeta,
  maxSnapDistancePx: number,
): SnappedStart | null {
  if (
    !Number.isFinite(selection.svgX) ||
    !Number.isFinite(selection.svgY) ||
    !Number.isFinite(maxSnapDistancePx) ||
    maxSnapDistancePx < 0
  ) {
    return null;
  }

  const totalCells = meta.cols * meta.rows;
  if (grid.length < totalCells) return null;

  let bestIndex = -1;
  let bestDist = Infinity;

  for (let i = 0; i < totalCells; i++) {
    if (i >= grid.length || grid[i] === GRID_BLOCKED) continue;

    const { svgX, svgY } = gridIndexToSvgCenter(i, meta);
    const dx = svgX - selection.svgX;
    const dy = svgY - selection.svgY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Tie-breaking: prefer lower index (deterministic)
    if (dist < bestDist || (dist === bestDist && i < bestIndex)) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  if (bestIndex < 0 || bestDist > maxSnapDistancePx) {
    return null;
  }

  const { svgX, svgY } = gridIndexToSvgCenter(bestIndex, meta);
  return Object.freeze({
    gridIndex: bestIndex,
    svgX,
    svgY,
    snapDistancePx: bestDist,
  });
}
