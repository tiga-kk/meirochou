import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import { parseEventMapBundleManifest } from "../apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers";
import {
  parseGridMeta,
  parsePointsPayload,
} from "../apps/webapp/js/features/route-guidance/infrastructure/route-asset-parsers";

const BUNDLE_ROOT = resolve("apps/webapp/map-bundles/C108");
const AREA_IDS = ["e456", "e7", "s12", "w12"];

function parseSvgViewBox(svgContent: string, areaId: string) {
  const svgTag = svgContent.match(/<svg\b[^>]*>/i)?.[0];
  assert.ok(svgTag, `${areaId} must have an SVG root element`);
  const viewBox = svgTag.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  assert.ok(viewBox, `${areaId} must have an SVG viewBox`);

  const values = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  assert.equal(values.length, 4, `${areaId} viewBox must have four numbers`);
  assert.ok(values.every(Number.isFinite), `${areaId} viewBox must be finite`);
  assert.ok(values[2] > 0, `${areaId} viewBox width must be positive`);
  assert.ok(values[3] > 0, `${areaId} viewBox height must be positive`);
  return { width: values[2], height: values[3] };
}

function listFiles(directory: string, prefix = ""): string[] {
  return readdirSync(resolve(directory, prefix), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listFiles(directory, relativePath)
      : [relativePath];
  });
}

test("C108 map bundle contains manifest and 4 area files", () => {
  const manifestPath = resolve(BUNDLE_ROOT, "manifest.json");
  assert.equal(existsSync(manifestPath), true, "C108 manifest.json must exist");

  const manifestJson = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifest = parseEventMapBundleManifest(manifestJson);
  assert.equal(manifest.eventId, "C108");
  assert.equal(manifest.areas.length, 4);
  assert.deepEqual(
    manifest.areas.map((area) => area.areaId),
    AREA_IDS,
    "manifest area order must match the C108 inventory",
  );
  assert.deepEqual(
    manifest.areas.map((area) => area.metersPerPixel),
    [270 / 4096, 120 / 1848, 144 / 1872, 180 / 2904],
  );

  for (const areaId of AREA_IDS) {
    const areaDir = resolve(BUNDLE_ROOT, areaId);
    assert.equal(
      existsSync(resolve(areaDir, "map.svg")),
      true,
      `${areaId}/map.svg must exist`,
    );
    assert.equal(
      existsSync(resolve(areaDir, "points.json")),
      true,
      `${areaId}/points.json must exist`,
    );
    assert.equal(
      existsSync(resolve(areaDir, "grid-meta.json")),
      true,
      `${areaId}/grid-meta.json must exist`,
    );
    assert.equal(
      existsSync(resolve(areaDir, "grid.bin")),
      true,
      `${areaId}/grid.bin must exist`,
    );
  }

  assert.deepEqual(
    listFiles(BUNDLE_ROOT).sort(),
    [
      "manifest.json",
      ...AREA_IDS.flatMap((areaId) =>
        ["map.svg", "points.json", "grid-meta.json", "grid.bin"].map(
          (fileName) => `${areaId}/${fileName}`,
        ),
      ),
    ].sort(),
    "C108 public bundle must contain exactly 17 files",
  );
});

