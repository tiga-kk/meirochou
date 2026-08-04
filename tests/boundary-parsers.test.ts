import assert from "node:assert/strict";
import { test } from "vitest";
import {
  BoundaryValidationError,
  parseEventMapBundleManifest,
  parseGasCircleResponse,
  parseGasSheetListResponse,
  parseGridMeta,
  parseMapBundleManifest,
  parsePointsPayload,
} from "../apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers";
import { runtimeMapAreaCatalog } from "../apps/webapp/js/features/route-guidance/infrastructure/runtime-map-area-catalog";

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
  assert.deepEqual(runtimeMapAreaCatalog.getAllMapAreas(), []);
  const manifest = parseMapBundleManifest(
    validMapManifest,
    "https://example.test/assets/maps/manifest.json",
  );

  runtimeMapAreaCatalog.initializeMapAreas(manifest.areas);

  assert.equal(runtimeMapAreaCatalog.getAllMapAreas()[0].id, "demo-east");
  assert.equal(Object.isFrozen(runtimeMapAreaCatalog.getAllMapAreas()), true);
  assert.equal(
    Object.isFrozen(runtimeMapAreaCatalog.getAllMapAreas()[0]),
    true,
  );
  assert.equal(
    Object.isFrozen(runtimeMapAreaCatalog.getAllMapAreas()[0].labels),
    true,
  );
  assert.throws(
    () => runtimeMapAreaCatalog.initializeMapAreas(manifest.areas),
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

const validC108Manifest = {
  schemaVersion: 1,
  eventId: "C108",
  bundleVersion: "fixture-v1",
  areas: [
    {
      areaId: "area-a",
      displayName: "Area A",
      assets: {
        svg: "./area-a/map.svg",
        points: "./area-a/points.json",
        gridMeta: "./area-a/grid-meta.json",
        grid: "./area-a/grid.bin",
      },
    },
    {
      areaId: "area-b",
      displayName: "Area B",
      assets: {
        svg: "./area-b/map.svg",
        points: "./area-b/points.json",
        gridMeta: "./area-b/grid-meta.json",
        grid: "./area-b/grid.bin",
      },
    },
    {
      areaId: "area-c",
      displayName: "Area C",
      assets: {
        svg: "./area-c/map.svg",
        points: "./area-c/points.json",
        gridMeta: "./area-c/grid-meta.json",
        grid: "./area-c/grid.bin",
      },
    },
    {
      areaId: "area-d",
      displayName: "Area D",
      assets: {
        svg: "./area-d/map.svg",
        points: "./area-d/points.json",
        gridMeta: "./area-d/grid-meta.json",
        grid: "./area-d/grid.bin",
      },
    },
  ],
};

test("parseEventMapBundleManifest accepts valid 4-area C108 manifest", () => {
  const manifest = parseEventMapBundleManifest(validC108Manifest);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.eventId, "C108");
  assert.equal(manifest.bundleVersion, "fixture-v1");
  assert.equal(manifest.areas.length, 4);
  assert.equal(manifest.areas[0].areaId, "area-a");
  assert.equal(manifest.areas[0].assets.svg, "./area-a/map.svg");
});

test("parseEventMapBundleManifest rejects unsafe asset paths", () => {
  const unsafePaths = [
    "/absolute/map.svg",
    "../map.svg",
    "./area-a/../map.svg",
    "https://example.invalid/map.svg",
    "data:image/svg+xml,...",
    "./area-a/map.svg?x=1",
    "./area-a/map.svg#fragment",
    ".\\area-a\\map.svg",
    "area-a/map.svg",
    "./area-a/map.svg ",
    "./area-b/map.svg",
  ];

  for (const unsafePath of unsafePaths) {
    const invalidManifest = {
      ...validC108Manifest,
      areas: [
        {
          ...validC108Manifest.areas[0],
          assets: {
            ...validC108Manifest.areas[0].assets,
            svg: unsafePath,
          },
        },
        ...validC108Manifest.areas.slice(1),
      ],
    };
    assert.throws(
      () => parseEventMapBundleManifest(invalidManifest),
      BoundaryValidationError,
      `Should reject unsafe path: ${unsafePath}`,
    );
  }
});

test("parseEventMapBundleManifest rejects invalid manifest structure", () => {
  const cases: [string, unknown][] = [
    ["schemaVersion is not 1", { ...validC108Manifest, schemaVersion: 2 }],
    ["eventId is empty", { ...validC108Manifest, eventId: "" }],
    ["bundleVersion is empty", { ...validC108Manifest, bundleVersion: "" }],
    [
      "areas count is 3",
      { ...validC108Manifest, areas: validC108Manifest.areas.slice(0, 3) },
    ],
    [
      "areas count is 5",
      {
        ...validC108Manifest,
        areas: [...validC108Manifest.areas, validC108Manifest.areas[0]],
      },
    ],
    [
      "duplicate areaId",
      {
        ...validC108Manifest,
        areas: [
          validC108Manifest.areas[0],
          validC108Manifest.areas[0],
          validC108Manifest.areas[2],
          validC108Manifest.areas[3],
        ],
      },
    ],
    [
      "displayName is empty",
      {
        ...validC108Manifest,
        areas: [
          { ...validC108Manifest.areas[0], displayName: "" },
          ...validC108Manifest.areas.slice(1),
        ],
      },
    ],
    [
      "areaId has surrounding whitespace",
      {
        ...validC108Manifest,
        areas: [
          { ...validC108Manifest.areas[0], areaId: " area-a " },
          ...validC108Manifest.areas.slice(1),
        ],
      },
    ],
    [
      "missing asset field",
      {
        ...validC108Manifest,
        areas: [
          {
            ...validC108Manifest.areas[0],
            assets: { svg: "./area-a/map.svg", points: "./area-a/points.json" },
          },
          ...validC108Manifest.areas.slice(1),
        ],
      },
    ],
    [
      "invalid extension",
      {
        ...validC108Manifest,
        areas: [
          {
            ...validC108Manifest.areas[0],
            assets: {
              ...validC108Manifest.areas[0].assets,
              svg: "./area-a/map.png",
            },
          },
          ...validC108Manifest.areas.slice(1),
        ],
      },
    ],
  ];

  for (const [description, invalidInput] of cases) {
    assert.throws(
      () => parseEventMapBundleManifest(invalidInput),
      BoundaryValidationError,
      `Should fail when ${description}`,
    );
  }
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
