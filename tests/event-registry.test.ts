import assert from "node:assert/strict";
import { expect, test, vi } from "vitest";
import productionRegistryJson from "../apps/webapp/events/manifest.json";
import { parseEventRegistry } from "../apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers";
import { loadEventRegistry } from "../apps/webapp/js/features/event-day/infrastructure/http-event-registry-loader";
import {
  loadRuntimeMapBundleManifestFromUrl,
  resolveEventMapManifestUrl,
} from "../apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader";

const validRegistry = {
  schemaVersion: 1,
  events: [
    {
      eventId: "demo-v1",
      displayName: "ComiPath Demo",
      mapBundle: "../maps/demo-v1/manifest.json",
      days: [{ dayId: "day1", displayName: "デモ1日目" }],
    },
  ],
};

test("parseEventRegistry accepts a valid registry and freezes the output", () => {
  const result = parseEventRegistry(validRegistry);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.events[0].eventId, "demo-v1");
  assert.equal(result.events[0].days[0].dayId, "day1");

  // Immutability checks
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.events), true);
  assert.equal(Object.isFrozen(result.events[0]), true);
  assert.equal(Object.isFrozen(result.events[0].days), true);
  assert.equal(Object.isFrozen(result.events[0].days[0]), true);
});

test("parseEventRegistry accepts explicit event and legacy map bundle contracts", () => {
  const missing = parseEventRegistry(validRegistry);
  const event = parseEventRegistry({
    ...validRegistry,
    events: [{ ...validRegistry.events[0], mapBundleContract: "event" }],
  });
  const legacy = parseEventRegistry({
    ...validRegistry,
    events: [{ ...validRegistry.events[0], mapBundleContract: "legacy" }],
  });

  assert.equal(missing.events[0].mapBundleContract, undefined);
  assert.equal(event.events[0].mapBundleContract, "event");
  assert.equal(legacy.events[0].mapBundleContract, "legacy");
});

test("parseEventRegistry rejects unknown map bundle contracts", () => {
  for (const mapBundleContract of ["foo", "", 1]) {
    assert.throws(
      () => parseEventRegistry({
        ...validRegistry,
        events: [{ ...validRegistry.events[0], mapBundleContract }],
      }),
      /mapBundleContract/,
    );
  }
});

test("parseEventRegistry rejects invalid schemaVersion", () => {
  assert.throws(
    () => parseEventRegistry({ ...validRegistry, schemaVersion: 2 }),
    /schemaVersion/,
  );
});

test("parseEventRegistry rejects duplicate event IDs", () => {
  const duplicateEvents = {
    schemaVersion: 1,
    events: [
      {
        eventId: "demo-v1",
        displayName: "Demo 1",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [{ dayId: "day1", displayName: "Day 1" }],
      },
      {
        eventId: "demo-v1",
        displayName: "Demo 2",
        mapBundle: "../maps/demo-v2/manifest.json",
        days: [{ dayId: "day1", displayName: "Day 1" }],
      },
    ],
  };

  assert.throws(() => parseEventRegistry(duplicateEvents), /eventId/i);
});

test("parseEventRegistry rejects duplicate day IDs within an event", () => {
  const duplicateDays = {
    schemaVersion: 1,
    events: [
      {
        eventId: "demo-v1",
        displayName: "Demo 1",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [
          { dayId: "day1", displayName: "Day 1" },
          { dayId: "day1", displayName: "Day 1 again" },
        ],
      },
    ],
  };

  assert.throws(() => parseEventRegistry(duplicateDays), /dayId/i);
});

test("parseEventRegistry rejects unsafe mapBundle paths", () => {
  const unsafePaths = [
    "/absolute/path/manifest.json",
    "http://example.com/manifest.json",
    "../maps/demo-v1/../../manifest.json",
    "../../outside/manifest.json",
    "../maps/demo-v1/manifest.json?query=1",
    "../maps/demo-v1/manifest.json#hash",
    "../maps\\demo-v1\\manifest.json",
    "",
  ];

  for (const path of unsafePaths) {
    const registry = {
      schemaVersion: 1,
      events: [
        {
          eventId: "demo-v1",
          displayName: "Demo 1",
          mapBundle: path,
          days: [{ dayId: "day1", displayName: "Day 1" }],
        },
      ],
    };

    assert.throws(
      () => parseEventRegistry(registry),
      /mapBundle/i,
      `Should reject unsafe mapBundle path: ${path}`,
    );
  }
});

