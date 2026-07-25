import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const legacyAreaIds = ["e456", "e7", "s12", "w12"];
const textExtensions = new Set([".css", ".html", ".js", ".json"]);
const localAbsolutePathPatterns = [
  /\/Users\//,
  /\/home\//,
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
  const registrySourcePath = resolve(webappRoot, "events/manifest.json");

  assert.ok(existsSync(outputIndexFile), "built index.html is missing");
  assert.ok(
    existsSync(registrySourcePath),
    "source event registry manifest.json is missing",
  );
  assert.ok(
    existsSync(outputRegistryFile),
    "built event registry manifest.json is missing",
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

  const eventIds = sourceRegistry.events.map((event) => event?.eventId);
  assert.deepEqual(
    eventIds,
    ["demo-v1"],
    "Phase 5A must publish only demo-v1",
  );

  const registeredEventIds = new Set();
  let totalVerifiedFiles = 0;

  for (const event of sourceRegistry.events) {
    const { eventId, mapBundle } = event;
    assert.ok(eventId && typeof eventId === "string", "invalid eventId");
    assert.ok(mapBundle && typeof mapBundle === "string", "invalid mapBundle");
    assert.ok(
      mapBundle.startsWith("../maps/"),
      "mapBundle must start with ../maps/",
    );

    registeredEventIds.add(eventId);

    const remaining = mapBundle.slice("../maps/".length);
    const sourceBundlesRoot = resolve(webappRoot, "map-bundles");
    const sourceManifestPath = resolve(sourceBundlesRoot, remaining);
    const sourceAssets = dirname(sourceManifestPath);
    const outputManifestPath = resolve(dirname(outputRegistryFile), mapBundle);
    const outputAssets = dirname(outputManifestPath);

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
    assert.ok(
      existsSync(outputManifestPath),
      `built map manifest for event ${eventId} is missing`,
    );

    const mapManifest = JSON.parse(readFileSync(sourceManifestPath, "utf8"));
    assert.ok(Array.isArray(mapManifest.areas), "invalid map manifest areas");

    for (const area of mapManifest.areas) {
      for (const field of [
        "mapFile",
        "pointsFile",
        "gridMetaFile",
        "gridFile",
      ]) {
        const sourceAsset = resolveBundleAsset(
          sourceAssets,
          area?.[field],
          `${eventId}/${area?.id ?? "unknown"}.${field}`,
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

  if (existsSync(outputMapsDir)) {
    const outputDirs = readdirSync(outputMapsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    outputDirs.forEach((dirName) => {
      assert.ok(
        registeredEventIds.has(dirName),
        `unregistered bundle directory found in build output: ${dirName}`,
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
  assertNoForbiddenBuiltText(outputRoot);
  assertRelativeIndexAssets(readFileSync(outputIndexFile, "utf8"));

  return {
    eventIds: Object.freeze([...registeredEventIds]),
    verifiedFiles: totalVerifiedFiles,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = verifyWebappBuild();
  console.log(
    `Verified ${result.verifiedFiles} byte-identical map assets across ${result.eventIds.length} registered events.`,
  );
}
