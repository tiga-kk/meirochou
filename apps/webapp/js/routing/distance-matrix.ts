// ===== Types =====

export interface DistanceMatrixCacheKeyInput {
  readonly eventId: string;
  readonly dayId: string;
  readonly areaId: string;
  readonly bundleVersion: string;
  readonly gridWeightVersion: string;
  readonly endpoints: readonly {
    readonly space: string;
    readonly gridIndex: number;
  }[];
  readonly schemaVersion: 1;
}

export interface StoredDistanceMatrix {
  readonly schemaVersion: 1;
  readonly cacheKey: string;
  readonly areaId: string;
  readonly spaces: readonly string[];
  readonly size: number;
  /** Flat N×N row-major array. distances[i*N + j] = cost from i to j. */
  readonly distances: readonly number[];
  readonly createdAt: string;
}

export function parseStoredDistanceMatrix(
  input: unknown,
): StoredDistanceMatrix | null {
  if (typeof input !== "object" || input === null) return null;
  const value = input as Record<string, unknown>;
  const spaces = value.spaces;
  const distances = value.distances;
  const size = value.size;
  const matrixSize = typeof size === "number" ? size : -1;
  if (
    value.schemaVersion !== 1 ||
    typeof value.cacheKey !== "string" ||
    typeof value.areaId !== "string" ||
    !Array.isArray(spaces) ||
    !spaces.every((space) => typeof space === "string") ||
    !Number.isInteger(matrixSize) ||
    matrixSize < 1 ||
    spaces.length !== matrixSize ||
    !Array.isArray(distances) ||
    distances.length !== matrixSize * matrixSize ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  const normalizedDistances = distances.map((distance) =>
    distance === null ? Infinity : distance,
  );
  if (
    !normalizedDistances.every(
      (distance): distance is number =>
        typeof distance === "number" &&
        (Number.isFinite(distance) || distance === Infinity),
    )
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    cacheKey: value.cacheKey,
    areaId: value.areaId,
    spaces: Object.freeze([...spaces] as string[]),
    size: matrixSize,
    distances: Object.freeze(normalizedDistances),
    createdAt: value.createdAt,
  });
}

export interface DistanceMatrixRepository {
  load(cacheKey: string): StoredDistanceMatrix | null;
  save(matrix: StoredDistanceMatrix): boolean;
  saveWithRef?(
    eventId: string,
    dayId: string,
    matrix: StoredDistanceMatrix,
  ): boolean;
  deleteByEventDay(eventId: string, dayId: string): void;
}

export interface MatrixEndpoint {
  readonly space: string;
  readonly gridIndex: number;
}

export interface MatrixGridInput {
  readonly grid: Uint8Array;
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
}

export interface DistanceMatrixJobInput {
  readonly eventId: string;
  readonly dayId: string;
  readonly areaId: string;
  readonly cacheKey: string;
  readonly gridInput: MatrixGridInput;
  readonly endpoints: readonly MatrixEndpoint[];
}

export interface AllPairsDistanceResult {
  readonly spaces: readonly string[];
  readonly size: number;
  /** Flat N×N row-major array. distances[i*N + j] = cost from i to j. */
  readonly distances: readonly number[];
}

// ===== Cache key =====

/**
 * コンテントアドレスなキャッシュキーを生成する。
 * eventId/dayId/areaId はキーに含めない（同じgrid・endpoint構成なら再利用可）。
 */
export function buildDistanceMatrixCacheKey(
  input: DistanceMatrixCacheKeyInput,
): string {
  // Sort endpoints by gridIndex and space to make the key order-independent.
  const sortedEndpoints = [...input.endpoints]
    .sort((a, b) => a.gridIndex - b.gridIndex || a.space.localeCompare(b.space))
    .map((endpoint) => ({
      gridIndex: endpoint.gridIndex,
      space: endpoint.space,
    }));

  return JSON.stringify({
    schemaVersion: input.schemaVersion,
    bundleVersion: input.bundleVersion,
    gridWeightVersion: input.gridWeightVersion,
    endpoints: sortedEndpoints,
  });
}

// ===== Pure Dijkstra kernel =====

const GRID_BLOCKED = 0;
const GRID_CROWDED = 2;
const CROWD_MULTIPLIER = 1.5;

interface HeapItem {
  cost: number;
  index: number;
}

