// @vitest-environment happy-dom
import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import {
  loadMapBundleManifest,
  renderMapBootstrapError,
} from "../apps/webapp/js/map-manifest-loader";

const manifestPayload = {
  schemaVersion: 1,
  eventId: "demo-v1",
  displayName: "Demo",
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
