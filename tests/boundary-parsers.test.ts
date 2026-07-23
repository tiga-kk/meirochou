import assert from "node:assert/strict";
import { test } from "vitest";
import { Config } from "../apps/webapp/js/config";
import {
  BoundaryValidationError,
  parseGasCircleResponse,
  parseGasSheetListResponse,
  parseGridMeta,
  parseMapBundleManifest,
  parsePointsPayload,
} from "../apps/webapp/js/types/boundary-parsers";

const validMapManifest = {
  schemaVersion: 1,
  eventId: "demo-v1",
  displayName: "ComiPath Demo",
  areas: [
    {
      id: "demo-east",
      mapId: "demo-east",
      name: "デモ東",
      prefixes: ["東"],
      labels: ["A", "B"],
      mapFile: "./demo-east/source.png",
      pointsFile: "./demo-east/points.json",
      gridMetaFile: "./demo-east/grid-meta.json",
      gridFile: "./demo-east/grid.bin",
    },
  ],
};

test("map manifest parser resolves asset paths relative to the manifest", () => {
  const manifest = parseMapBundleManifest(
    validMapManifest,
    "https://example.test/assets/maps/manifest.json",
  );

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(
    manifest.areas[0].mapFile,
    "https://example.test/assets/maps/demo-east/source.png",
  );
  assert.equal(
    manifest.areas[0].pointsFile,
    "https://example.test/assets/maps/demo-east/points.json",
  );
});

test("map manifest parser rejects duplicate area and map identifiers", () => {
  const duplicate = {
    ...validMapManifest,
    areas: [
      validMapManifest.areas[0],
      { ...validMapManifest.areas[0], name: "重複" },
    ],
  };

  assert.throws(
    () =>
      parseMapBundleManifest(
        duplicate,
        "https://example.test/assets/maps/manifest.json",
      ),
    /map manifest\.areas\[1\]\.id/,
  );
});

test("map manifest parser rejects paths outside its bundle", () => {
  for (const mapFile of [
    "https://evil.test/map.png",
    "../private/source.png",
    "/map.png",
  ]) {
    assert.throws(
      () =>
        parseMapBundleManifest(
          {
            ...validMapManifest,
            areas: [{ ...validMapManifest.areas[0], mapFile }],
          },
          "https://example.test/assets/maps/manifest.json",
        ),
      /map manifest\.areas\[0\]\.mapFile/,
      mapFile,
    );
  }
});

test("map manifest parser rejects empty and duplicate area labels", () => {
  for (const labels of [
    ["A", ""],
    ["A", "A"],
  ]) {
    assert.throws(
      () =>
        parseMapBundleManifest(
          {
            ...validMapManifest,
            areas: [{ ...validMapManifest.areas[0], labels }],
          },
          "https://example.test/assets/maps/manifest.json",
        ),
      /map manifest\.areas\[0\]\.labels/,
    );
  }
});

test("map areas are initialized exactly once from a validated manifest", () => {
  assert.deepEqual(Config.AREAS, []);
  const manifest = parseMapBundleManifest(
    validMapManifest,
    "https://example.test/assets/maps/manifest.json",
  );

  Config.initializeAreas(manifest.areas);

  assert.equal(Config.AREAS[0].id, "demo-east");
  assert.equal(Object.isFrozen(Config.AREAS), true);
  assert.equal(Object.isFrozen(Config.AREAS[0]), true);
  assert.equal(Object.isFrozen(Config.AREAS[0].labels), true);
  assert.throws(
    () => Config.initializeAreas(manifest.areas),
    /already initialized/,
  );
});

test("GAS sheet-list response parser accepts the documented contract", () => {
  assert.deepEqual(
    parseGasSheetListResponse({
      ok: true,
      status: "success",
      sheets: ["東456", "西12"],
      spreadsheetTitle: "C108",
    }),
    { sheets: ["東456", "西12"], spreadsheetTitle: "C108" },
  );
});

