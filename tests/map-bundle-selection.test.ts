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

function makeBundle(
  relativePath: string,
  manifestContent = "{}\n",
): {
  repositoryRoot: string;
  bundle: string;
} {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "comipath-bundle-test-"));
  temporaryDirectories.push(repositoryRoot);
  const bundle = resolve(repositoryRoot, relativePath);
  mkdirSync(bundle, { recursive: true });
  writeFileSync(resolve(bundle, "manifest.json"), manifestContent, "utf8");
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

test("normal webapp modes select map bundles declared in the event registry", () => {
  const { repositoryRoot, bundle } = makeBundle(
    "apps/webapp/map-bundles/demo-v1",
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

  const resolved = selectMapBundles({
    mode: "development",
    repositoryRoot,
    privateBundleDirectory: "/must/not/be/used",
  });

  assert.equal(resolved.size, 1);
  assert.equal(resolved.get("demo-v1"), bundle);
});

test("normal webapp modes reject map bundles outside map-bundles directory", () => {
  const { repositoryRoot } = makeBundle("apps/webapp/map-bundles/demo-v1");
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
    () =>
      selectMapBundles({
        mode: "development",
        repositoryRoot,
      }),
    /mapBundle|outside/i,
  );
});

test("private mode requires an explicitly configured bundle and gets eventId from its manifest", () => {
  const { repositoryRoot } = makeBundle("apps/webapp/map-bundles/demo-v1");
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

test("map bundles reject symbolic links before serving or copying", () => {
  const { repositoryRoot, bundle } = makeBundle(
    "apps/webapp/map-bundles/demo-v1",
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
