import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const webappRoot = resolve(repositoryRoot, "apps/webapp");
const outputMapsDir = resolve(repositoryRoot, "dist/webapp/assets/maps");
const outputRegistryFile = resolve(
  repositoryRoot,
  "dist/webapp/assets/events/manifest.json",
);
const legacyAreaIds = ["e456", "e7", "s12", "w12"];

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

assert.ok(
  existsSync(resolve(repositoryRoot, "dist/webapp/index.html")),
  "built index.html is missing",
);

const registrySourcePath = resolve(webappRoot, "events/manifest.json");
assert.ok(
  existsSync(registrySourcePath),
  "source event registry manifest.json is missing",
);

assert.ok(
  existsSync(outputRegistryFile),
  "built event registry manifest.json is missing",
);

assert.deepEqual(
  JSON.parse(readFileSync(outputRegistryFile, "utf8")),
  JSON.parse(readFileSync(registrySourcePath, "utf8")),
  "built event registry content differs from source",
);

const registry = JSON.parse(readFileSync(registrySourcePath, "utf8"));
assert.equal(registry.schemaVersion, 1, "invalid schema version");

const registeredEventIds = new Set();
let totalVerifiedFiles = 0;

for (const event of registry.events) {
  const { eventId, mapBundle } = event;
  assert.ok(eventId && typeof eventId === "string", "invalid eventId");
  assert.ok(mapBundle && typeof mapBundle === "string", "invalid mapBundle");
  assert.ok(
    mapBundle.startsWith("../maps/"),
    "mapBundle must start with ../maps/",
  );

  registeredEventIds.add(eventId);

  const remaining = mapBundle.slice("../maps/".length);
  const sourceAssets = resolve(webappRoot, "map-bundles", dirname(remaining));
  const outputAssets = resolve(outputMapsDir, eventId);

  assert.ok(
    existsSync(outputAssets),
    `built maps assets directory for event ${eventId} is missing`,
  );

  const sourceFiles = listFiles(sourceAssets)
    .map((path) => relative(sourceAssets, path))
    .sort();
  const outputFiles = listFiles(outputAssets)
    .map((path) => relative(outputAssets, path))
    .sort();

  assert.deepEqual(
    outputFiles,
    sourceFiles,
    `built asset file list differs from the source for event ${eventId}`,
  );

  sourceFiles.forEach((path) => {
    const sourcePath = resolve(sourceAssets, path);
    const outputPath = resolve(outputAssets, path);
    assert.equal(
      statSync(outputPath).size,
      statSync(sourcePath).size,
      `${eventId}/${path} size differs`,
    );
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

console.log(
  `Verified ${totalVerifiedFiles} byte-identical map assets across ${registeredEventIds.size} registered events.`,
);
