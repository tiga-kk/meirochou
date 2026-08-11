import assert from "node:assert/strict";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "vitest";
import { verifyWebappBuild } from "../scripts/verify-webapp-build.mjs";

const registry = {
  schemaVersion: 1,
  events: [
    {
      eventId: "C108",
      displayName: "Deployment fixture",
      mapBundle: "../maps/C108/manifest.json",
      days: [{ dayId: "day1", displayName: "Day 1" }],
    },
  ],
};

const mapManifest = {
  schemaVersion: 1,
  eventId: "C108",
  displayName: "Deployment fixture",
  areas: ["e456", "e7", "s12", "w12"].map((areaId) => ({
    areaId,
    displayName: `${areaId} ホール`,
    assets: {
      svg: `./${areaId}/map.svg`,
      points: `./${areaId}/points.json`,
      gridMeta: `./${areaId}/grid-meta.json`,
      grid: `./${areaId}/grid.bin`,
    },
  })),
};

let fixtureRoot;

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "comipath-deploy-audit-"));
  const sourceEvents = join(root, "apps/webapp/events");
  const sourceGas = join(root, "integrations/gas-spreadsheet");
  const sourceBundle = join(root, "apps/webapp/map-bundles/C108");
  const publicBundle = join(root, "apps/webapp/map-bundles/public-v1");
  const publicArea = join(publicBundle, "public-east");
  const outputRoot = join(root, "dist/webapp");
  const outputEvents = join(outputRoot, "assets/events");
  const outputBundle = join(outputRoot, "assets/maps/C108");
  const outputPublicBundle = join(outputRoot, "assets/maps/public-v1");
  const outputAssets = join(outputRoot, "assets");
  const outputGas = join(outputAssets, "integrations/gas-spreadsheet");

  mkdirSync(sourceEvents, { recursive: true });
  mkdirSync(sourceGas, { recursive: true });
  mkdirSync(sourceBundle, { recursive: true });
  mkdirSync(publicArea, { recursive: true });
  mkdirSync(outputEvents, { recursive: true });
  mkdirSync(outputAssets, { recursive: true });
  mkdirSync(outputGas, { recursive: true });

  writeJson(join(sourceEvents, "manifest.json"), registry);
  writeFileSync(join(sourceGas, "Code.gs"), "function doPost() {}\n");
  writeJson(join(sourceBundle, "manifest.json"), mapManifest);

  for (const areaId of ["e456", "e7", "s12", "w12"]) {
    const sourceArea = join(sourceBundle, areaId);
    mkdirSync(sourceArea, { recursive: true });
    writeFileSync(join(sourceArea, "map.svg"), "<svg></svg>");
    writeJson(join(sourceArea, "points.json"), { points: [] });
    writeJson(join(sourceArea, "grid-meta.json"), {
      width: 1,
      height: 1,
      cell_size: 1,
      cols: 1,
      rows: 1,
    });
    writeFileSync(join(sourceArea, "grid.bin"), Buffer.from([1]));
  }

  writeJson(join(publicBundle, "manifest.json"), {
    schemaVersion: 1,
    eventId: "public-v1",
    displayName: "Unregistered public fixture",
    areas: [
      {
        areaId: "public-east",
        displayName: "Public East",
        assets: {
          svg: "./public-east/map.svg",
          points: "./public-east/points.json",
          gridMeta: "./public-east/grid-meta.json",
          grid: "./public-east/grid.bin",
        },
      },
    ],
  });
  writeFileSync(join(publicArea, "map.svg"), "<svg></svg>");
  writeJson(join(publicArea, "points.json"), { points: [] });
  writeJson(join(publicArea, "grid-meta.json"), {
    width: 1,
    height: 1,
    cell_size: 1,
    cols: 1,
    rows: 1,
  });
  writeFileSync(join(publicArea, "grid.bin"), Buffer.from([1]));

  writeJson(join(outputEvents, "manifest.json"), registry);
  cpSync(sourceBundle, outputBundle, { recursive: true });
  cpSync(publicBundle, outputPublicBundle, { recursive: true });
  writeFileSync(
    join(outputRoot, "index.html"),
    '<!doctype html><script type="module" src="./assets/comipath-browser-runtime.js"></script>\n',
  );
  writeFileSync(
    join(outputAssets, "comipath-browser-runtime.js"),
    "navigator.serviceWorker.register('./catalog-service-worker.js');\n",
  );
  writeFileSync(
    join(outputRoot, "catalog-service-worker.js"),
    "self.addEventListener('fetch', () => {});\n",
  );
  writeFileSync(
    join(outputGas, "Code.gs.txt"),
    readFileSync(join(sourceGas, "Code.gs")),
  );

  return root;
}