test("loadEventRegistry fetches manifest.json and parses it", async () => {
  const mockRegistry = {
    schemaVersion: 1,
    events: [
      {
        eventId: "demo-v1",
        displayName: "ComiPath Demo",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [{ dayId: "day1", displayName: "デモ1日目" }],
      },
    ],
  };

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockRegistry,
  });
  vi.stubGlobal("fetch", fetchMock);

  const result = await loadEventRegistry("http://example.test/");
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.events[0].eventId, "demo-v1");
  assert.equal(
    fetchMock.mock.calls[0][0],
    "http://example.test/assets/events/manifest.json",
  );

  vi.unstubAllGlobals();
});

test("loadEventRegistry throws on fetch error", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    statusText: "Not Found",
  });
  vi.stubGlobal("fetch", fetchMock);

  await assert.rejects(
    () => loadEventRegistry("http://example.test/"),
    /Failed to load event registry/,
  );

  vi.unstubAllGlobals();
});

test("production registry preserves C108 without forbidding additional strict events", () => {
  const registry = parseEventRegistry(productionRegistryJson);
  expect(registry.events.length).toBeGreaterThan(0);

  const c108 = registry.events.find((event) => event.eventId === "C108");
  expect(c108).toBeDefined();
  expect(c108?.days.map((day) => day.dayId)).toEqual(["day1", "day2"]);

  expect(
    registry.events.every((event) => event.mapBundleContract !== "legacy"),
  ).toBe(true);
});

test("production registry excludes demo-v1", () => {
  const registry = parseEventRegistry(productionRegistryJson);
  expect(registry.events.some((event) => event.eventId === "demo-v1")).toBe(
    false,
  );
});

test("day1 and day2 resolve to the same C108 map manifest path", () => {
  const registry = parseEventRegistry(productionRegistryJson);
  const c108Event = registry.events.find((e) => e.eventId === "C108");
  assert.ok(c108Event);

  const registryUrl = "http://example.test/assets/events/manifest.json";
  const manifestUrl1 = resolveEventMapManifestUrl(registryUrl, c108Event);
  const manifestUrl2 = resolveEventMapManifestUrl(registryUrl, c108Event);

  expect(manifestUrl1).toBe(
    "http://example.test/assets/maps/C108/manifest.json",
  );
  expect(manifestUrl2).toBe(
    "http://example.test/assets/maps/C108/manifest.json",
  );
});

