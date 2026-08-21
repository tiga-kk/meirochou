import assert from "node:assert/strict";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const legacyAreaIds = ["e456", "e7", "s12", "w12"];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".svg"]);
const localAbsolutePathPatterns = [
  /\/Users\//,
  /\/home\//,
  /\/tmp\//,
  /\/var\//,
  /\b[A-Za-z]:[\\/]/,
];
const cloudflareCredentialNames = [
  "CLOUDFLARE_API_TOKEN",
  "CF_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CF_ACCOUNT_ID",
  "CLOUDFLARE_ZONE_ID",
];
const cloudflareCredentialAssignmentPattern = new RegExp(
  `(?:${cloudflareCredentialNames.join("|")})["']?\\s*(?:=|:)\\s*(?:"[^"]+"|'[^']+'|[^\\s,;'"{}\\[\\]]+)`,
  "i",
);

function listTreeEntries(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) return [{ path, stats }];
    if (stats.isDirectory()) {
      return [{ path, stats }, ...listTreeEntries(path)];
    }
    return [{ path, stats }];
  });
}

function assertInside(parent, candidate, label) {
  const relativePath = relative(parent, candidate);
  assert.ok(
    relativePath === "" ||
      (!isAbsolute(relativePath) &&
        relativePath !== ".." &&
        !relativePath.startsWith(`..${sep}`)),
    `${label} resolves outside the event bundle`,
  );
}

function assertSafeBundleId(eventId, label) {
  assert.equal(
    typeof eventId,
    "string",
    `${label} must be a string bundle path segment`,
  );
  assert.notEqual(eventId, "", `${label} must not be empty`);
  assert.notEqual(eventId, ".", `${label} must not be a dot path`);
  assert.notEqual(eventId, "..", `${label} must not be a dot path`);
  assert.equal(
    eventId.includes("/") || eventId.includes("\\") || eventId.includes("\0"),
    false,
    `${label} must be a safe bundle path segment`,
  );
}

function resolveBundleAsset(bundleRoot, reference, label) {
  assert.ok(
    typeof reference === "string" && reference.length > 0,
    `${label} must be a non-empty string`,
  );
  assert.ok(reference.startsWith("./"), `${label} must start with ./`);
  assert.ok(
    !reference.split(/[\\/]/).includes(".."),
    `${label} must not contain ..`,
  );

  const candidate = resolve(bundleRoot, reference);
  assertInside(bundleRoot, candidate, label);
  return candidate;
}

function assertNoSymbolicLinks(outputRoot) {
  for (const entry of listTreeEntries(outputRoot)) {
    assert.equal(
      entry.stats.isSymbolicLink(),
      false,
      `built artifact contains symbolic link: ${relative(outputRoot, entry.path)}`,
    );
  }
}

function assertNoForbiddenBuiltText(outputRoot) {
  for (const entry of listTreeEntries(outputRoot)) {
    if (!entry.stats.isFile()) continue;
    if (!textExtensions.has(extname(entry.path).toLowerCase())) continue;

    const content = readFileSync(entry.path, "utf8");
    const outputPath = relative(outputRoot, entry.path);

    for (const pattern of localAbsolutePathPatterns) {
      assert.doesNotMatch(
        content,
        pattern,
        `built text contains local absolute path: ${outputPath}`,
      );
    }

    assert.doesNotMatch(
      content,
      /COMIPATH_PRIVATE_MAP_BUNDLE_DIR/,
      `built text contains private map environment value: ${outputPath}`,
    );
    assert.doesNotMatch(
      content,
      cloudflareCredentialAssignmentPattern,
      `built text contains Cloudflare credential assignment: ${outputPath}`,
    );
  }
}

function assertNoForbiddenBuiltPaths(outputRoot) {
  for (const entry of listTreeEntries(outputRoot)) {
    const outputPath = relative(outputRoot, entry.path).replace(/\\/g, "/");
    const segments = outputPath.split("/");
    assert.equal(
      segments.some((segment) =>
        ["private", "work", "output", "__pycache__"].includes(segment),
      ),
      false,
      `built artifact contains a private path segment: ${outputPath}`,
    );
    assert.doesNotMatch(
      outputPath,
      /\.(?:py|pyc)$/i,
      `built artifact contains a Python file: ${outputPath}`,
    );
  }
}

function assertRelativeIndexAssets(indexHtml) {
  const attributePattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of indexHtml.matchAll(attributePattern)) {
    const value = match[1];
    assert.ok(
      !value.startsWith("/") || value.startsWith("//"),
      `built index contains root-relative local asset: ${value}`,
    );
  }
}

