import assert from "node:assert/strict";
import {
  afterEach,
  beforeEach,
  test,
} from "vitest";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyWebappBuild } from "../scripts/verify-webapp-build.mjs";

const registry = {
  schemaVersion: 1,
  events: [
    {
      eventId: "demo-v1",
      displayName: "Deployment fixture",
      mapBundle: "../maps/demo-v1/manifest.json",
      days: [{ dayId: "day1", displayName: "Day 1" }],
    },
  ],
};

const mapManifest = {
  schemaVersion: 1,
  eventId: "demo-v1",
  displayName: "Deployment fixture",
  areas: [
    {
      id: "demo-east",
      mapId: "demo-east",
      name: "Demo East",
      labels: ["ア"],
      prefixes: ["東"],
      mapFile: "./demo-east/source.png",
      pointsFile: "./demo-east/points.json",
      gridMetaFile: "./demo-east/grid-meta.json",
      gridFile: "./demo-east/grid.bin",
    },
  ],
};

let fixtureRoot;

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "comipath-deploy-audit-"));
  const sourceEvents = join(root, "apps/webapp/events");
  const sourceBundle = join(root, "apps/webapp/map-bundles/demo-v1");
  const sourceArea = join(sourceBundle, "demo-east");
  const outputRoot = join(root, "dist/webapp");
  const outputEvents = join(outputRoot, "assets/events");
  const outputBundle = join(outputRoot, "assets/maps/demo-v1");
  const outputAssets = join(outputRoot, "assets");

  mkdirSync(sourceEvents, { recursive: true });
  mkdirSync(sourceArea, { recursive: true });
  mkdirSync(outputEvents, { recursive: true });
  mkdirSync(outputAssets, { recursive: true });

  writeJson(join(sourceEvents, "manifest.json"), registry);
  writeJson(join(sourceBundle, "manifest.json"), mapManifest);
  writeFileSync(join(sourceArea, "source.png"), Buffer.from([1, 2, 3]));
  writeJson(join(sourceArea, "points.json"), { points: [] });
  writeJson(join(sourceArea, "grid-meta.json"), {
    width: 1,
    height: 1,
    cell_size: 1,
    cols: 1,
    rows: 1,
  });
  writeFileSync(join(sourceArea, "grid.bin"), Buffer.from([1]));

  writeJson(join(outputEvents, "manifest.json"), registry);
  cpSync(sourceBundle, outputBundle, { recursive: true });
  writeFileSync(
    join(outputRoot, "index.html"),
    '<!doctype html><script type="module" src="./assets/app.js"></script>\n',
  );
  writeFileSync(join(outputAssets, "app.js"), "console.log('fixture');\n");

  return root;
}

function rewriteRegistries(value) {
  writeJson(join(fixtureRoot, "apps/webapp/events/manifest.json"), value);
  writeJson(join(fixtureRoot, "dist/webapp/assets/events/manifest.json"), value);
}

function rewriteMapManifest(value) {
  writeJson(
    join(fixtureRoot, "apps/webapp/map-bundles/demo-v1/manifest.json"),
    value,
  );
  writeJson(
    join(fixtureRoot, "dist/webapp/assets/maps/demo-v1/manifest.json"),
    value,
  );
}

beforeEach(() => {
  fixtureRoot = createFixture();
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

test("accepts a demo-only relative static artifact", () => {
  const result = verifyWebappBuild({ repositoryRoot: fixtureRoot });

  assert.deepEqual(result.eventIds, ["demo-v1"]);
  assert.equal(result.verifiedFiles, 5);
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
    /Phase 5A must publish only demo-v1/,
  );
});

test("rejects a missing referenced event map manifest", () => {
  rewriteRegistries({
    ...registry,
    events: [
      {
        ...registry.events[0],
        mapBundle: "../maps/demo-v1/missing.json",
      },
    ],
  });

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /source map manifest for event demo-v1 is missing/,
  );
});

test("rejects a missing referenced built asset", () => {
  unlinkSync(
    join(
      fixtureRoot,
      "dist/webapp/assets/maps/demo-v1/demo-east/points.json",
    ),
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /referenced built asset is missing|built asset file list differs/,
  );
});

test("rejects an asset reference that escapes the event bundle", () => {
  const invalidManifest = structuredClone(mapManifest);
  invalidManifest.areas[0].mapFile = "../outside.png";
  rewriteMapManifest(invalidManifest);

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /must start with \.\/|must not contain \.\./,
  );
});

test("rejects a symbolic link in the built artifact", () => {
  symlinkSync(
    "manifest.json",
    join(fixtureRoot, "dist/webapp/assets/maps/demo-v1/manifest-link.json"),
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /symbolic link/,
  );
});

test("rejects a local absolute path in built text", () => {
  appendFileSync(
    join(fixtureRoot, "dist/webapp/assets/app.js"),
    "const privatePath = '/Users/example/private-map';\n",
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /local absolute path/,
  );
});

test("rejects a Cloudflare credential assignment in built text", () => {
  appendFileSync(
    join(fixtureRoot, "dist/webapp/assets/app.js"),
    "CLOUDFLARE_API_TOKEN=abcdefghijklmnopqrstuvwxyz123456\n",
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /Cloudflare credential assignment/,
  );
});

test("rejects a colon-style Cloudflare credential assignment in built text", () => {
  appendFileSync(
    join(fixtureRoot, "dist/webapp/assets/app.js"),
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
    '<!doctype html><script src="/assets/app.js"></script>\n',
  );

  assert.throws(
    () => verifyWebappBuild({ repositoryRoot: fixtureRoot }),
    /root-relative local asset/,
  );
});
