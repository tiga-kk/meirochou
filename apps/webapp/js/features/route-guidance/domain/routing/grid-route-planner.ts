import { parseSpace } from "../../../../shared/domain/space-parser";
import type { Circle } from "../../../event-day/public-api";
import type {
  GridMeta,
  MapPoint,
  OcrPoint,
  OcrPortal,
  PointsPayload,
  RouteCell,
  RouteResult,
} from "./grid-route-types";

const GRID_BLOCKED = 0;
const GRID_CROWDED = 2;
const CROWD_MULTIPLIER = 1.5;

interface HeapItem {
  cost: number;
  index: number;
}

interface GridSpec {
  cellSize: number;
  cols: number;
  rows: number;
  width: number;
  height: number;
  totalCells: number;
}

interface NormalizedPortal {
  cell: RouteCell;
  index: number;
  point: MapPoint;
  sourcePoint: MapPoint;
}

interface DistanceMap {
  pointMap: Map<string, OcrPoint[]>;
  spec: GridSpec;
  distances: Float64Array;
}

export interface RankedCandidate {
  candidate: Circle;
  distance: number;
  position?: MapPoint | null;
  originalIndex?: number;
}

export interface PlanRouteOptions {
  startPosition?: MapPoint;
}

class MinHeap {
  items: HeapItem[];

  constructor() {
    this.items = [];
  }

  get length() {
    return this.items.length;
  }

  push(item: HeapItem): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapItem | null {
    if (this.items.length === 0) return null;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last as HeapItem;
      this.bubbleDown(0);
    }
    return first;
  }

  bubbleUp(index: number): void {
    let currentIndex = index;
    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      if (this.items[parentIndex].cost <= this.items[currentIndex].cost) break;
      [this.items[parentIndex], this.items[currentIndex]] = [
        this.items[currentIndex],
        this.items[parentIndex],
      ];
      currentIndex = parentIndex;
    }
  }

  bubbleDown(index: number): void {
    let currentIndex = index;
    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = currentIndex * 2 + 2;
      let nextIndex = currentIndex;

      if (
        leftIndex < this.items.length &&
        this.items[leftIndex].cost < this.items[nextIndex].cost
      ) {
        nextIndex = leftIndex;
      }
      if (
        rightIndex < this.items.length &&
        this.items[rightIndex].cost < this.items[nextIndex].cost
      ) {
        nextIndex = rightIndex;
      }
      if (nextIndex === currentIndex) break;

      [this.items[currentIndex], this.items[nextIndex]] = [
        this.items[nextIndex],
        this.items[currentIndex],
      ];
      currentIndex = nextIndex;
    }
  }
}

function normalizeNumber(value: unknown): number {
  const number = Number.parseInt(String(value), 10);
  return Number.isFinite(number) ? number : 0;
}

function pointKey(identifier: unknown, number: unknown): string {
  if (!identifier) return "";
  const normalizedNumber = normalizeNumber(number);
  if (!normalizedNumber) return "";
  return `${identifier}:${normalizedNumber}`;
}

function spaceKey(space: string): string {
  const [, identifier, number] = parseSpace(space);
  return pointKey(identifier, number);
}

function buildPointMap(pointsPayload: PointsPayload): Map<string, OcrPoint[]> {
  const points = Array.isArray(pointsPayload?.points)
    ? pointsPayload.points
    : [];
  return points.reduce<Map<string, OcrPoint[]>>((index, point) => {
    const key = pointKey(point?.identifier, point?.number);
    if (key) {
      const matches = index.get(key) || [];
      matches.push(point);
      index.set(key, matches);
    }
    return index;
  }, new Map<string, OcrPoint[]>());
}