function assertSafeSvgContent(svgContent: string, areaId: string) {
  // Reject dangerous elements
  assert.doesNotMatch(svgContent, /<script[\s>]/i, `${areaId} has script tag`);
  assert.doesNotMatch(
    svgContent,
    /<foreignObject[\s>]/i,
    `${areaId} has foreignObject`,
  );
  assert.doesNotMatch(svgContent, /<iframe[\s>]/i, `${areaId} has iframe`);
  assert.doesNotMatch(svgContent, /<object[\s>]/i, `${areaId} has object`);
  assert.doesNotMatch(svgContent, /<embed[\s>]/i, `${areaId} has embed`);

  // Reject event handlers like onload=, onclick=
  assert.doesNotMatch(
    svgContent,
    /\son[a-z]+\s*=/i,
    `${areaId} has event handler`,
  );

  // Reject dangerous protocols & URLs
  assert.doesNotMatch(
    svgContent,
    /javascript:/i,
    `${areaId} has javascript: URI`,
  );
  assert.doesNotMatch(svgContent, /\bdata:/i, `${areaId} has data: URI`);

  // Allow standard SVG XML namespaces for URL validation check without mutating source content
  const svgForUrlCheck = svgContent.replace(
    /xmlns(?::[a-z0-9-]+)?\s*=\s*["']http:\/\/(?:www\.w3\.org\/(?:2000\/svg|1999\/xlink)|www\.w3\.org\/TR\/SVG11\/feature#\w+)["']/gi,
    "",
  );

  assert.doesNotMatch(
    svgForUrlCheck,
    /https?:\/\//i,
    `${areaId} has external http(s) URL`,
  );
  assert.doesNotMatch(
    svgForUrlCheck,
    /(?:^|[\s"'(=>])\/\/[^\s"'<>)]*/,
    `${areaId} has protocol-relative URL`,
  );

  // Reject local absolute paths (Unix & Windows)
  assert.doesNotMatch(
    svgContent,
    /\/Users\/|\/home\/|\/tmp\/|\/var\/|\b[A-Za-z]:[\\/]/,
    `${areaId} has local absolute path`,
  );

  // Reject XML External Entity (XXE) declarations
  assert.doesNotMatch(svgContent, /<!ENTITY/i, `${areaId} has XXE entity`);
  assert.doesNotMatch(svgContent, /SYSTEM/i, `${areaId} has SYSTEM entity`);

  // Reject external hrefs (only allow internal anchors like #id)
  const hrefMatches =
    svgContent.match(/(?:href|xlink:href)\s*=\s*["']([^"']+)["']/g) || [];
  for (const match of hrefMatches) {
    const valueMatch = match.match(/["']([^"']+)["']/);
    if (valueMatch) {
      const url = valueMatch[1];
      assert.ok(url.startsWith("#"), `${areaId} has non-anchor href: ${url}`);
    }
  }

  // Reject external url(...) in style
  const styleUrlMatches =
    svgContent.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi) || [];
  for (const match of styleUrlMatches) {
    const urlMatch = match.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/i);
    if (urlMatch) {
      const url = urlMatch[1];
      assert.ok(
        url.startsWith("#"),
        `${areaId} has non-anchor style url(...): ${url}`,
      );
    }
  }
}

test("C108 SVG map files are safe and free from external resources", () => {
  for (const areaId of AREA_IDS) {
    const svgPath = resolve(BUNDLE_ROOT, areaId, "map.svg");
    assertSafeSvgContent(readFileSync(svgPath, "utf8"), areaId);
  }
});

test("SVG safety rules reject dangerous fixture content", () => {
  const fixtures = [
    "<svg><script>alert(1)</script></svg>",
    "<svg><foreignObject /></svg>",
    '<svg onload="run()" />',
    '<svg><a href="javascript:run()" /></svg>',
    '<svg><image href="data:image/png;base64,AAAA" /></svg>',
    '<svg><a href="https://example.test/map.svg" /></svg>',
    '<svg><a href="//example.test/map.svg" /></svg>',
    "<svg><text>//example.test:443</text></svg>",
    '<svg style="background:url(https://example.test/bg.png)" />',
    "<!DOCTYPE svg [<!ENTITY leak SYSTEM '/tmp/private'>]><svg />",
    "<svg><iframe /></svg>",
    "<svg><object /></svg>",
    "<svg><embed /></svg>",
    "<svg><text>/home/tiga/private-map</text></svg>",
    "<svg><text>/tmp/private-map</text></svg>",
    "<svg><text>/var/private-map</text></svg>",
  ];

  for (const fixture of fixtures) {
    assert.throws(() => assertSafeSvgContent(fixture, "fixture"));
  }

  assert.doesNotThrow(() =>
    assertSafeSvgContent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" />',
      "namespace",
    ),
  );
});

