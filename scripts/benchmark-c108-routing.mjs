import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const c108Directory = resolve(repositoryRoot, "apps/webapp/map-bundles/C108");
const benchmarkPort = 4175;
const warmupRuns = 3;
const measuredRuns = 10;

export function calculatePercentile(numbers, percentile) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (upper >= sorted.length) return sorted[sorted.length - 1];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function createBenchmarkStartSpace(area, point) {
  const prefix = String(area?.displayName ?? "").charAt(0);
  const identifier = String(point?.identifier ?? "");
  const number = String(point?.number ?? "");
  if (!prefix || !identifier || !number) {
    throw new Error("C108 benchmark requires a valid area prefix and point");
  }
  return `${prefix}${identifier}${number}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadAreaInputs(area) {
  const areaDirectory = resolve(c108Directory, area.areaId);
  const pointsData = readJson(resolve(areaDirectory, "points.json"));
  const gridMeta = readJson(resolve(areaDirectory, "grid-meta.json"));
  const gridBytes = Uint8Array.from(
    readFileSync(resolve(areaDirectory, "grid.bin")),
  );
  const firstPoint = pointsData.points?.[0];
  const startSpace = createBenchmarkStartSpace(area, firstPoint);
  if (!firstPoint) {
    throw new Error(`C108 area ${area.areaId} has no benchmark start point`);
  }
  return {
    areaId: area.areaId,
    displayName: area.displayName,
    pointsData,
    gridMeta,
    gridBytes: [...gridBytes],
    startSpace,
  };
}

function countWalkableCells(gridBytes) {
  return gridBytes.reduce((count, value) => count + (value > 0 ? 1 : 0), 0);
}

function startViteServer() {
  const viteBin = resolve(repositoryRoot, "node_modules/vite/bin/vite.js");
  if (!existsSync(viteBin)) {
    throw new Error(`Vite executable is missing: ${viteBin}`);
  }
  const server = spawn(
    process.execPath,
    [viteBin, "--host", "127.0.0.1", "--port", String(benchmarkPort)],
    { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  const serverUrl = `http://127.0.0.1:${benchmarkPort}`;
  return { server, serverUrl };
}

async function waitForVite(serverUrl, server) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) {
      throw new Error(`Benchmark Vite server exited with ${server.exitCode}`);
    }
    try {
      const response = await fetch(
        `${serverUrl}/assets/maps/C108/manifest.json`,
      );
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error("Timed out waiting for the benchmark Vite server");
}

