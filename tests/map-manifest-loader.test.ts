// @vitest-environment happy-dom
import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import {
  loadEventMapBundleManifestFromUrl,
  loadMapBundleManifest,
  renderMapBootstrapError,
} from "../apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader";

const manifestPayload = {
  schemaVersion: 1,
  eventId: "demo-v1",
  displayName: "Demo",
  bundleVersion: "fixture-v1",
  areas: [
    {
      id: "demo-east",
      mapId: "demo-east",
      name: "デモ東",
      prefixes: ["東"],
      labels: ["ア"],
      mapFile: "./demo-east/source.png",
      pointsFile: "./demo-east/points.json",
      gridMetaFile: "./demo-east/grid-meta.json",
      gridFile: "./demo-east/grid.bin",
    },
  ],
};

afterEach(() => {
  document.body.replaceChildren();
});

test("map loader fetches the stable manifest URL and validates its payload", async () => {
  let requestedUrl = "";
  const manifest = await loadMapBundleManifest({
    baseUrl: "https://example.test/app/",
    fetcher: async (input) => {
      requestedUrl = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => manifestPayload,
      } as Response;
    },
  });

  assert.equal(
    requestedUrl,
    "https://example.test/app/assets/maps/manifest.json",
  );
  assert.equal(
    manifest.areas[0].mapFile,
    "https://example.test/app/assets/maps/demo-east/source.png",
  );
  assert.equal(manifest.bundleVersion, "fixture-v1");
});

test("map manifest accepts legacy payloads without optional bundleVersion", async () => {
  const { bundleVersion: _bundleVersion, ...legacyPayload } = manifestPayload;
  const manifest = await loadMapBundleManifest({
    baseUrl: "https://example.test/app/",
    fetcher: async () =>
      ({
        ok: true,
        status: 200,
        json: async () => legacyPayload,
      }) as Response,
  });

  assert.equal(manifest.bundleVersion, undefined);
});

test("map loader reports HTTP and JSON failures with diagnostic context", async () => {
  await assert.rejects(
    loadMapBundleManifest({
      baseUrl: "https://example.test/",
      fetcher: async () => ({ ok: false, status: 503 }) as Response,
    }),
    /HTTP 503/,
  );
  await assert.rejects(
    loadMapBundleManifest({
      baseUrl: "https://example.test/",
      fetcher: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("bad json");
          },
        }) as Response,
    }),
    /JSON.*bad json/,
  );
});

test("fatal map bootstrap errors replace the app with an accessible diagnostic page", () => {
  document.body.textContent = "old app";

  renderMapBootstrapError(
    document,
    new Error("map manifest.areas[0].id is invalid"),
  );

  const alert = document.querySelector<HTMLElement>(
    "[data-map-bootstrap-error]",
  );
  assert.ok(alert);
  assert.equal(alert.getAttribute("role"), "alert");
  assert.match(alert.textContent || "", /地図設定を読み込めませんでした/);
  assert.match(alert.textContent || "", /map manifest\.areas\[0\]\.id/);
  assert.doesNotMatch(document.body.textContent || "", /old app/);
});

const validC108Payload = {
  schemaVersion: 1,
  eventId: "C108",
  bundleVersion: "fixture-v1",
  areas: [
    {
      areaId: "e456",
      displayName: "東456ホール",
      metersPerPixel: 270 / 4096,
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
      assets: {
        svg: "./w12/map.svg",
        points: "./w12/points.json",
        gridMeta: "./w12/grid-meta.json",
        grid: "./w12/grid.bin",
      },
    },
  ],
};

test("loadEventMapBundleManifestFromUrl fetches manifest and returns validated 4 areas", async () => {
  let fetchCount = 0;
  const manifest = await loadEventMapBundleManifestFromUrl(
    "https://example.test/map-bundles/C108/manifest.json",
    {
      fetcher: async (input) => {
        fetchCount++;
        assert.equal(
          input,
          "https://example.test/map-bundles/C108/manifest.json",
        );
        return {
          ok: true,
          status: 200,
          json: async () => validC108Payload,
        } as Response;
      },
    },
  );

  assert.equal(fetchCount, 1);
  assert.equal(manifest.eventId, "C108");
  assert.equal(manifest.bundleVersion, "fixture-v1");
  assert.equal(manifest.areas.length, 4);
  assert.equal(manifest.areas[0].areaId, "e456");
  assert.equal(manifest.areas[1].areaId, "e7");
  assert.equal(manifest.areas[2].areaId, "s12");
  assert.equal(manifest.areas[3].areaId, "w12");
  assert.deepEqual(
    manifest.areas.map((area) => area.metersPerPixel),
    [270 / 4096, 120 / 1848, 144 / 1872, 180 / 2904],
  );
});

test("C108 manifest rejects a missing or invalid physical scale", async () => {
  for (const metersPerPixel of [undefined, 0, -1, Number.NaN, Infinity]) {
    const payload = structuredClone(validC108Payload);
    if (metersPerPixel === undefined) {
      delete payload.areas[0].metersPerPixel;
    } else {
      payload.areas[0].metersPerPixel = metersPerPixel;
    }
    await assert.rejects(
      loadEventMapBundleManifestFromUrl(
        "https://example.test/map-bundles/C108/manifest.json",
        {
          fetcher: async () =>
            ({ ok: true, status: 200, json: async () => payload }) as Response,
        },
      ),
      /map bundle manifest\.areas\[0\]\.metersPerPixel/,
    );
  }
});

test("loadEventMapBundleManifestFromUrl does not fetch sub-assets on manifest parse failure", async () => {
  const fetchedUrls: string[] = [];
  await assert.rejects(
    loadEventMapBundleManifestFromUrl(
      "https://example.test/map-bundles/C108/manifest.json",
      {
        fetcher: async (input) => {
          fetchedUrls.push(String(input));
          return {
            ok: true,
            status: 200,
            json: async () => ({ ...validC108Payload, areas: [] }),
          } as Response;
        },
      },
    ),
    /BoundaryValidationError|manifest.areas/,
  );

  assert.deepEqual(fetchedUrls, [
    "https://example.test/map-bundles/C108/manifest.json",
  ]);
});