class MinHeap {
  private items: HeapItem[] = [];

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
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.items[parentIndex].cost <= this.items[index].cost) break;
      [this.items[parentIndex], this.items[index]] = [
        this.items[index],
        this.items[parentIndex],
      ];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.items.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      if (left < length && this.items[left].cost < this.items[smallest].cost) {
        smallest = left;
      }
      if (
        right < length &&
        this.items[right].cost < this.items[smallest].cost
      ) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.items[smallest], this.items[index]] = [
        this.items[index],
        this.items[smallest],
      ];
      index = smallest;
    }
  }
}

function cellMultiplier(gridValue: number): number {
  return gridValue === GRID_CROWDED ? CROWD_MULTIPLIER : 1;
}

function edgeCost(
  sourceVal: number,
  targetVal: number,
  cellSize: number,
): number {
  return (
    (cellSize * (cellMultiplier(sourceVal) + cellMultiplier(targetVal))) / 2
  );
}

function getNeighborIndexes(
  index: number,
  cols: number,
  rows: number,
  grid: Uint8Array,
): number[] {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const neighbors: number[] = [];
  const candidates = [
    { c: col - 1, r: row },
    { c: col + 1, r: row },
    { c: col, r: row - 1 },
    { c: col, r: row + 1 },
  ];
  for (const { c, r } of candidates) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    const ni = r * cols + c;
    if (grid[ni] === GRID_BLOCKED) continue;
    neighbors.push(ni);
  }
  return neighbors;
}

/**
 * グリッド上の1始点からの最短距離配列をDijkstraで計算する。
 * パス形状は保存しない（距離のみ）。
 */
export function dijkstraFromCell(
  startIndex: number,
  gridInput: MatrixGridInput,
): Float64Array {
  const { grid, cols, rows, cellSize } = gridInput;
  const validGrid = grid instanceof Uint8Array;
  const validDimensions =
    Number.isInteger(cols) &&
    Number.isInteger(rows) &&
    cols > 0 &&
    rows > 0 &&
    Number.isSafeInteger(cols * rows) &&
    Number.isFinite(cellSize) &&
    cellSize > 0;
  const total = validDimensions ? cols * rows : 0;
  const distances = new Float64Array(total).fill(Infinity);

  if (
    !Number.isInteger(startIndex) ||
    startIndex < 0 ||
    startIndex >= total ||
    !validDimensions ||
    !validGrid ||
    grid.length < total ||
    grid[startIndex] === GRID_BLOCKED
  ) {
    return distances;
  }

  distances[startIndex] = 0;
  const heap = new MinHeap();
  heap.push({ cost: 0, index: startIndex });

  while (heap.length > 0) {
    const current = heap.pop();
    if (!current || current.cost !== distances[current.index]) continue;

    for (const ni of getNeighborIndexes(current.index, cols, rows, grid)) {
      const nextCost =
        current.cost + edgeCost(grid[current.index], grid[ni], cellSize);
      if (nextCost < distances[ni]) {
        distances[ni] = nextCost;
        heap.push({ cost: nextCost, index: ni });
      }
    }
  }

  return distances;
}

/** 始点から指定endpoint群への距離だけを一度のDijkstraで抽出する。 */
export function distancesFromStartToEndpoints(
  startIndex: number,
  gridInput: MatrixGridInput,
  endpointIndexes: readonly number[],
): Float64Array {
  const distances = dijkstraFromCell(startIndex, gridInput);
  return Float64Array.from(
    endpointIndexes.map(
      (endpointIndex) => distances[endpointIndex] ?? Infinity,
    ),
  );
}

/**
 * 全エンドポイントペア間の距離行列を計算する（all-pairs Dijkstra）。
 * geometryは保存しない（distanceのみ flat N×N 配列）。
 */
export function computeAllPairsDistances(
  gridInput: MatrixGridInput,
  endpoints: readonly MatrixEndpoint[],
): AllPairsDistanceResult | null {
  const n = endpoints.length;
  if (n === 0) return null;

  const flatDistances: number[] = new Array(n * n).fill(Infinity);

  for (let i = 0; i < n; i++) {
    const distFromI = dijkstraFromCell(endpoints[i].gridIndex, gridInput);
    for (let j = 0; j < n; j++) {
      if (i === j) {
        flatDistances[i * n + j] = 0;
      } else {
        flatDistances[i * n + j] = distFromI[endpoints[j].gridIndex];
      }
    }
  }

  return Object.freeze({
    spaces: Object.freeze(endpoints.map((e) => e.space)),
    size: n,
    distances: Object.freeze(flatDistances),
  });
}
