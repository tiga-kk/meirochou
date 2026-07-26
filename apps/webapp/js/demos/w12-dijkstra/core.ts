import type { GridMeta } from "../../types/domain";

const GRID_BLOCKED = 0;
const GRID_CROWDED = 2;
const CROWD_MULTIPLIER = 1.5;

interface HeapItem {
  cost: number;
  index: number;
}

class MinHeap {
  private readonly items: HeapItem[] = [];

  get length(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.items[parentIndex];
      if (
        parent.cost < item.cost ||
        (parent.cost === item.cost && parent.index <= item.index)
      ) {
        break;
      }
      this.items[index] = parent;
      index = parentIndex;
    }
    this.items[index] = item;
  }

  pop(): HeapItem | null {
    const first = this.items[0];
    if (!first) return null;
    const last = this.items.pop();
    if (!last || this.items.length === 0) return first;

    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      if (leftIndex >= this.items.length) break;

      let childIndex = leftIndex;
      const left = this.items[leftIndex];
      const right = this.items[rightIndex];
      if (
        right &&
        (right.cost < left.cost ||
          (right.cost === left.cost && right.index < left.index))
      ) {
        childIndex = rightIndex;
      }

      const child = this.items[childIndex];
      if (
        child.cost > last.cost ||
        (child.cost === last.cost && child.index >= last.index)
      ) {
        break;
      }
      this.items[index] = child;
      index = childIndex;
    }
    this.items[index] = last;
    return first;
  }
}

export interface DijkstraTrace {
  distances: Float64Array;
  settledOrder: Uint32Array;
  visitedCount: number;
  maxDistance: number;
}

function assertGridContract(gridMeta: GridMeta, gridBytes: Uint8Array): void {
  const totalCells = gridMeta.cols * gridMeta.rows;
  if (!Number.isInteger(gridMeta.cols) || !Number.isInteger(gridMeta.rows)) {
    throw new Error("Grid dimensions must be integers");
  }
  if (gridBytes.length !== totalCells) {
    throw new Error(
      `grid.bin length mismatch: expected ${totalCells}, received ${gridBytes.length}`,
    );
  }
}

function cellMultiplier(index: number, gridBytes: Uint8Array): number {
  return gridBytes[index] === GRID_CROWDED ? CROWD_MULTIPLIER : 1;
}

function edgeCost(
  sourceIndex: number,
  targetIndex: number,
  gridMeta: GridMeta,
  gridBytes: Uint8Array,
): number {
  return (
    (gridMeta.cell_size *
      (cellMultiplier(sourceIndex, gridBytes) +
        cellMultiplier(targetIndex, gridBytes))) /
    2
  );
}

function visitNeighbors(
  index: number,
  cols: number,
  rows: number,
  visitor: (neighborIndex: number) => void,
): void {
  const col = index % cols;
  const row = Math.floor(index / cols);
  if (col > 0) visitor(index - 1);
  if (col + 1 < cols) visitor(index + 1);
  if (row > 0) visitor(index - cols);
  if (row + 1 < rows) visitor(index + cols);
}

export function runDijkstraTrace(
  gridMeta: GridMeta,
  gridBytes: Uint8Array,
  startIndex: number,
): DijkstraTrace {
  assertGridContract(gridMeta, gridBytes);
  const totalCells = gridMeta.cols * gridMeta.rows;
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= totalCells) {
    throw new Error("Start cell is outside the grid");
  }
  if (gridBytes[startIndex] === GRID_BLOCKED) {
    throw new Error("Start cell must be walkable");
  }

  const distances = new Float64Array(totalCells);
  distances.fill(Infinity);
  distances[startIndex] = 0;
  const settled = new Uint8Array(totalCells);
  const settledOrder: number[] = [];
  const heap = new MinHeap();
  heap.push({ cost: 0, index: startIndex });
  let maxDistance = 0;

  while (heap.length > 0) {
    const current = heap.pop();
    if (!current || settled[current.index]) continue;
    if (current.cost !== distances[current.index]) continue;

    settled[current.index] = 1;
    settledOrder.push(current.index);
    maxDistance = current.cost;

    visitNeighbors(
      current.index,
      gridMeta.cols,
      gridMeta.rows,
      (neighborIndex) => {
        if (
          gridBytes[neighborIndex] === GRID_BLOCKED ||
          settled[neighborIndex]
        ) {
          return;
        }
        const nextCost =
          current.cost +
          edgeCost(current.index, neighborIndex, gridMeta, gridBytes);
        if (nextCost >= distances[neighborIndex]) return;
        distances[neighborIndex] = nextCost;
        heap.push({ cost: nextCost, index: neighborIndex });
      },
    );
  }

  return {
    distances,
    settledOrder: Uint32Array.from(settledOrder),
    visitedCount: settledOrder.length,
    maxDistance,
  };
}

