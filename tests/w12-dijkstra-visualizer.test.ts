import assert from "node:assert/strict";
import { test } from "vitest";
import type { GridMeta } from "../apps/webapp/js/types/domain";
import {
  distanceToColor,
  findNearestWalkableIndex,
  pointerToGridCell,
  revealCountAtTime,
  runDijkstraTrace,
} from "../apps/webapp/js/demos/w12-dijkstra/core";

const META: GridMeta = {
  width: 24,
  height: 16,
  cell_size: 8,
  cols: 3,
  rows: 2,
};

test("W12 visualizer applies the same normal and crowded edge weights as routing", () => {
  const grid = new Uint8Array([
    1, 2, 1,
    1, 0, 1,
  ]);
  const result = runDijkstraTrace(META, grid, 0);

  assert.equal(result.distances[1], 10);
  assert.equal(result.distances[2], 20);
  assert.equal(result.distances[4], Infinity);
  assert.equal(result.visitedCount, 5);
});

test("W12 visualizer settles reachable cells in nondecreasing distance order", () => {
  const grid = new Uint8Array([
    1, 1, 1,
    1, 2, 1,
  ]);
  const result = runDijkstraTrace(META, grid, 0);

  let previous = -Infinity;
  for (const index of result.settledOrder) {
    assert.ok(result.distances[index] >= previous);
    previous = result.distances[index];
  }
});

test("W12 visualizer moves a blocked click to the nearest walkable cell", () => {
  const grid = new Uint8Array([
    1, 0, 1,
    1, 0, 1,
  ]);

  assert.equal(findNearestWalkableIndex(META, grid, 1, 1), 3);
});

test("W12 visualizer maps pointer coordinates and clamps the map edge", () => {
  assert.deepEqual(pointerToGridCell(999, -10, 1000, 500, META), {
    col: 2,
    row: 0,
  });
});

test("W12 visualizer maps near distances to blue and far distances to red", () => {
  const near = distanceToColor(0, 100);
  const far = distanceToColor(100, 100);

  assert.ok(near.b > near.r);
  assert.ok(far.r > far.b);
});

test("W12 visualizer reveals every settled cell at the selected duration", () => {
  assert.equal(revealCountAtTime(1800, 1800, 98_373), 98_373);
  assert.equal(revealCountAtTime(0, 1800, 98_373), 0);
});