async function benchmarkInBrowser(page, serverUrl, input) {
  await page.goto(`${serverUrl}/assets/maps/C108/manifest.json`);
  return page.evaluate(
    async ({
      pointsData,
      gridMeta,
      gridBytes,
      startSpace,
      warmupCount,
      runCount,
    }) => {
      const { buildDistanceMap } = await import("/js/route-planner.ts");
      const percentile = (numbers, percentileValue) => {
        const sorted = [...numbers].sort((a, b) => a - b);
        const index = (percentileValue / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
      };
      const bytes = Uint8Array.from(gridBytes);
      const run = () => {
        const startedAt = performance.now();
        const distanceMap = buildDistanceMap(
          pointsData,
          gridMeta,
          bytes,
          startSpace,
        );
        const elapsed = performance.now() - startedAt;
        if (!distanceMap) {
          throw new Error(
            `Dijkstra returned no distance map for ${startSpace}`,
          );
        }
        return { elapsed, distanceMap };
      };

      for (let index = 0; index < warmupCount; index++) run();

      const timings = [];
      let lastDistanceMap = null;
      for (let index = 0; index < runCount; index++) {
        const result = run();
        timings.push(result.elapsed);
        lastDistanceMap = result.distanceMap;
      }

      const distances = lastDistanceMap.distances;
      let finiteDistanceCount = 0;
      let serializedFiniteChars = 0;
      for (const distance of distances) {
        if (!Number.isFinite(distance)) continue;
        finiteDistanceCount++;
        serializedFiniteChars += JSON.stringify(distance).length;
      }
      const finiteRatio = finiteDistanceCount / distances.length;
      const averageFiniteChars =
        finiteDistanceCount > 0
          ? serializedFiniteChars / finiteDistanceCount
          : 0;
      const averageCellChars =
        finiteRatio * averageFiniteChars + (1 - finiteRatio) * 4;

      let unreachableCount = 0;
      for (const point of pointsData.points) {
        let nearestDistance = Infinity;
        for (const portal of point.portals ?? []) {
          const index = portal.row * gridMeta.cols + portal.col;
          if (index >= 0 && index < distances.length) {
            nearestDistance = Math.min(nearestDistance, distances[index]);
          }
        }
        if (!Number.isFinite(nearestDistance)) unreachableCount++;
      }

      const matrixDistanceCount = pointsData.points.length ** 2;
      return {
        timings,
        medianOneSourceMs: percentile(timings, 50),
        p95OneSourceMs: percentile(timings, 95),
        estimatedMatrixMedianMs:
          percentile(timings, 50) * pointsData.points.length,
        estimatedMatrixP95Ms:
          percentile(timings, 95) * pointsData.points.length,
        matrixDistanceCount,
        float64MemoryBytes: matrixDistanceCount * 8,
        jsonStringEstimateBytes: Math.ceil(
          matrixDistanceCount * averageCellChars + matrixDistanceCount - 1 + 2,
        ),
        unreachableCount,
      };
    },
    {
      ...input,
      warmupCount: warmupRuns,
      runCount: measuredRuns,
    },
  );
}

async function runBrowserBenchmark(serverUrl, inputs, device) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(device);
  try {
    const results = [];
    for (const input of inputs) {
      const page = await context.newPage();
      try {
        const measured = await benchmarkInBrowser(page, serverUrl, input);
        results.push({ areaId: input.areaId, ...measured });
      } finally {
        await page.close();
      }
    }
    return results;
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function runBenchmark() {
  const manifestPath = resolve(c108Directory, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`C108 manifest not found at ${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  const inputs = manifest.areas.map((area) => loadAreaInputs(area));
  const { server, serverUrl } = startViteServer();

  try {
    await waitForVite(serverUrl, server);
    const desktop = await runBrowserBenchmark(serverUrl, inputs, {});
    const mobile = await runBrowserBenchmark(
      serverUrl,
      inputs,
      devices["Pixel 5"],
    );
    const desktopByArea = new Map(
      desktop.map((result) => [result.areaId, result]),
    );
    const mobileByArea = new Map(
      mobile.map((result) => [result.areaId, result]),
    );

    return inputs.map((input) => ({
      areaId: input.areaId,
      displayName: input.displayName,
      gridWidth: input.gridMeta.width,
      gridHeight: input.gridMeta.height,
      cols: input.gridMeta.cols,
      rows: input.gridMeta.rows,
      walkableCellCount: countWalkableCells(input.gridBytes),
      totalCellCount: input.gridMeta.cols * input.gridMeta.rows,
      endpointCount: input.pointsData.points.length,
      desktop: desktopByArea.get(input.areaId),
      mobile: mobileByArea.get(input.areaId),
    }));
  } finally {
    server.kill();
  }
}

function printResults(results) {
  console.log("=== C108 Routing Dijkstra Browser Benchmark Results ===");
  console.table(
    results.map((result) => ({
      Area: result.areaId,
      "Grid (WxH)": `${result.cols}x${result.rows}`,
      Endpoints: result.endpointCount,
      "Desktop Median (ms)": result.desktop.medianOneSourceMs.toFixed(2),
      "Desktop p95 (ms)": result.desktop.p95OneSourceMs.toFixed(2),
      "Mobile Median (ms)": result.mobile.medianOneSourceMs.toFixed(2),
      "Mobile p95 (ms)": result.mobile.p95OneSourceMs.toFixed(2),
      "Desktop Matrix p95 (s)": (
        result.desktop.estimatedMatrixP95Ms / 1000
      ).toFixed(2),
      "Mobile Matrix p95 (s)": (
        result.mobile.estimatedMatrixP95Ms / 1000
      ).toFixed(2),
      "Float64 (MB)": (
        result.desktop.float64MemoryBytes /
        (1024 * 1024)
      ).toFixed(2),
      "JSON Est (MB)": (
        result.desktop.jsonStringEstimateBytes /
        (1024 * 1024)
      ).toFixed(2),
      Unreachable: `${result.desktop.unreachableCount}/${result.mobile.unreachableCount}`,
    })),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runBenchmark()
    .then(printResults)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
