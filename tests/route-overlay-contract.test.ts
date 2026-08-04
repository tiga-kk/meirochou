import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  GridMeta,
  PointsPayload,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import {
  buildRouteOverlaySvg,
  planRoute,
} from "../apps/webapp/js/route-planner";

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
});
