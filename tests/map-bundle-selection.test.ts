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
import { selectMapBundleDirectory } from "../vite.config";

const temporaryDirectories: string[] = [];

function makeBundle(relativePath: string): {
  repositoryRoot: string;
  bundle: string;
} {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "comipath-bundle-test-"));
  temporaryDirectories.push(repositoryRoot);
  const bundle = resolve(repositoryRoot, relativePath);
  mkdirSync(bundle, { recursive: true });
  writeFileSync(resolve(bundle, "manifest.json"), "{}\n", "utf8");
  return { repositoryRoot, bundle };
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

test("normal webapp modes always select the tracked demo bundle", () => {
  const { repositoryRoot, bundle } = makeBundle(
    "apps/webapp/map-bundles/demo-v1",
  );

  assert.equal(
    selectMapBundleDirectory({
      mode: "development",
      repositoryRoot,
      privateBundleDirectory: "/must/not/be/used",
    }),
    bundle,
  );
});

test("private mode requires an explicitly configured bundle", () => {
  const { repositoryRoot } = makeBundle("apps/webapp/map-bundles/demo-v1");

  assert.throws(
    () => selectMapBundleDirectory({ mode: "private", repositoryRoot }),
    /COMIPATH_PRIVATE_MAP_BUNDLE_DIR/,
  );
});

test("private mode accepts an external directory with a manifest", () => {
  const { repositoryRoot } = makeBundle("apps/webapp/map-bundles/demo-v1");
  const privateBundle = makeBundle("private-bundle").bundle;

  assert.equal(
    selectMapBundleDirectory({
      mode: "private",
      repositoryRoot,
      privateBundleDirectory: privateBundle,
    }),
    privateBundle,
  );
});

test("private mode rejects a directory without a manifest", () => {
  const { repositoryRoot } = makeBundle("apps/webapp/map-bundles/demo-v1");
  const emptyDirectory = mkdtempSync(join(tmpdir(), "comipath-empty-bundle-"));
  temporaryDirectories.push(emptyDirectory);

  assert.throws(
    () =>
      selectMapBundleDirectory({
        mode: "private",
        repositoryRoot,
        privateBundleDirectory: emptyDirectory,
      }),
    /manifest\.json/,
  );
});

test("private mode reports a missing bundle directory clearly", () => {
  const { repositoryRoot } = makeBundle("apps/webapp/map-bundles/demo-v1");

  assert.throws(
    () =>
      selectMapBundleDirectory({
        mode: "private",
        repositoryRoot,
        privateBundleDirectory: resolve(
          repositoryRoot,
          "../missing-private-bundle",
        ),
      }),
    /Map bundle directory does not exist/,
  );
});

test("private mode rejects a bundle stored inside the repository", () => {
  const { repositoryRoot, bundle } = makeBundle(
    "apps/webapp/map-bundles/demo-v1",
  );

  assert.throws(
    () =>
      selectMapBundleDirectory({
        mode: "private",
        repositoryRoot,
        privateBundleDirectory: bundle,
      }),
    /outside the repository/,
  );
});

test("map bundles reject symbolic links before serving or copying", () => {
  const { repositoryRoot, bundle } = makeBundle(
    "apps/webapp/map-bundles/demo-v1",
  );
  symlinkSync(resolve(bundle, "manifest.json"), resolve(bundle, "linked.json"));

  assert.throws(
    () => selectMapBundleDirectory({ mode: "production", repositoryRoot }),
    /symbolic links/,
  );
});
