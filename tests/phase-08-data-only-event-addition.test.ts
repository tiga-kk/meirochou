import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "vitest";
import productionRegistryJson from "../apps/webapp/events/manifest.json";
import { parseEventRegistry } from "../apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers";
import {
  loadRuntimeMapBundleManifestFromUrl,
  resolveEventMapManifestUrl,
} from "../apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader";
import { HttpRouteMapAssetsLoader } from "../apps/webapp/js/features/route-guidance/infrastructure/http-route-map-assets-loader";
import { runtimeMapAreaCatalog } from "../apps/webapp/js/features/route-guidance/infrastructure/runtime-map-area-catalog";

const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/phase-08-data-only-event/C999",
);

function fixturePath(relativePath: string): string {
  return resolve(fixtureRoot, relativePath);
}

function readFixtureJson(relativePath: string): any {
  return JSON.parse(readFileSync(fixturePath(relativePath), "utf8"));
}

const fixtureUrlToFile = new Map<string, string>([
  [
    "http://fixture.test/assets/maps/C999/manifest.json",
    "map-bundle/manifest.json",
  ],
  [
    "http://fixture.test/assets/maps/C999/east/points.json",
    "map-bundle/east/points.json",
  ],
  [
    "http://fixture.test/assets/maps/C999/east/grid-meta.json",
    "map-bundle/east/grid-meta.json",
  ],
  [
    "http://fixture.test/assets/maps/C999/east/grid.bin",
    "map-bundle/east/grid.bin",
  ],
]);

const fixtureFetch = (async (
  input: string | URL | Request,
  _init?: RequestInit,
): Promise<Response> => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const relativePath = fixtureUrlToFile.get(url);
  if (!relativePath) {
    return new Response("Not Found", { status: 404 });
  }
  const bytes = readFileSync(fixturePath(relativePath));
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": relativePath.endsWith(".bin")
        ? "application/octet-stream"
        : "application/json",
    },
  });
}) as typeof fetch;

afterEach(() => {
  runtimeMapAreaCatalog.replaceMapAreas([]);
});

test("a second strict event is data-only across registry, manifest, and route assets", async () => {
  const fixtureEntry = readFixtureJson("event-registry-entry.json");
  const rawManifest = readFixtureJson("map-bundle/manifest.json");
  const rawPoints = readFixtureJson("map-bundle/east/points.json");
  const rawGridMeta = readFixtureJson("map-bundle/east/grid-meta.json");

  const registry = parseEventRegistry({
    schemaVersion: 1,
    events: [...productionRegistryJson.events, fixtureEntry],
  });
  assert.deepEqual(
    registry.events.map((event) => event.eventId),
    ["C108", "C999"],
  );

  const event = registry.events.find((candidate) => candidate.eventId === "C999");
  assert.ok(event);
  assert.equal(event.mapBundleContract, "event");

  const registryUrl = "http://fixture.test/assets/events/manifest.json";
  const manifestUrl = resolveEventMapManifestUrl(registryUrl, event);
  assert.equal(
    manifestUrl,
    "http://fixture.test/assets/maps/C999/manifest.json",
  );

  const runtimeManifest = await loadRuntimeMapBundleManifestFromUrl(
    manifestUrl,
    event,
    { fetcher: fixtureFetch },
  );
  assert.equal(runtimeManifest.eventId, "C999");
  assert.equal(runtimeManifest.displayName, "Fixture Event C999");
  assert.equal(runtimeManifest.bundleVersion, "fixture-c999-v1");
  assert.equal(runtimeManifest.areas.length, 1);
  assert.deepEqual(runtimeManifest.areas[0].prefixes, ["東"]);
  assert.deepEqual(runtimeManifest.areas[0].labels, ["A", "B"]);
  assert.equal(runtimeManifest.areas[0].metersPerPixel, 0.125);
  assert.equal(
    runtimeManifest.areas[0].mapFile,
    "http://fixture.test/assets/maps/C999/east/map.svg",
  );

  runtimeMapAreaCatalog.replaceMapAreas(
    runtimeManifest.areas as unknown as readonly Record<string, unknown>[],
  );
  const mapArea = runtimeMapAreaCatalog.getMapArea("east");
  assert.ok(mapArea);
  assert.equal(mapArea.areaId, "east");
  assert.deepEqual(mapArea.prefixes, ["東"]);
  assert.deepEqual(mapArea.labels, ["A", "B"]);

  const routeAssets = await new HttpRouteMapAssetsLoader(
    fixtureFetch,
  ).loadMapAssets(mapArea);

  assert.equal(rawManifest.areas[0].areaId, "east");
  assert.equal(rawPoints.map_id, "fixture-map");
  assert.equal(rawGridMeta.map_id, "fixture-map");
  assert.equal(rawPoints.image.path, undefined);
  assert.ok(routeAssets.points.points.length >= 1);
  assert.equal(routeAssets.gridMetadata.width, 48);
  assert.equal(routeAssets.gridMetadata.height, 32);
  assert.equal(routeAssets.gridMetadata.cell_size, 8);
  assert.equal(routeAssets.gridMetadata.cols, 6);
  assert.equal(routeAssets.gridMetadata.rows, 4);
  assert.equal(
    routeAssets.gridBytes.length,
    routeAssets.gridMetadata.cols * routeAssets.gridMetadata.rows,
  );
  assert.equal(routeAssets.gridBytes.length, 24);
  assert.equal(
    [...routeAssets.gridBytes].every((value) => value === 0 || value === 1 || value === 2),
    true,
  );

  const svgPath = fixturePath("map-bundle/east/map.svg");
  assert.equal(existsSync(svgPath), true);
  const svg = readFileSync(svgPath, "utf8");
  assert.match(svg, /viewBox="0 0 48 32"/);
  assert.doesNotMatch(svg, /<image\b/i);
});