function readGridSpec(
  pointsPayload: PointsPayload,
  gridMeta: Partial<GridMeta>,
): GridSpec | null {
  const cellSize = Number(
    gridMeta?.cell_size ?? pointsPayload?.grid?.cell_size,
  );
  const cols = Number(gridMeta?.cols ?? pointsPayload?.grid?.cols);
  const rows = Number(gridMeta?.rows ?? pointsPayload?.grid?.rows);
  const width = Number(gridMeta?.width ?? pointsPayload?.image?.width);
  const height = Number(gridMeta?.height ?? pointsPayload?.image?.height);

  if (
    !Number.isFinite(cellSize) ||
    !Number.isFinite(cols) ||
    !Number.isFinite(rows) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    cellSize <= 0 ||
    cols <= 0 ||
    rows <= 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return {
    cellSize,
    cols,
    rows,
    width,
    height,
    totalCells: cols * rows,
  };
}

function cellIndex(cell: RouteCell, spec: GridSpec): number {
  return cell.row * spec.cols + cell.col;
}

function indexToCell(index: number, spec: GridSpec): RouteCell {
  return {
    col: index % spec.cols,
    row: Math.floor(index / spec.cols),
  };
}

function isCellInBounds(
  cell: Partial<RouteCell> | null,
  spec: GridSpec,
): cell is RouteCell {
  if (!cell || typeof cell.col !== "number" || typeof cell.row !== "number")
    return false;
  return (
    Number.isInteger(cell.col) &&
    Number.isInteger(cell.row) &&
    cell.col >= 0 &&
    cell.row >= 0 &&
    cell.col < spec.cols &&
    cell.row < spec.rows
  );
}

function cellCenter(cell: RouteCell, spec: GridSpec): MapPoint {
  return {
    x: (cell.col + 0.5) * spec.cellSize,
    y: (cell.row + 0.5) * spec.cellSize,
  };
}

function portalPoint(
  portal: OcrPortal,
  cell: RouteCell,
  spec: GridSpec,
): MapPoint {
  const x = Number(portal?.x);
  const y = Number(portal?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  return cellCenter(cell, spec);
}

function normalizePortals(
  point: OcrPoint,
  spec: GridSpec,
  gridBytes: Uint8Array,
): NormalizedPortal[] {
  const portals = Array.isArray(point?.portals) ? point.portals : [];
  return portals.reduce<NormalizedPortal[]>((result, portal) => {
    const cell = {
      col: Number(portal?.col),
      row: Number(portal?.row),
    };
    if (!isCellInBounds(cell, spec)) return result;

    const index = cellIndex(cell, spec);
    if (gridBytes[index] === GRID_BLOCKED) return result;

    const centerX = Number(point?.center_x);
    const centerY = Number(point?.center_y);
    result.push({
      cell,
      index,
      point: portalPoint(portal, cell, spec),
      sourcePoint: {
        x: Number.isFinite(centerX)
          ? centerX
          : portalPoint(portal, cell, spec).x,
        y: Number.isFinite(centerY)
          ? centerY
          : portalPoint(portal, cell, spec).y,
      },
    });
    return result;
  }, []);
}

/** Restricts route origins to the exact OCR point already adopted by another route. */
function filterPortalsByStartPosition(
  portals: NormalizedPortal[],
  startPosition: MapPoint | undefined,
  spec: GridSpec,
): NormalizedPortal[] {
  if (!startPosition) return portals;

  const epsilon = 1e-6;
  return portals.filter((portal) => {
    const x = (portal.sourcePoint.x / spec.width) * 100;
    const y = (portal.sourcePoint.y / spec.height) * 100;
    return (
      Math.abs(x - startPosition.x) <= epsilon &&
      Math.abs(y - startPosition.y) <= epsilon
    );
  });
}

function cellMultiplier(index: number, gridBytes: Uint8Array): number {
  return gridBytes[index] === GRID_CROWDED ? CROWD_MULTIPLIER : 1;
}

function edgeCost(
  sourceIndex: number,
  targetIndex: number,
  spec: GridSpec,
  gridBytes: Uint8Array,
): number {
  return (
    (spec.cellSize *
      (cellMultiplier(sourceIndex, gridBytes) +
        cellMultiplier(targetIndex, gridBytes))) /
    2
  );
}

function neighborIndexes(
  index: number,
  spec: GridSpec,
  gridBytes: Uint8Array,
): number[] {
  const cell = indexToCell(index, spec);
  const neighbors: number[] = [];
  const candidates = [
    { col: cell.col - 1, row: cell.row },
    { col: cell.col + 1, row: cell.row },
    { col: cell.col, row: cell.row - 1 },
    { col: cell.col, row: cell.row + 1 },
  ];

  candidates.forEach((candidate) => {
    if (!isCellInBounds(candidate, spec)) return;
    const candidateIndex = cellIndex(candidate, spec);
    if (gridBytes[candidateIndex] === GRID_BLOCKED) return;
    neighbors.push(candidateIndex);
  });

  return neighbors;
}

function restoreCellIndexes(
  previous: Int32Array,
  reachedIndex: number,
): number[] {
  const indexes: number[] = [];
  let currentIndex = reachedIndex;

  while (currentIndex >= 0) {
    indexes.push(currentIndex);
    if (previous[currentIndex] === currentIndex) break;
    currentIndex = previous[currentIndex];
  }

  return indexes.reverse();
}

function buildRoutePoints(
  cellIndexes: number[],
  startPortal: NormalizedPortal,
  targetPortal: NormalizedPortal,
  spec: GridSpec,
): { cells: RouteCell[]; points: MapPoint[] } {
  const cells = cellIndexes.map((index) => indexToCell(index, spec));
  const points: MapPoint[] = [];

  cells.forEach((cell, index) => {
    if (index === 0) {
      points.push(startPortal.point);
    } else if (index === cells.length - 1) {
      points.push(targetPortal.point);
    } else {
      points.push(cellCenter(cell, spec));
    }
  });

  if (
    cells.length === 1 &&
    (startPortal.point.x !== targetPortal.point.x ||
      startPortal.point.y !== targetPortal.point.y)
  ) {
    points.push(targetPortal.point);
  }

  return { cells, points };
}

export function buildDistanceMap(
  pointsPayload: PointsPayload,
  gridMeta: Partial<GridMeta>,
  gridBytes: Uint8Array,
  startSpace: string,
): DistanceMap | null {
  if (!(gridBytes instanceof Uint8Array)) return null;

  const spec = readGridSpec(pointsPayload, gridMeta);
  if (!spec || gridBytes.length < spec.totalCells) return null;

  const pointMap = buildPointMap(pointsPayload);
  const startPoints = pointMap.get(spaceKey(startSpace)) || [];
  if (startPoints.length === 0) return null;

  const startPortals = startPoints.flatMap((point) =>
    normalizePortals(point, spec, gridBytes),
  );
  if (startPortals.length === 0) return null;

  const distances = new Float64Array(spec.totalCells);
  distances.fill(Infinity);
  const heap = new MinHeap();

  startPortals.forEach((portal) => {
    if (distances[portal.index] > 0) {
      distances[portal.index] = 0;
      heap.push({ cost: 0, index: portal.index });
    }
  });

  while (heap.length > 0) {
    const current = heap.pop();
    if (!current || current.cost !== distances[current.index]) continue;

    neighborIndexes(current.index, spec, gridBytes).forEach((neighborIndex) => {
      const nextCost =
        current.cost + edgeCost(current.index, neighborIndex, spec, gridBytes);
      if (nextCost >= distances[neighborIndex]) return;

      distances[neighborIndex] = nextCost;
      heap.push({ cost: nextCost, index: neighborIndex });
    });
  }

  return { pointMap, spec, distances };
}

function distanceToPointPortals(
  point: OcrPoint,
  spec: GridSpec,
  gridBytes: Uint8Array,
  distances: Float64Array,
): number {
  const portals = normalizePortals(point, spec, gridBytes);
  return portals.reduce(
    (best, portal) => Math.min(best, distances[portal.index]),
    Infinity,
  );
}

function nearestPointByDistance(
  points: OcrPoint[],
  spec: GridSpec,
  gridBytes: Uint8Array,
  distances: Float64Array,
): { point: OcrPoint | null; distance: number } {
  return points.reduce<{ point: OcrPoint | null; distance: number }>(
    (best, point) => {
      const distance = distanceToPointPortals(
        point,
        spec,
        gridBytes,
        distances,
      );
      return distance < best.distance ? { point, distance } : best;
    },
    { point: null, distance: Infinity },
  );
}

function pointPosition(
  point: OcrPoint | null,
  spec: GridSpec,
): MapPoint | null {
  const x = Number(point?.center_x);
  const y = Number(point?.center_y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    x: (x / spec.width) * 100,
    y: (y / spec.height) * 100,
  };
}

export function rankCandidatesByGridDistance(
  pointsPayload: PointsPayload,
  gridMeta: Partial<GridMeta>,
  gridBytes: Uint8Array,
  startSpace: string,
  candidates: Circle[],
): RankedCandidate[] {
  const distanceMap = buildDistanceMap(
    pointsPayload,
    gridMeta,
    gridBytes,
    startSpace,
  );
  const sourceCandidates = Array.isArray(candidates) ? candidates : [];

  if (!distanceMap) {
    return sourceCandidates.map((candidate) => ({
      candidate,
      distance: Infinity,
    }));
  }

  return sourceCandidates
    .map((candidate, originalIndex) => {
      const points = distanceMap.pointMap.get(spaceKey(candidate?.space)) || [];
      const nearest = nearestPointByDistance(
        points,
        distanceMap.spec,
        gridBytes,
        distanceMap.distances,
      );

      return {
        candidate,
        distance: nearest.distance,
        position: pointPosition(nearest.point, distanceMap.spec),
        originalIndex,
      };
    })
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.originalIndex - b.originalIndex;
    });
}

