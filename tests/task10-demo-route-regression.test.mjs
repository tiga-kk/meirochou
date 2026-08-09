import { readFileSync } from "node:fs";
import { test, expect } from "vitest";
import { parseGridMeta, parsePointsPayload } from "../apps/webapp/js/features/route-guidance/infrastructure/route-asset-parsers.ts";
import { planRoute } from "../apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts";
import { InMemoryMapAreaCatalog } from "../apps/webapp/js/features/route-guidance/infrastructure/in-memory-map-area-catalog.ts";
import { buildOptimizationProblem } from "../apps/webapp/js/features/route-guidance/use-cases/build-route-optimization-problem.ts";

test("manifest prefixes and labels resolve circle spaces without an explicit list", () => {
  const catalog = new InMemoryMapAreaCatalog([
    { areaId: "demo-east", prefixes: ["東"], labels: ["ア"] },
  ]);
  expect(catalog.findMapAreaForCircleSpace("東ア31b")?.areaId).toBe(
    "demo-east",
  );
});

test("demo map can build the route origin required by candidate selection", () => {
  const points = parsePointsPayload(JSON.parse(readFileSync("apps/webapp/map-bundles/demo-v1/demo-east/points.json", "utf8")));
  const gridMeta = parseGridMeta(JSON.parse(readFileSync("apps/webapp/map-bundles/demo-v1/demo-east/grid-meta.json", "utf8")));
  const gridBytes = new Uint8Array(readFileSync("apps/webapp/map-bundles/demo-v1/demo-east/grid.bin"));

  const route = planRoute(points, gridMeta, gridBytes, "東ア10", "東ア23a");
  expect(route).not.toBeNull();
  expect(route?.startPosition).toBeDefined();
  expect(
    planRoute(points, gridMeta, gridBytes, "東ア10", "東ア31b", {
      startPosition: route?.startPosition,
    }),
  ).not.toBeNull();
});

test("demo resume inputs are accepted by the ALNS problem boundary", () => {
  const problem = buildOptimizationProblem({
    areaId: "demo-east",
    startDistanceToCircles: [224, 224],
    pendingCircles: [
      { space: "東ア23a", priority: 10 },
      { space: "東ア31b", priority: 9 },
    ],
    distanceMatrix: [0, 288, 288, 0],
    fixedFirstTarget: "東ア23a",
    searchTimeLimitMs: 10000,
    randomSeed: 0,
    initialSolutions: [["東ア23a", "東ア31b"]],
  });
  expect(problem.nodeIds).toEqual(["東ア23a", "東ア31b"]);
  expect(problem.fixedFirstTarget).toBe("東ア23a");
});
