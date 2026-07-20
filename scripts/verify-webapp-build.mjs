import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceAssets = resolve(repositoryRoot, "apps/webapp/map-bundles/demo-v1");
const outputAssets = resolve(repositoryRoot, "dist/webapp/assets/maps");
const legacyAreaIds = ["e456", "e7", "s12", "w12"];

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

assert.ok(
  existsSync(resolve(repositoryRoot, "dist/webapp/index.html")),
  "built index.html is missing",
);
assert.ok(existsSync(outputAssets), "built assets directory is missing");
legacyAreaIds.forEach((areaId) => {
  assert.equal(
    existsSync(resolve(outputAssets, areaId)),
    false,
    `legacy map area must not be published by the default build: ${areaId}`,
  );
});

const sourceFiles = listFiles(sourceAssets)
  .map((path) => relative(sourceAssets, path))
  .sort();
const outputFiles = listFiles(outputAssets)
  .map((path) => relative(outputAssets, path))
  .sort();
assert.deepEqual(
  outputFiles,
  sourceFiles,
  "built asset file list differs from the source",
);

sourceFiles.forEach((path) => {
  const sourcePath = resolve(sourceAssets, path);
  const outputPath = resolve(outputAssets, path);
  assert.equal(
    statSync(outputPath).size,
    statSync(sourcePath).size,
    `${path} size differs`,
  );
  assert.deepEqual(
    readFileSync(outputPath),
    readFileSync(sourcePath),
    `${path} bytes differ`,
  );
});

console.log(`Verified ${sourceFiles.length} byte-identical demo map assets.`);