test("runtime loader adapts C108 assets to absolute runtime paths", async () => {
  const registry = parseEventRegistry(productionRegistryJson);
  const c108Event = registry.events.find((e) => e.eventId === "C108");
  assert.ok(c108Event);

  const registryUrl = "http://example.test/assets/events/manifest.json";
  const manifestUrl = resolveEventMapManifestUrl(registryUrl, c108Event);

  const mockC108Manifest = {
    schemaVersion: 1,
    eventId: "C108",
    bundleVersion: "fixture-v1",
    areas: [
      {
        areaId: "e456",
        displayName: "東456ホール",
        metersPerPixel: 270 / 4096,
        prefixes: ["東"],
        labels: ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ", "サ", "シ", "ス", "セ", "ソ", "タ", "チ", "ツ", "テ", "ト", "ナ", "ニ", "ヌ", "ネ", "ノ", "ハ", "ヒ", "フ", "ヘ", "ホ", "マ", "ミ", "ム", "メ", "モ", "ヤ", "ユ", "ヨ", "ラ", "リ", "ル", "レ", "ロ", "ワ", "ヲ", "ン"],
        assets: {
          svg: "./e456/map.svg",
          points: "./e456/points.json",
          gridMeta: "./e456/grid-meta.json",
          grid: "./e456/grid.bin",
        },
      },
      {
        areaId: "e7",
        displayName: "東7ホール",
        metersPerPixel: 120 / 1848,
        prefixes: ["東"],
        labels: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
        assets: {
          svg: "./e7/map.svg",
          points: "./e7/points.json",
          gridMeta: "./e7/grid-meta.json",
          grid: "./e7/grid.bin",
        },
      },
      {
        areaId: "s12",
        displayName: "南12ホール",
        metersPerPixel: 144 / 1872,
        prefixes: ["南"],
        labels: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"],
        assets: {
          svg: "./s12/map.svg",
          points: "./s12/points.json",
          gridMeta: "./s12/grid-meta.json",
          grid: "./s12/grid.bin",
        },
      },
      {
        areaId: "w12",
        displayName: "西12ホール",
        metersPerPixel: 180 / 2904,
        prefixes: ["西"],
        labels: ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ", "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と", "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ", "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り", "る", "れ", "ろ", "わ", "を", "ん"],
        assets: {
          svg: "./w12/map.svg",
          points: "./w12/points.json",
          gridMeta: "./w12/grid-meta.json",
          grid: "./w12/grid.bin",
        },
      },
    ],
  };

  const manifest = await loadRuntimeMapBundleManifestFromUrl(
    manifestUrl,
    c108Event,
    {
      fetcher: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockC108Manifest,
      }),
    },
  );

  expect(manifest.eventId).toBe("C108");
  expect(c108Event.mapBundleContract).toBeUndefined();
  expect(manifest.displayName).toBe(c108Event.displayName);
  expect(manifest.areas).toHaveLength(4);
  expect(manifest.areas.map((a) => a.id)).toEqual(["e456", "e7", "s12", "w12"]);
  expect(manifest.areas[0]).toMatchObject({
    mapFile: "http://example.test/assets/maps/C108/e456/map.svg",
    pointsFile: "http://example.test/assets/maps/C108/e456/points.json",
    gridMetaFile: "http://example.test/assets/maps/C108/e456/grid-meta.json",
    gridFile: "http://example.test/assets/maps/C108/e456/grid.bin",
    metersPerPixel: 270 / 4096,
  });
});

test("runtime loader keeps legacy demo fixtures on the legacy contract", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      schemaVersion: 1,
      eventId: "demo-v1",
      displayName: "ComiPath Demo",
      areas: [
        {
          id: "demo-east",
          mapId: "demo-east",
          name: "デモ東",
          prefixes: ["東"],
          labels: ["ア"],
          mapFile: "./map.png",
          pointsFile: "./points.json",
          gridMetaFile: "./grid.json",
          gridFile: "./grid.bin",
        },
      ],
    }),
  });

  const manifest = await loadRuntimeMapBundleManifestFromUrl(
    "http://example.test/assets/maps/demo-v1/manifest.json",
    {
      eventId: "demo-v1",
      displayName: "ComiPath Demo",
      mapBundleContract: "legacy",
    },
    { fetcher },
  );

  expect(manifest.areas[0]).toMatchObject({
    id: "demo-east",
    mapFile: "http://example.test/assets/maps/demo-v1/map.png",
    pointsFile: "http://example.test/assets/maps/demo-v1/points.json",
  });
});

test("runtime loader does not fallback to legacy after an implicit strict parse failure", async () => {
  await assert.rejects(
    loadRuntimeMapBundleManifestFromUrl(
      "http://example.test/assets/maps/demo-v1/manifest.json",
      { eventId: "demo-v1", displayName: "ComiPath Demo" },
      {
        fetcher: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            schemaVersion: 1,
            eventId: "demo-v1",
            displayName: "ComiPath Demo",
            areas: [{
              id: "demo-east",
              mapId: "demo-east",
              name: "デモ東",
              prefixes: ["東"],
              labels: ["ア"],
              mapFile: "./map.png",
              pointsFile: "./points.json",
              gridMetaFile: "./grid.json",
              gridFile: "./grid.bin",
            }],
          }),
        }),
      },
    ),
    /map bundle manifest|BoundaryValidationError/,
  );
});
