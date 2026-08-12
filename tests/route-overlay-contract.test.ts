// @vitest-environment happy-dom

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, expect, it, test } from "vitest";
import {
  planRoute,
  planRouteFromGridIndex,
} from "../apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner";
import type {
  GridMeta,
  PointsPayload,
} from "../apps/webapp/js/features/route-guidance/domain/routing/grid-route-types";
import { DomRouteMapView } from "../apps/webapp/js/features/route-guidance/ui/dom-route-map-view";
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

test("route cues are distinct and long enough to read on both route overlays", () => {
  const css = readFileSync("apps/webapp/css/target.css", "utf8");
  const cue = css.match(
    /\.route-flow-comet,[\s\S]*?stroke-width:\s*(\d+);[\s\S]*?stroke-dasharray:\s*([\d.]+)\s+([\d.]+);/,
  );

  assert.ok(cue);
  assert.ok(Number(cue[1]) >= 8, "moving cue must remain visible after map scaling");
  assert.ok(Number(cue[2]) >= 28, "moving cue dash must be long enough to follow");
  assert.notEqual(cue[1], "12", "cue width must differ from the solid base path");
  assert.notEqual(`${cue[2]} ${cue[3]}`, "22 14", "cue dash must differ from candidate base styling");
  assert.match(css, /\.route-overlay-candidate \.route-flow-comet[\s\S]*?stroke:/);
});

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
  assert.equal(
    svg.querySelector(".route-overlay-line")?.getAttribute("pathLength"),
    "100",
  );
  assert.ok(svg.querySelector(".route-flow-line"));
  assert.ok(svg.querySelector(".route-flow-comet"));
  assert.equal(
    svg.querySelector(".route-flow-comet")?.getAttribute("pathLength"),
    "100",
  );
  assert.equal(
    svg.querySelector(".route-flow-direction")?.getAttribute("marker-end"),
    "url(#route-direction-arrow)",
  );
  assert.equal(
    svg.querySelector(".route-flow-direction")?.getAttribute("pathLength"),
    "100",
  );
  assert.ok(svg.querySelector("marker#route-direction-arrow"));
  assert.equal(svg.querySelector(".route-start-marker")?.textContent, "S");
  assert.equal(svg.querySelector(".route-goal-marker")?.textContent, "G");

  const candidate = buildRouteOverlaySvg(route, undefined, "candidate");
  assert.ok(candidate);
  assert.equal(
    candidate.querySelector(".route-overlay-line")?.getAttribute("pathLength"),
    "100",
  );
  assert.equal(candidate.querySelector("marker"), null);
  assert.ok(candidate.querySelector(".route-flow-line"));
  assert.ok(candidate.querySelector(".route-flow-comet"));
  assert.equal(candidate.querySelector(".route-flow-direction"), null);
  assert.equal(candidate.querySelector(".route-flow-comet")?.getAttribute("pathLength"), "100");
  assert.equal(candidate.querySelector(".route-start-marker")?.textContent, "S");
  assert.equal(candidate.querySelector(".route-goal-marker")?.textContent, "G");
  assert.equal(candidate.querySelector(".route-start-marker")?.getAttribute("transform"), "translate(105 105)");
  assert.equal(candidate.querySelector(".route-goal-marker")?.getAttribute("transform"), "translate(205 205)");
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
  assert.ok(candidate.querySelector(".route-flow-line"));
  assert.ok(candidate.querySelector(".route-flow-comet"));
  assert.equal(candidate.querySelector(".route-flow-direction"), null);
  assert.equal(candidate.querySelector(".route-start-marker")?.textContent, "S");
  assert.equal(candidate.querySelector(".route-goal-marker")?.textContent, "G");

  assert.equal(buildRouteOverlaySvg(null), null);
});

const candidateRoute = {
  image: { width: 100, height: 100 },
  points: [
    { x: 1, y: 1 },
    { x: 20, y: 20 },
  ],
  startPosition: { x: 1, y: 1 },
  targetPosition: { x: 20, y: 20 },
};

function makeRouteMapView() {
  const pinLayer = document.createElement("div");
  const area = { id: "east", prefixes: ["東"], labels: ["A"] };
  const view = Object.create(DomRouteMapView.prototype) as DomRouteMapView;
  view.els = { pinLayer, navigationMapImage: document.createElement("img") };
  view.uiManager = {
    dataManager: {
      getUnvisited: () => [],
      wantToBuy: [],
      holdList: [],
      purchasedList: [],
    },
  };
  view.mapAreaCatalog = { getAllMapAreas: () => [area] };
  view.pointIndexCache = new Map([["east", null]]);
  view.renderToken = 0;
  view.updateMap = () => area;
  view.applyViewportLayout = () => {};
  view.updatePinLayerBox = () => {};
  view.applyPinSize = () => {};
  view.maybeFitRoutes = () => {};
  const overlays: string[] = [];
  view.renderRouteOverlay = (_route, kind) => overlays.push(kind);
  return { overlays, view };
}

describe("route overlay candidate contract", () => {
  it.each(["ready", "comparing"])(
    "keeps the current route and renders a candidate route in %s",
    (selectionState) => {
      const { overlays, view } = makeRouteMapView();
      view.renderNavigation({
        currentTarget: { space: "東A01" },
        selectedTarget: { space: "東A02" },
        currentRoute: candidateRoute,
        selectedRoute: candidateRoute,
        selectionState,
      });
      expect(overlays).toEqual(["current", "candidate"]);
    },
  );

  it.each(["idle", "loading", "error"])(
    "does not render a candidate route in %s",
    (selectionState) => {
      const { overlays, view } = makeRouteMapView();
      view.renderNavigation({
        currentTarget: { space: "東A01" },
        selectedTarget: { space: "東A02" },
        currentRoute: candidateRoute,
        selectedRoute: candidateRoute,
        selectionState,
      });
      expect(overlays).toEqual(["current"]);
    },
  );
});
