import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import { resolveBundleAssetUrl } from "../apps/webapp/js/demos/w12-dijkstra/asset-url";
import {
  distanceToColor,
  findNearestWalkableIndex,
  pointerToGridCell,
  revealCountAtTime,
  runDijkstraTrace,
} from "../apps/webapp/js/demos/w12-dijkstra/core";
import { normalizeZoomPercent } from "../apps/webapp/js/demos/w12-dijkstra/view-controls";
import type { GridMeta } from "../apps/webapp/js/types/domain";

const META: GridMeta = {
  width: 24,
  height: 16,
  cell_size: 8,
  cols: 3,
  rows: 2,
};

const DEMO_HTML = readFileSync(
  resolve("apps/webapp/demos/w12-dijkstra/index.html"),
  "utf8",
);

test("W12 visualizer resolves relative bundle assets from the Vite page URL", () => {
  assert.equal(
    resolveBundleAssetUrl(
      "/assets/maps/C108/manifest.json",
      "./w12/map.svg",
      "http://127.0.0.1:5173/demos/w12-dijkstra/",
    ),
    "http://127.0.0.1:5173/assets/maps/C108/w12/map.svg",
  );
});

test("W12 visualizer exposes slow playback choices", () => {
  assert.match(DEMO_HTML, /value="10000"/);
  assert.match(DEMO_HTML, /value="20000"/);
  assert.match(DEMO_HTML, /value="30000"/);
});

test("W12 visualizer constrains zoom to 100 through 300 percent", () => {
  assert.equal(normalizeZoomPercent(50), 100);
  assert.equal(normalizeZoomPercent(175), 175);
  assert.equal(normalizeZoomPercent(400), 300);
  assert.equal(normalizeZoomPercent(Number.NaN), 100);
});

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