export function planRoute(
  pointsPayload: PointsPayload,
  gridMeta: Partial<GridMeta>,
  gridBytes: Uint8Array,
  startSpace: string,
  targetSpace: string,
  options: PlanRouteOptions = {},
): RouteResult | null {
  if (!(gridBytes instanceof Uint8Array)) return null;

  const spec = readGridSpec(pointsPayload, gridMeta);
  if (!spec || gridBytes.length < spec.totalCells) return null;

  const pointMap = buildPointMap(pointsPayload);
  const startPoints = pointMap.get(spaceKey(startSpace)) || [];
  const targetPoints = pointMap.get(spaceKey(targetSpace)) || [];
  if (startPoints.length === 0 || targetPoints.length === 0) return null;

  const startPortals = filterPortalsByStartPosition(
    startPoints.flatMap((point) => normalizePortals(point, spec, gridBytes)),
    options.startPosition,
    spec,
  );
  const targetPortals = targetPoints.flatMap((point) =>
    normalizePortals(point, spec, gridBytes),
  );
  if (startPortals.length === 0 || targetPortals.length === 0) return null;

  const targetByIndex = new Map<number, NormalizedPortal>();
  targetPortals.forEach((portal) => {
    if (!targetByIndex.has(portal.index))
      targetByIndex.set(portal.index, portal);
  });

  const distances = new Float64Array(spec.totalCells);
  distances.fill(Infinity);
  const previous = new Int32Array(spec.totalCells);
  previous.fill(-1);
  const sourcePortalIndexes = new Int32Array(spec.totalCells);
  sourcePortalIndexes.fill(-1);
  const heap = new MinHeap();

  startPortals.forEach((portal, portalIndex) => {
    if (distances[portal.index] >= 0) {
      distances[portal.index] = 0;
      previous[portal.index] = portal.index;
      sourcePortalIndexes[portal.index] = portalIndex;
      heap.push({ cost: 0, index: portal.index });
    }
  });

  let reachedIndex = -1;
  while (heap.length > 0) {
    const current = heap.pop();
    if (!current || current.cost !== distances[current.index]) continue;
    if (targetByIndex.has(current.index)) {
      reachedIndex = current.index;
      break;
    }

    neighborIndexes(current.index, spec, gridBytes).forEach((neighborIndex) => {
      const nextCost =
        current.cost + edgeCost(current.index, neighborIndex, spec, gridBytes);
      if (nextCost >= distances[neighborIndex]) return;

      distances[neighborIndex] = nextCost;
      previous[neighborIndex] = current.index;
      sourcePortalIndexes[neighborIndex] = sourcePortalIndexes[current.index];
      heap.push({ cost: nextCost, index: neighborIndex });
    });
  }

  if (reachedIndex < 0) return null;

  const cellIndexes = restoreCellIndexes(previous, reachedIndex);
  const startPortal = startPortals[sourcePortalIndexes[reachedIndex]];
  const targetPortal = targetByIndex.get(reachedIndex);
  if (!startPortal || !targetPortal) return null;

  const { cells, points } = buildRoutePoints(
    cellIndexes,
    startPortal,
    targetPortal,
    spec,
  );

  return {
    cost: distances[reachedIndex],
    cells,
    points,
    startPosition: {
      x: (startPortal.sourcePoint.x / spec.width) * 100,
      y: (startPortal.sourcePoint.y / spec.height) * 100,
    },
    targetPosition: {
      x: (targetPortal.sourcePoint.x / spec.width) * 100,
      y: (targetPortal.sourcePoint.y / spec.height) * 100,
    },
    image: {
      width: spec.width,
      height: spec.height,
    },
  };
}