test("C108 points, grid-meta, and grid.bin data structures are valid", () => {
  for (const areaId of AREA_IDS) {
    const areaDir = resolve(BUNDLE_ROOT, areaId);
    const svgContent = readFileSync(resolve(areaDir, "map.svg"), "utf8");
    const svgViewBox = parseSvgViewBox(svgContent, areaId);

    // 1. Grid metadata
    const gridMetaRaw = JSON.parse(
      readFileSync(resolve(areaDir, "grid-meta.json"), "utf8"),
    );
    const gridMeta = parseGridMeta(gridMetaRaw);
    assert.ok(gridMeta.width > 0);
    assert.ok(gridMeta.height > 0);
    assert.ok(gridMeta.cell_size > 0);
    assert.ok(gridMeta.cols > 0);
    assert.ok(gridMeta.rows > 0);

    // 2. Grid binary
    const gridBinBuf = readFileSync(resolve(areaDir, "grid.bin"));
    const expectedBytes = gridMeta.cols * gridMeta.rows;
    assert.equal(
      gridBinBuf.length,
      expectedBytes,
      `${areaId}/grid.bin byte count (${gridBinBuf.length}) must match cols * rows (${expectedBytes})`,
    );

    // Validate cell values (0=blocked, 1=walkable, 2=crowded)
    for (let i = 0; i < gridBinBuf.length; i++) {
      const val = gridBinBuf[i];
      assert.ok(
        val === 0 || val === 1 || val === 2,
        `${areaId} grid cell at ${i} has invalid value ${val}`,
      );
    }

    // 3. Points payload
    const pointsRaw = JSON.parse(
      readFileSync(resolve(areaDir, "points.json"), "utf8"),
    );
    const pointsPayload = parsePointsPayload(pointsRaw);
    assert.ok(pointsPayload.points.length > 0, `${areaId} must contain points`);
    assert.equal(
      pointsPayload.image.width,
      gridMeta.width,
      `${areaId} points image width must match grid metadata`,
    );
    assert.equal(
      pointsPayload.image.height,
      gridMeta.height,
      `${areaId} points image height must match grid metadata`,
    );
    assert.equal(
      svgViewBox.width,
      pointsPayload.image.width,
      `${areaId} SVG viewBox width must match points image width`,
    );
    assert.equal(
      svgViewBox.height,
      pointsPayload.image.height,
      `${areaId} SVG viewBox height must match points image height`,
    );

    const spaces = new Set<string>();

    for (const p of pointsPayload.points) {
      const space = `${p.identifier}${p.number}`;
      assert.ok(
        p.identifier.trim().length > 0,
        `${areaId} point has empty identifier`,
      );
      assert.ok(
        String(p.number).trim().length > 0,
        `${areaId} point has empty number`,
      );
      assert.ok(!spaces.has(space), `${areaId} point ${space} is duplicated`);
      spaces.add(space);
      assert.ok(
        Number.isFinite(p.center_x),
        `${areaId} point ${space} center_x is not finite`,
      );
      assert.ok(
        Number.isFinite(p.center_y),
        `${areaId} point ${space} center_y is not finite`,
      );

      // Check center coordinates inside image bounds
      assert.ok(
        p.center_x >= 0 && p.center_x <= gridMeta.width,
        `${areaId} point ${space} center_x (${p.center_x}) out of bounds (0..${gridMeta.width})`,
      );
      assert.ok(
        p.center_y >= 0 && p.center_y <= gridMeta.height,
        `${areaId} point ${space} center_y (${p.center_y}) out of bounds (0..${gridMeta.height})`,
      );

      // Check portals / grid endpoints
      for (const portal of p.portals) {
        assert.ok(
          portal.col >= 0 && portal.col < gridMeta.cols,
          `${areaId} point ${space} portal col (${portal.col}) out of grid cols (${gridMeta.cols})`,
        );
        assert.ok(
          portal.row >= 0 && portal.row < gridMeta.rows,
          `${areaId} point ${space} portal row (${portal.row}) out of grid rows (${gridMeta.rows})`,
        );

        const gridIdx = portal.row * gridMeta.cols + portal.col;
        const cellVal = gridBinBuf[gridIdx];
        assert.notEqual(
          cellVal,
          0,
          `${areaId} point ${space} portal at col=${portal.col}, row=${portal.row} is blocked (0)`,
        );
      }
    }
  }
});

test("C108 grid reachability verification for all circle endpoints", () => {
  for (const areaId of AREA_IDS) {
    const areaDir = resolve(BUNDLE_ROOT, areaId);
    const gridMeta = parseGridMeta(
      JSON.parse(readFileSync(resolve(areaDir, "grid-meta.json"), "utf8")),
    );
    const gridBinBuf = readFileSync(resolve(areaDir, "grid.bin"));
    const pointsPayload = parsePointsPayload(
      JSON.parse(readFileSync(resolve(areaDir, "points.json"), "utf8")),
    );

    const cols = gridMeta.cols;
    const rows = gridMeta.rows;

    // Collect all portal cell indices for circles
    const portalIndices = new Set<number>();
    for (const p of pointsPayload.points) {
      for (const portal of p.portals) {
        const idx = portal.row * cols + portal.col;
        if (gridBinBuf[idx] !== 0) {
          portalIndices.add(idx);
        }
      }
    }

    assert.ok(portalIndices.size > 0, `${areaId} has no valid portal indices`);

    // Pick first portal index as seed
    const startIdx = Array.from(portalIndices)[0];

    // BFS to find all reachable cells from startIdx
    const visited = new Uint8Array(cols * rows);
    const queue = [startIdx];
    visited[startIdx] = 1;
    let head = 0;

    while (head < queue.length) {
      const curr = queue[head++];
      const r = Math.floor(curr / cols);
      const c = curr % cols;

      const neighbors = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ];

      for (const [nr, nc] of neighbors) {
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const nIdx = nr * cols + nc;
          if (!visited[nIdx] && gridBinBuf[nIdx] !== 0) {
            visited[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }
    }

    // Check reachability of all portals
    let unreachableCount = 0;
    for (const portalIdx of portalIndices) {
      if (!visited[portalIdx]) {
        unreachableCount++;
      }
    }

    assert.equal(
      unreachableCount,
      0,
      `${areaId} has ${unreachableCount} / ${portalIndices.size} unreachable portals from start cell`,
    );
  }
});
