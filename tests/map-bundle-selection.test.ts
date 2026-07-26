import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, test } from "vitest";
import { selectMapBundles } from "../vite.config";

const temporaryDirectories: string[] = [];

function createRepo(): string {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "comipath-bundle-test-"));
  temporaryDirectories.push(repositoryRoot);
  return repositoryRoot;
}

function addBundle(
  repositoryRoot: string,
  relativePath: string,
  manifestContent = "{}\n",
): string {
  const bundle = resolve(repositoryRoot, relativePath);
  mkdirSync(bundle, { recursive: true });
  writeFileSync(resolve(bundle, "manifest.json"), manifestContent, "utf8");
  return bundle;
}

function makeBundle(
  relativePath: string,
  manifestContent = "{}\n",
): {
  repositoryRoot: string;
  bundle: string;
} {
  const repositoryRoot = createRepo();
  const bundle = addBundle(repositoryRoot, relativePath, manifestContent);
  return { repositoryRoot, bundle };
}

function writeRegistry(repositoryRoot: string, registry: unknown) {
  const eventsDir = resolve(repositoryRoot, "apps/webapp/events");
  mkdirSync(eventsDir, { recursive: true });
  writeFileSync(
    resolve(eventsDir, "manifest.json"),
    JSON.stringify(registry, null, 2),
    "utf8",
  );
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

test("normal webapp modes select all map bundles in map-bundles directory regardless of registry entries", () => {
  const repositoryRoot = createRepo();
  const demoBundle = addBundle(
    repositoryRoot,
    "apps/webapp/map-bundles/demo-v1",
    JSON.stringify({ eventId: "demo-v1" }),
  );
  const c108Bundle = addBundle(
    repositoryRoot,
    "apps/webapp/map-bundles/C108",
    JSON.stringify({ eventId: "C108" }),
  );

  // Registry only contains demo-v1, C108 is NOT registered
  writeRegistry(repositoryRoot, {
    schemaVersion: 1,
    events: [
      {
        eventId: "demo-v1",
        displayName: "Demo V1",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [],
      },
    ],
  });

  const resolved = selectMapBundles({
    mode: "development",
    repositoryRoot,
    privateBundleDirectory: "/must/not/be/used",
  });

  assert.equal(resolved.size, 2);
  assert.deepEqual([...resolved.keys()], ["demo-v1", "C108"]);
  assert.equal(resolved.get("demo-v1"), demoBundle);
  assert.equal(resolved.get("C108"), c108Bundle);
});

test("normal webapp modes reject registry paths outside map-bundles", () => {
  const { repositoryRoot } = makeBundle(
    "apps/webapp/map-bundles/demo-v1",
    JSON.stringify({ eventId: "demo-v1" }),
  );
  writeRegistry(repositoryRoot, {
    schemaVersion: 1,
    events: [
      {
        eventId: "demo-v1",
        displayName: "Demo V1",
        mapBundle: "../outside/demo-v1/manifest.json",
        days: [],
      },
    ],
  });

  assert.throws(
    () => selectMapBundles({ mode: "development", repositoryRoot }),
    /mapBundle|outside/i,
  );
});

test("normal webapp modes reject symbolic links in map-bundles directory", () => {
  const { repositoryRoot, bundle } = makeBundle(
    "apps/webapp/map-bundles/demo-v1",
    JSON.stringify({ eventId: "demo-v1" }),
  );
  writeRegistry(repositoryRoot, {
    schemaVersion: 1,
    events: [
      {
        eventId: "demo-v1",
        displayName: "Demo V1",
        mapBundle: "../maps/demo-v1/manifest.json",
        days: [],
      },
    ],
  });
  symlinkSync(resolve(bundle, "manifest.json"), resolve(bundle, "linked.json"));

  assert.throws(
    () => selectMapBundles({ mode: "production", repositoryRoot }),
    /symbolic links/,
  );
});

test("normal webapp modes reject a manifest eventId that escapes its bundle directory", () => {
  const repositoryRoot = createRepo();
  addBundle(
    repositoryRoot,
    "apps/webapp/map-bundles/C108",
    JSON.stringify({ eventId: "../private" }),
  );
  writeRegistry(repositoryRoot, { schemaVersion: 1, events: [] });

  assert.throws(
    () => selectMapBundles({ mode: "production", repositoryRoot }),
    /safe bundle path segment|must match manifest eventId/i,
  );
});

test("private mode requires an explicitly configured bundle and gets eventId from its manifest", () => {
  const { repositoryRoot } = makeBundle(
    "apps/webapp/map-bundles/demo-v1",
    JSON.stringify({ eventId: "demo-v1" }),
  );
  const privateBundle = makeBundle(
    "private-bundle",
    JSON.stringify({ eventId: "private-ev" }),
  ).bundle;

  assert.throws(
    () => selectMapBundles({ mode: "private", repositoryRoot }),
    /COMIPATH_PRIVATE_MAP_BUNDLE_DIR/,
  );

  const resolved = selectMapBundles({
    mode: "private",
    repositoryRoot,
    privateBundleDirectory: privateBundle,
  });

  assert.equal(resolved.size, 1);
  assert.equal(resolved.get("private-ev"), privateBundle);
});

test("private mode rejects a manifest eventId that escapes the output directory", () => {
  const { repositoryRoot } = makeBundle("apps/webapp/map-bundles/demo-v1");
  const privateBundle = makeBundle(
    "private-bundle",
    JSON.stringify({ eventId: "../private" }),
  ).bundle;

  assert.throws(
    () =>
      selectMapBundles({
        mode: "private",
        repositoryRoot,
        privateBundleDirectory: privateBundle,
      }),
    /safe bundle path segment/,
  );
});