export function verifyWebappBuild({
  repositoryRoot = defaultRepositoryRoot,
} = {}) {
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const webappRoot = resolve(resolvedRepositoryRoot, "apps/webapp");
  const outputRoot = resolve(resolvedRepositoryRoot, "dist/webapp");
  const outputMapsDir = resolve(outputRoot, "assets/maps");
  const outputRegistryFile = resolve(outputRoot, "assets/events/manifest.json");
  const outputIndexFile = resolve(outputRoot, "index.html");
  const outputServiceWorkerFile = resolve(
    outputRoot,
    "catalog-service-worker.js",
  );
  const gasCodeSourceFile = resolve(
    resolvedRepositoryRoot,
    "integrations/gas-spreadsheet/Code.gs",
  );
  const gasCodeOutputFile = resolve(
    outputRoot,
    "assets/integrations/gas-spreadsheet/Code.gs.txt",
  );
  const registrySourcePath = resolve(webappRoot, "events/manifest.json");
  const sourceBundlesRoot = resolve(webappRoot, "map-bundles");

  assert.ok(existsSync(outputIndexFile), "built index.html is missing");
  assert.ok(
    existsSync(outputServiceWorkerFile),
    "built catalog-service-worker.js is missing",
  );
  assert.ok(
    existsSync(registrySourcePath),
    "source event registry manifest.json is missing",
  );
  assert.ok(
    existsSync(outputRegistryFile),
    "built event registry manifest.json is missing",
  );
  assert.ok(
    existsSync(sourceBundlesRoot),
    "source map-bundles directory is missing",
  );
  assert.ok(existsSync(gasCodeSourceFile), "source Code.gs is missing");
  assert.ok(existsSync(gasCodeOutputFile), "built Code.gs artifact is missing");
  assert.deepEqual(
    readFileSync(gasCodeOutputFile),
    readFileSync(gasCodeSourceFile),
    "built Code.gs artifact differs from source",
  );

  const sourceRegistry = JSON.parse(readFileSync(registrySourcePath, "utf8"));
  const outputRegistry = JSON.parse(readFileSync(outputRegistryFile, "utf8"));
  assert.deepEqual(
    outputRegistry,
    sourceRegistry,
    "built event registry content differs from source",
  );
  assert.equal(sourceRegistry.schemaVersion, 1, "invalid schema version");
  assert.ok(Array.isArray(sourceRegistry.events), "invalid events registry");

  const registeredEventIds = new Set();
  for (const event of sourceRegistry.events) {
    const { eventId, mapBundle } = event;
    assert.ok(eventId && typeof eventId === "string", "invalid eventId");
    assert.equal(
      registeredEventIds.has(eventId),
      false,
      `duplicate eventId in event registry: ${eventId}`,
    );
    registeredEventIds.add(eventId);
    assert.ok(mapBundle && typeof mapBundle === "string", "invalid mapBundle");
    assert.ok(
      mapBundle.startsWith("../maps/"),
      "mapBundle must start with ../maps/",
    );

    const remaining = mapBundle.slice("../maps/".length);
    const sourceManifestPath = resolve(sourceBundlesRoot, remaining);
    const outputManifestPath = resolve(outputMapsDir, remaining);

    assertInside(
      sourceBundlesRoot,
      sourceManifestPath,
      `source map manifest ${eventId}`,
    );
    assertInside(
      outputMapsDir,
      outputManifestPath,
      `built map manifest ${eventId}`,
    );
    assert.ok(
      existsSync(sourceManifestPath),
      `source map manifest for event ${eventId} is missing`,
    );
    const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, "utf8"));
    assert.equal(
      sourceManifest.eventId,
      eventId,
      `registry eventId does not match source map manifest: ${eventId}`,
    );
    assert.ok(
      existsSync(outputManifestPath),
      `built map manifest for event ${eventId} is missing`,
    );
  }

  // Scan all source bundle directories in apps/webapp/map-bundles
  const sourceBundleEntries = readdirSync(sourceBundlesRoot, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const sourceBundleMap = new Map();
  for (const dirName of sourceBundleEntries) {
    const sourceManifestPath = resolve(
      sourceBundlesRoot,
      dirName,
      "manifest.json",
    );
    assert.ok(
      existsSync(sourceManifestPath),
      `map bundle manifest.json missing in source bundle ${dirName}`,
    );
    const mapManifest = JSON.parse(readFileSync(sourceManifestPath, "utf8"));
    const eventId = mapManifest.eventId;
    assertSafeBundleId(eventId, `invalid eventId in bundle ${dirName}`);
    assert.equal(
      dirName,
      eventId,
      `public bundle directory must match manifest eventId: ${dirName}`,
    );
    assert.equal(
      sourceBundleMap.has(eventId),
      false,
      `duplicate map bundle eventId in source: ${eventId}`,
    );
    sourceBundleMap.set(eventId, {
      dirName,
      sourceAssets: resolve(sourceBundlesRoot, dirName),
      mapManifest,
    });
  }

  let totalVerifiedFiles = 0;

  for (const [
    eventId,
    { sourceAssets, mapManifest },
  ] of sourceBundleMap.entries()) {
    const outputAssets = resolve(outputMapsDir, eventId);
    assert.ok(
      existsSync(outputAssets),
      `built map bundle directory for event ${eventId} is missing`,
    );

    assert.ok(
      Array.isArray(mapManifest.areas),
      `invalid areas in manifest for ${eventId}`,
    );

    for (const area of mapManifest.areas) {
      const assetMap = {
        mapFile: area?.assets?.svg ?? area?.mapFile,
        pointsFile: area?.assets?.points ?? area?.pointsFile,
        gridMetaFile: area?.assets?.gridMeta ?? area?.gridMetaFile,
        gridFile: area?.assets?.grid ?? area?.gridFile,
      };

      for (const [field, assetPath] of Object.entries(assetMap)) {
        const sourceAsset = resolveBundleAsset(
          sourceAssets,
          assetPath,
          `${eventId}/${area?.id ?? area?.areaId ?? "unknown"}.${field}`,
        );
        const relativeAsset = relative(sourceAssets, sourceAsset);
        const outputAsset = resolve(outputAssets, relativeAsset);

        assert.ok(
          existsSync(sourceAsset),
          `referenced source asset is missing: ${eventId}/${relativeAsset}`,
        );
        assert.ok(
          existsSync(outputAsset),
          `referenced built asset is missing: ${eventId}/${relativeAsset}`,
        );
      }
    }

    const sourceFiles = listTreeEntries(sourceAssets)
      .filter((entry) => entry.stats.isFile())
      .map((entry) => relative(sourceAssets, entry.path))
      .sort();
    if (eventId === "C108") {
      const expectedC108Files = [
        "manifest.json",
        ...["e456", "e7", "s12", "w12"].flatMap((areaId) =>
          ["map.svg", "points.json", "grid-meta.json", "grid.bin"].map(
            (fileName) => `${areaId}/${fileName}`,
          ),
        ),
      ].sort();
      assert.deepEqual(
        sourceFiles,
        expectedC108Files,
        "C108 public bundle must contain exactly 17 files",
      );
    }
    const outputFiles = listTreeEntries(outputAssets)
      .filter((entry) => entry.stats.isFile())
      .map((entry) => relative(outputAssets, entry.path))
      .sort();

    assert.deepEqual(
      outputFiles,
      sourceFiles,
      `built asset file list differs from the source for event ${eventId}`,
    );

    sourceFiles.forEach((path) => {
      const sourcePath = resolve(sourceAssets, path);
      const outputPath = resolve(outputAssets, path);
      assert.deepEqual(
        readFileSync(outputPath),
        readFileSync(sourcePath),
        `${eventId}/${path} bytes differ`,
      );
      totalVerifiedFiles++;
    });
  }

  // Explicitly verify C108 bundle structure if present in sourceBundlesRoot
  if (sourceBundleMap.has("C108")) {
    const c108Assets = resolve(outputMapsDir, "C108");
    assert.ok(
      existsSync(resolve(c108Assets, "manifest.json")),
      "built C108 manifest.json missing",
    );
    for (const areaId of ["e456", "e7", "s12", "w12"]) {
      for (const fileName of [
        "map.svg",
        "points.json",
        "grid-meta.json",
        "grid.bin",
      ]) {
        const p = resolve(c108Assets, areaId, fileName);
        assert.ok(
          existsSync(p),
          `built C108 asset missing: ${areaId}/${fileName}`,
        );
      }
    }
  }

  if (existsSync(outputMapsDir)) {
    const outputDirs = readdirSync(outputMapsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    outputDirs.forEach((dirName) => {
      assert.ok(
        sourceBundleMap.has(dirName),
        `unregistered/unknown bundle directory found in build output: ${dirName}`,
      );
    });
  }

  legacyAreaIds.forEach((areaId) => {
    assert.equal(
      existsSync(resolve(outputMapsDir, areaId)),
      false,
      `legacy map area must not be published: ${areaId}`,
    );
  });

  assertNoSymbolicLinks(outputRoot);
  assertNoForbiddenBuiltPaths(outputRoot);
  assertNoForbiddenBuiltText(outputRoot);
  assertRelativeIndexAssets(readFileSync(outputIndexFile, "utf8"));
  const builtText = listTreeEntries(outputRoot)
    .filter(
      (entry) =>
        entry.stats.isFile() &&
        textExtensions.has(extname(entry.path).toLowerCase()),
    )
    .map((entry) => readFileSync(entry.path, "utf8"))
    .join("\n");
  assert.match(
    builtText,
    /\.\/catalog-service-worker\.js/,
    "catalog Service Worker registration must use a relative URL",
  );

  return {
    eventIds: Object.freeze([...sourceBundleMap.keys()]),
    verifiedFiles: totalVerifiedFiles,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = verifyWebappBuild();
  console.log(
    `Verified ${result.verifiedFiles} byte-identical map assets across ${result.eventIds.length} public bundles.`,
  );
}