export function findNearestWalkableIndex(
  gridMeta: GridMeta,
  gridBytes: Uint8Array,
  col: number,
  row: number,
): number {
  assertGridContract(gridMeta, gridBytes);
  const startCol = Math.max(0, Math.min(gridMeta.cols - 1, Math.floor(col)));
  const startRow = Math.max(0, Math.min(gridMeta.rows - 1, Math.floor(row)));
  const startIndex = startRow * gridMeta.cols + startCol;
  if (gridBytes[startIndex] !== GRID_BLOCKED) return startIndex;

  const seen = new Uint8Array(gridBytes.length);
  const queue = new Uint32Array(gridBytes.length);
  let head = 0;
  let tail = 0;
  queue[tail] = startIndex;
  tail += 1;
  seen[startIndex] = 1;

  while (head < tail) {
    const currentIndex = queue[head];
    head += 1;
    let found = -1;
    visitNeighbors(
      currentIndex,
      gridMeta.cols,
      gridMeta.rows,
      (neighborIndex) => {
        if (found >= 0 || seen[neighborIndex]) return;
        seen[neighborIndex] = 1;
        if (gridBytes[neighborIndex] !== GRID_BLOCKED) {
          found = neighborIndex;
          return;
        }
        queue[tail] = neighborIndex;
        tail += 1;
      },
    );
    if (found >= 0) return found;
  }

  throw new Error("The grid contains no walkable cell");
}

export function pointerToGridCell(
  x: number,
  y: number,
  displayWidth: number,
  displayHeight: number,
  gridMeta: GridMeta,
): { col: number; row: number } {
  if (!(displayWidth > 0) || !(displayHeight > 0)) {
    throw new Error("Displayed map dimensions must be positive");
  }
  return {
    col: Math.max(
      0,
      Math.min(
        gridMeta.cols - 1,
        Math.floor((x / displayWidth) * gridMeta.cols),
      ),
    ),
    row: Math.max(
      0,
      Math.min(
        gridMeta.rows - 1,
        Math.floor((y / displayHeight) * gridMeta.rows),
      ),
    ),
  };
}

export function revealCountAtTime(
  elapsedMs: number,
  durationMs: number,
  total: number,
): number {
  if (!(durationMs > 0) || !Number.isInteger(total) || total < 0) {
    throw new Error("Animation duration and total count are invalid");
  }
  const ratio = Math.max(0, Math.min(1, elapsedMs / durationMs));
  return Math.min(total, Math.floor(total * ratio));
}

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function distanceToColor(
  distance: number,
  maxDistance: number,
  alpha = 196,
): RgbaColor {
  const ratio =
    maxDistance > 0 ? Math.max(0, Math.min(1, distance / maxDistance)) : 0;
  const hue = 220 * (1 - ratio);
  const saturation = 0.9;
  const lightness = 0.55;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment < 1) [red, green, blue] = [chroma, x, 0];
  else if (segment < 2) [red, green, blue] = [x, chroma, 0];
  else if (segment < 3) [red, green, blue] = [0, chroma, x];
  else if (segment < 4) [red, green, blue] = [0, x, chroma];
  else if (segment < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  const match = lightness - chroma / 2;
  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
    a: Math.round(alpha),
  };
}