function rewriteRegistries(value) {
  writeJson(join(fixtureRoot, "apps/webapp/events/manifest.json"), value);
  writeJson(
    join(fixtureRoot, "dist/webapp/assets/events/manifest.json"),
    value,
  );
}

function rewriteMapManifest(value) {
  writeJson(
    join(fixtureRoot, "apps/webapp/map-bundles/C108/manifest.json"),
    value,
  );
  writeJson(
    join(fixtureRoot, "dist/webapp/assets/maps/C108/manifest.json"),
    value,
  );
}

beforeEach(() => {
  fixtureRoot = createFixture();
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

test("accepts registered and unregistered public static artifacts", () => {
  const result = verifyWebappBuild({ repositoryRoot: fixtureRoot });

  assert.deepEqual(result.eventIds, ["C108", "public-v1"]);
  assert.equal(result.verifiedFiles, 22);
});

test("rejects a second published event", () => {
  rewriteRegistries({
    ...registry,
    events: [
      ...registry.events,
      {
        ...registry.events[0],
        eventId: "other-v1",
        displayName: "Other fixture",
      },
    ],
  });

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /Phase 5B event registry must contain only C108/,
  );
});

test("rejects a missing referenced event map manifest", () => {
  rewriteRegistries({
    ...registry,
    events: [
      {
        ...registry.events[0],
        mapBundle: "../maps/C108/missing.json",
      },
    ],
  });

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /source map manifest for event C108 is missing/,
  );
});

test("rejects a missing referenced built asset", () => {
  unlinkSync(
    join(fixtureRoot, "dist/webapp/assets/maps/C108/e456/points.json"),
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /referenced built asset is missing|built asset file list differs/,
  );
});

test("rejects an asset reference that escapes the event bundle", () => {
  const invalidManifest = structuredClone(mapManifest);
  invalidManifest.areas[0].assets.svg = "../outside.png";
  rewriteMapManifest(invalidManifest);

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /must start with \.\/|must not contain \.\./,
  );
});

test("rejects a symbolic link in the built artifact", () => {
  symlinkSync(
    "manifest.json",
    join(fixtureRoot, "dist/webapp/assets/maps/C108/manifest-link.json"),
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /symbolic link/,
  );
});

test("rejects a local absolute path in built text", () => {
  appendFileSync(
    join(fixtureRoot, "dist/webapp/assets/comipath-browser-runtime.js"),
    "const privatePath = '/Users/example/private-map';\n",
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /local absolute path/,
  );
});

test("rejects a Cloudflare credential assignment in built text", () => {
  appendFileSync(
    join(fixtureRoot, "dist/webapp/assets/comipath-browser-runtime.js"),
    "CLOUDFLARE_API_TOKEN=abcdefghijklmnopqrstuvwxyz123456\n",
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /Cloudflare credential assignment/,
  );
});

test("rejects a colon-style Cloudflare credential assignment in built text", () => {
  appendFileSync(
    join(fixtureRoot, "dist/webapp/assets/comipath-browser-runtime.js"),
    '\n{ "CF_ACCOUNT_ID": "0123456789abcdef0123456789abcdef" }\n',
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /Cloudflare credential assignment/,
  );
});

test("rejects root-relative local assets in built index.html", () => {
  writeFileSync(
    join(fixtureRoot, "dist/webapp/index.html"),
    '<!doctype html><script src="/assets/comipath-browser-runtime.js"></script>\n',
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /root-relative local asset/,
  );
});
