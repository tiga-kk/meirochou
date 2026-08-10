// @vitest-environment happy-dom

import assert from "node:assert/strict";
import { test } from "vitest";
import {
  planRoute,
  planRouteFromGridIndex,
} from "../apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner";
import type {
  GridMeta,
  PointsPayload,
} from "../apps/webapp/js/features/route-guidance/domain/routing/grid-route-types";
import { buildRouteOverlaySvg } from "../apps/webapp/js/features/route-guidance/ui/route-overlay-svg";

const fictionalPoints: PointsPayload = {
  version: 1,
  image: { width: 1000, height: 800 },
  grid: { cell_size: 10, cols: 100, rows: 80 },
  points: [
    {
      identifier: "ア",
      number: 1,
      center_x: 100,
      center_y: 100,
      portals: [{ col: 10, row: 10, x: 105, y: 105 }],
    },
    {
      identifier: "ア",
      number: 2,
      center_x: 200,
      center_y: 200,
      portals: [{ col: 20, row: 20, x: 205, y: 205 }],
    },
  ],
};

const fictionalGridMeta: GridMeta = {
  cell_size: 10,
  cols: 100,
  rows: 80,
  width: 1000,
  height: 800,
};

// 100x80 grid: all cells walkable (value 1)
const fictionalGridBytes = new Uint8Array(100 * 80);
fictionalGridBytes.fill(1);

test("planRoute and buildRouteOverlaySvg fulfill coordinate contracts with fictional data", () => {
  const route = planRoute(
    fictionalPoints,
    fictionalGridMeta,
    fictionalGridBytes,
    "東ア01",
    "東ア02",
  );

  assert.ok(route);
  assert.ok(route.physicalPixelLength > 0);
  assert.equal(route.image.width, 1000);
  assert.equal(route.image.height, 800);
  assert.ok(route.points.length >= 2);

  // Check start and end points match portal positions
  assert.equal(route.points[0].x, 105);
  assert.equal(route.points[0].y, 105);
  assert.equal(route.points[route.points.length - 1].x, 205);
  assert.equal(route.points[route.points.length - 1].y, 205);

  // Build SVG overlay
  const svg = buildRouteOverlaySvg(route);
  assert.ok(svg);

  const viewBox = svg.getAttribute("viewBox");
  assert.equal(viewBox, "0 0 1000 800");

  const polyline = svg.querySelector("polyline");
  assert.ok(polyline);

  const pointsAttr = polyline.getAttribute("points");
  assert.ok(pointsAttr);

  // All points in polyline must be within [0, width] and [0, height]
  const rawPoints = pointsAttr.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return { x, y };
  });

  for (const p of rawPoints) {
    assert.ok(p.x >= 0 && p.x <= 1000, `x=${p.x} out of bounds`);
    assert.ok(p.y >= 0 && p.y <= 800, `y=${p.y} out of bounds`);
  }

  assert.ok(svg.querySelector(".route-overlay-line"));
  assert.ok(svg.querySelector(".route-flow-line"));
  assert.equal(svg.querySelector(".route-start-marker")?.textContent, "S");
  assert.equal(svg.querySelector(".route-goal-marker")?.textContent, "G");

  const candidate = buildRouteOverlaySvg(route, undefined, "candidate");
  assert.ok(candidate);
  assert.equal(candidate.querySelector(".route-flow-line"), null);
});

test("weighted cost stays separate from unweighted pixel length for both route origins", () => {
  const points: PointsPayload = {
    image: { width: 30, height: 10 },
    grid: { cell_size: 10, cols: 3, rows: 1 },
    points: [
      {
        identifier: "ア",
        number: 1,
        center_x: 5,
        center_y: 5,
        portals: [{ col: 0, row: 0, x: 5, y: 5 }],
      },
      {
        identifier: "ア",
        number: 2,
        center_x: 25,
        center_y: 5,
        portals: [{ col: 2, row: 0, x: 25, y: 5 }],
      },
    ],
  };
  const meta: GridMeta = {
    cell_size: 10,
    cols: 3,
    rows: 1,
    width: 30,
    height: 10,
  };
  const grid = new Uint8Array([1, 2, 1]);

  for (const route of [
    planRoute(points, meta, grid, "東ア01", "東ア02"),
    planRouteFromGridIndex(points, meta, grid, 0, "東ア02"),
  ]) {
    assert.ok(route);
    assert.equal(route.physicalPixelLength, 20);
    assert.equal(route.cost, 25);
    assert.ok(route.cost > route.physicalPixelLength);
  }
});

test("planRouteFromGridIndex keeps ordered points for current route endpoints and flow", () => {
  const route = planRouteFromGridIndex(
    fictionalPoints,
    fictionalGridMeta,
    fictionalGridBytes,
    10 * fictionalGridMeta.cols + 10,
    "東ア02",
  );

  assert.ok(route);
  const overlay = buildRouteOverlaySvg(route);
  assert.ok(overlay);

  const orderedPoints = route.points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  assert.equal(
    overlay.querySelector(".route-overlay-line")?.getAttribute("points"),
    orderedPoints,
  );
  assert.equal(
    overlay.querySelector(".route-flow-line")?.getAttribute("points"),
    orderedPoints,
  );
  assert.equal(
    overlay.querySelector(".route-start-marker")?.getAttribute("transform"),
    `translate(${route.points[0].x} ${route.points[0].y})`,
  );
  assert.equal(
    overlay.querySelector(".route-goal-marker")?.getAttribute("transform"),
    `translate(${route.points.at(-1)?.x} ${route.points.at(-1)?.y})`,
  );

  const candidate = buildRouteOverlaySvg(route, undefined, "candidate");
  assert.ok(candidate);
  assert.equal(candidate.querySelector(".route-flow-line"), null);
  assert.equal(candidate.querySelector(".route-start-marker"), null);
  assert.equal(candidate.querySelector(".route-goal-marker"), null);
});