export function planRouteFromGridIndex(
  pointsPayload: PointsPayload,
  gridMeta: Partial<GridMeta>,
  gridBytes: Uint8Array,
  startGridIndex: number,
  targetSpace: string,
): RouteResult | null {
  if (!(gridBytes instanceof Uint8Array)) return null;

  const spec = readGridSpec(pointsPayload, gridMeta);
  if (!spec || gridBytes.length < spec.totalCells) return null;
  if (startGridIndex < 0 || startGridIndex >= spec.totalCells) return null;
  if (gridBytes[startGridIndex] === GRID_BLOCKED) return null;

  const pointMap = buildPointMap(pointsPayload);
  let targetPoints = pointMap.get(spaceKey(targetSpace)) || [];
  if (targetPoints.length === 0 && Array.isArray(pointsPayload?.points)) {
    targetPoints = pointsPayload.points.filter(
      (p) => (p as unknown as Record<string, unknown>)?.space === targetSpace,
    );
  }
  if (targetPoints.length === 0) return null;

  const targetPortals = targetPoints.flatMap((point) =>
    normalizePortals(point, spec, gridBytes),
  );
  if (targetPortals.length === 0) return null;

  const cellCol = startGridIndex % spec.cols;
  const cellRow = Math.floor(startGridIndex / spec.cols);
  const indexedStartPortal = Array.from(pointMap.values())
    .flatMap((points) =>
      points.flatMap((point) => normalizePortals(point, spec, gridBytes)),
    )
    .find((portal) => portal.index === startGridIndex);
  const startPortal: NormalizedPortal = indexedStartPortal || {
    cell: { col: cellCol, row: cellRow },
    index: startGridIndex,
    point: {
      x: (cellCol + 0.5) * spec.cellSize,
      y: (cellRow + 0.5) * spec.cellSize,
    },
    sourcePoint: {
      x: (cellCol + 0.5) * spec.cellSize,
      y: (cellRow + 0.5) * spec.cellSize,
    },
  };

  const targetByIndex = new Map<number, NormalizedPortal>();
  targetPortals.forEach((portal) => {
    if (!targetByIndex.has(portal.index))
      targetByIndex.set(portal.index, portal);
  });

  const distances = new Float64Array(spec.totalCells);
  distances.fill(Infinity);
  const previous = new Int32Array(spec.totalCells);
  previous.fill(-1);
  const heap = new MinHeap();

  distances[startGridIndex] = 0;
  previous[startGridIndex] = startGridIndex;
  heap.push({ cost: 0, index: startGridIndex });

  let reachedIndex = -1;
  if (targetByIndex.has(startGridIndex)) {
    reachedIndex = startGridIndex;
  } else {
    while (heap.length > 0) {
      const current = heap.pop();
      if (!current || current.cost !== distances[current.index]) continue;
      if (targetByIndex.has(current.index)) {
        reachedIndex = current.index;
        break;
      }

      neighborIndexes(current.index, spec, gridBytes).forEach(
        (neighborIndex) => {
          const nextCost =
            current.cost +
            edgeCost(current.index, neighborIndex, spec, gridBytes);
          if (nextCost >= distances[neighborIndex]) return;

          distances[neighborIndex] = nextCost;
          previous[neighborIndex] = current.index;
          heap.push({ cost: nextCost, index: neighborIndex });
        },
      );
    }
  }

  if (reachedIndex < 0) return null;

  const cellIndexes = restoreCellIndexes(previous, reachedIndex);
  const targetPortal = targetByIndex.get(reachedIndex);
  if (!targetPortal) return null;

  const { cells, points } = buildRoutePoints(
    cellIndexes,
    startPortal,
    targetPortal,
    spec,
  );

  return {
    cost: distances[reachedIndex],
    cells,
    points,
    startPosition: {
      x: (startPortal.sourcePoint.x / spec.width) * 100,
      y: (startPortal.sourcePoint.y / spec.height) * 100,
    },
    targetPosition: {
      x: (targetPortal.sourcePoint.x / spec.width) * 100,
      y: (targetPortal.sourcePoint.y / spec.height) * 100,
    },
    image: {
      width: spec.width,
      height: spec.height,
    },
  };
}