test("GAS response parsers reject missing success envelope fields", () => {
  assert.throws(
    () =>
      parseGasSheetListResponse({
        sheets: ["東456"],
        spreadsheetTitle: "C108",
      }),
    /GAS sheet-list response\.ok/,
  );
  assert.throws(
    () =>
      parseGasCircleResponse({
        ok: true,
        circles: [{ space: "東A01a" }],
        spreadsheetTitle: "C108",
      }),
    /GAS circle response\.status/,
  );
  assert.throws(
    () =>
      parseGasSheetListResponse({
        ok: true,
        status: "success",
        sheets: ["東456"],
      }),
    /GAS sheet-list response\.spreadsheetTitle/,
  );
});

test("GAS circle response parser rejects an invalid circle with its field path", () => {
  assert.throws(
    () =>
      parseGasCircleResponse({
        ok: true,
        status: "success",
        circles: [{ priority: 10 }],
      }),
    (error) =>
      error instanceof BoundaryValidationError &&
      error.message.includes("GAS circle response.circles[0].space"),
  );
});

test("GAS circle response parser rejects the legacy wantToBuy alias", () => {
  assert.throws(
    () =>
      parseGasCircleResponse({
        ok: true,
        status: "success",
        wantToBuy: [{ space: "東A01a" }],
        spreadsheetTitle: "C108",
      }),
    /GAS circle response\.circles/,
  );
});

test("points parser preserves every duplicate OCR candidate", () => {
  const payload = parsePointsPayload({
    image: { width: 100, height: 50 },
    grid: { cell_size: 10, cols: 10, rows: 5 },
    points: [
      {
        identifier: "A",
        number: "1",
        center_x: 10,
        center_y: 10,
        portals: [{ col: 1, row: 1, x: 15, y: 15 }],
      },
      {
        identifier: "A",
        number: "1",
        center_x: 20,
        center_y: 20,
        portals: [{ col: 2, row: 2, x: 25, y: 25 }],
      },
    ],
  });

  assert.equal(payload.points.length, 2);
});

test("points and grid parsers reject invalid coordinate dimensions", () => {
  assert.throws(
    () => parsePointsPayload({ image: { width: 0, height: 50 }, points: [] }),
    /points payload\.image\.width/,
  );
  assert.throws(
    () =>
      parseGridMeta({
        width: 100,
        height: 50,
        cell_size: 0,
        cols: 10,
        rows: 5,
      }),
    /grid metadata\.cell_size/,
  );
});

test("points parser accepts OCR coordinates on the image origin", () => {
  const payload = parsePointsPayload({
    image: { width: 100, height: 50 },
    points: [
      {
        identifier: "A",
        number: 1,
        center_x: 0,
        center_y: 0,
        portals: [{ col: 0, row: 0, x: 0, y: 0 }],
      },
    ],
  });

  assert.deepEqual(payload.points[0].portals[0], {
    col: 0,
    row: 0,
    x: 0,
    y: 0,
  });
});

test("points parser skips OCR entries whose identifier is unresolved", () => {
  const payload = parsePointsPayload({
    image: { width: 100, height: 50 },
    points: [
      {
        identifier: null,
        number: 1,
        center_x: 0,
        center_y: 0,
        portals: [],
      },
      {
        identifier: "A",
        number: 2,
        center_x: 10,
        center_y: 10,
        portals: [],
      },
    ],
  });

  assert.equal(payload.points.length, 1);
  assert.equal(payload.points[0].identifier, "A");
});

/*
test("every distributed map points payload passes boundary validation", () => {
  const expectedCounts = { e456: 2839, e7: 966, w12: 1500, s12: 900 };
  Object.entries(expectedCounts).forEach(([area, expectedCount]) => {
    const source = readFileSync(
      new URL(`../apps/webapp/assets/maps/${area}/points.json`, import.meta.url),
      "utf8",
    );
    const payload = parsePointsPayload(JSON.parse(source));
    assert.equal(payload.points.length, expectedCount, area);
  });
});
*/
