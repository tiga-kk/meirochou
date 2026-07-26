import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "vitest";
import { Config } from "../apps/webapp/js/config.js";
import {
  createDevDemoData,
  isDevDemoEnabled,
} from "../apps/webapp/js/dev-demo-data.js";
import {
  getPinSourceSize,
  getRouteStartSpaceForMap,
} from "../apps/webapp/js/map-renderer.js";
import {
  buildRouteOverlaySvg,
  planRoute,
  rankCandidatesByGridDistance,
} from "../apps/webapp/js/route-planner";
import { StorageService } from "../apps/webapp/js/state/storage-service.js";
import { parseMapBundleManifest } from "../apps/webapp/js/types/boundary-parsers";
import {
  buildMapPins,
  buildMapPointIndex,
  buildSpaceFromLocation,
  calculateContainedImageBox,
  calculateFitTransform,
  calculateMapPinSize,
  calculateNativeImageScale,
  formatTargetViewModel,
  getPinPosition,
  normalizeExternalUrl,
} from "../apps/webapp/js/ui/navigation-view-model";

const root = new URL("../", import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

function readPngDimensions(path) {
  const png = readFileSync(new URL(path, root));
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

const rawMapManifest = JSON.parse(
  read("apps/webapp/map-bundles/demo-v1/manifest.json"),
);
const mapManifest = parseMapBundleManifest(
  rawMapManifest,
  "https://example.test/assets/maps/manifest.json",
);
Config.initializeAreas(mapManifest.areas);

// GAS contract tests are restored for Task 4
test("Phase 2 keeps GAS sale actions outside the local data service", () => {
  const source = read("apps/webapp/js/data-manager.ts");
  const gasSource = read("integrations/gas-spreadsheet/src/web-api.js");

  assert.doesNotMatch(source, /SyncQueue/);
  assert.doesNotMatch(source, /action:\s*["']sale["']/);
  assert.match(source, /sheetName/);
  assert.match(gasSource, /requestData\.sheetName/);
  assert.match(gasSource, /getSheetByName/);
  assert.doesNotMatch(source, /\?\s*\{\s*spaces:\s*space,\s*undo:\s*true\s*\}/);
});

test("Phase 5C Task 1 removes persistent Undo/Redo controls from the UI", () => {
  const appSource = read("apps/webapp/js/app.js");
  const modalSource = read("apps/webapp/js/modal-manager.js");
  const indexSource = read("apps/webapp/index.html");

  assert.doesNotMatch(indexSource, /id=["']btn-(?:undo|redo)["']/);
  assert.doesNotMatch(indexSource, /id=["']btn-gallery-undo["']/);
  assert.doesNotMatch(appSource, /handle(?:Undo|Redo)\(/);
  assert.doesNotMatch(modalSource, /handleGalleryUndo\(/);
  assert.doesNotMatch(modalSource, /btnGalleryUndo/);
});

test("GAS sale responses expose success response contract", () => {
  const responseSource = read("integrations/gas-spreadsheet/src/response.js");
  const saleSource = read("integrations/gas-spreadsheet/src/web-api.js");

  assert.match(responseSource, /function\s+successResponse/);
  assert.match(responseSource, /status:\s*["']success["']/);
  assert.match(responseSource, /ok:\s*true/);
  assert.match(saleSource, /successResponse/);
});

test("GAS circle responses include the spreadsheet title and source sheet name", () => {
  const source = read("integrations/gas-spreadsheet/src/web-api.js");

  assert.match(source, /spreadsheetTitle\s*=\s*spreadsheet\.getName\(\)/);
  assert.match(source, /sheetName/);
  assert.match(source, /circles/);
  assert.doesNotMatch(source, /wantToBuy/);
  assert.doesNotMatch(source, /imageUrl/);
});

test("documentation describes Phase 3 GAS sync contract accurately without claiming Phase 4 UI exists", () => {
  const publicReadme = read("README.md");
  const dataContracts = read("guides/data-contracts.md");
  const gasSyncContract = read("guides/gas-sync.md");
  const gasReadme = read("integrations/gas-spreadsheet/README.md");

  const docsCombined = [dataContracts, gasSyncContract, gasReadme].join("\n");

  assert.match(docsCombined, /explicit refresh/);
  assert.match(docsCombined, /LocalStorage/);
  assert.match(docsCombined, /gasOutbox/);
  assert.match(docsCombined, /sourceGeneration/);
  assert.match(docsCombined, /sheetName/);
  assert.match(docsCombined, /npm run build:gas/);

  assert.match(gasReadme, /`space`/);
  assert.match(gasReadme, /`priority`/);
  assert.match(gasReadme, /`isSale`/);
  assert.match(gasReadme, /`account`/);
  assert.match(gasReadme, /`tweet`/);
  assert.match(gasReadme, /`memo`/);
  assert.match(gasReadme, /\?sheets=/);
  assert.doesNotMatch(gasReadme, /配置|優先度|Xアカウント/);

  assert.doesNotMatch(docsCombined, /\/macros\/s\/[A-Za-z0-9_-]+\/exec/);
  assert.doesNotMatch(docsCombined, /Phase 4 management UI is available/i);

  // README should now contain a support matrix with links, not be empty
  assert.match(publicReadme, /guides\//);
  assert.doesNotMatch(
    publicReadme,
    /Service Worker.*available|offline.*asset.*available/i,
  );
  assert.doesNotMatch(publicReadme, /\/macros\/s\/[A-Za-z0-9_-]+\/exec/);
});

test("Phase 4 user-data-management guide covers required workflows", () => {
  const guide = read("guides/user-data-management.md");

  // event/day selection and map switch failure
  assert.match(guide, /イベント.*日程/);
  assert.match(guide, /切替|切り替え/);

  // CSV import and replacement
  assert.match(guide, /CSV/);
  assert.match(guide, /インポート|import/i);

  // GAS workflows
  assert.match(guide, /スプレッドシート|GAS/);
  assert.match(guide, /デプロイ|deploy/i);
  assert.match(guide, /シート.*選択|選択.*シート/);

  // local-first purchase
  assert.match(guide, /購入/);
  assert.match(guide, /保留/);

  // retry vs discard consequences
  assert.match(guide, /再送|retry/i);
  assert.match(guide, /破棄|discard/i);

  // deletion scopes (four)
  assert.match(guide, /サークルリスト/);
  assert.match(guide, /履歴/);
  assert.match(guide, /日程データ/);
  assert.match(guide, /全イベント/);

  // CSV export
  assert.match(guide, /エクスポート/);

  // single-device limit
  assert.match(guide, /単一端末|1台|LocalStorage/);

  // formula-like CSV values warning
  assert.match(guide, /数式に見える文字列/);
  assert.match(guide, /外部ソースとして扱ってください/);

  // safe recovery
  assert.match(guide, /エラー|失敗/);

  // no Service Worker guarantee
  assert.doesNotMatch(
    guide,
    /(?:Service Worker|PWA).*(?:利用可能|対応|有効|オフライン)/i,
  );

  // no deployed URL pattern
  assert.doesNotMatch(guide, /\/macros\/s\/[A-Za-z0-9_-]+\/exec/);
});

test("Apps Script source exists only under integrations", () => {
  assert.equal(
    existsSync(new URL("apps/webapp/apps_script_code.js", root)),
    false,
  );
});

test("shared webapp and GAS names use lower camel case", () => {
  const sources = [
    read("integrations/gas-spreadsheet/src/config.js"),
    read("integrations/gas-spreadsheet/src/web-api.js"),
  ].join("\n");

  assert.doesNotMatch(sources, /\bGAS_CONFIG\b/);
  assert.doesNotMatch(sources, /\bDEFAULT_SHEET_NAMES\b/);
  assert.doesNotMatch(sources, /\bSPACE_COLUMN_NAME\b/);
  assert.doesNotMatch(sources, /\bSTATUS_COLUMN_NAME\b/);
  assert.doesNotMatch(sources, /\bPURCHASED_STATUS_TEXT\b/);
  assert.doesNotMatch(sources, /\bval1\b/);
  assert.doesNotMatch(sources, /\bval2\b/);
});

test("Phase 3 keeps fetch inside GasApiClient and out of DataManager", () => {
  const dataManagerSource = read("apps/webapp/js/data-manager.ts");
  const gasClientSource = read("apps/webapp/js/api/gas-api-client.ts");

  assert.doesNotMatch(dataManagerSource, /\bfetch\(/);
  assert.match(gasClientSource, /async fetchSheetList/);
  assert.match(gasClientSource, /async fetchCircles/);
  assert.match(gasClientSource, /async sendSaleUpdate/);
});

test("Phase 2/3 DataManager storage is separate from the sync outbox", () => {
  const dataManagerSource = read("apps/webapp/js/data-manager.ts");
  const storageSource = read("apps/webapp/js/state/storage-service.ts");
  const outboxSource = read("apps/webapp/js/state/gas-outbox-service.ts");

  assert.match(dataManagerSource, /new StorageService\(/);
  assert.doesNotMatch(dataManagerSource, /SyncQueue/);
  assert.doesNotMatch(dataManagerSource, /localStorage\./);
  assert.match(storageSource, /localStorage/);
  assert.match(storageSource, /getStorage/);
  assert.match(outboxSource, /append/);
  assert.match(outboxSource, /process/);
});

test("webapp storage falls back when localStorage is unavailable", () => {
  const storage = new StorageService();

  storage.setJson("contract-test-json", { ok: true });
  storage.setString("contract-test-string", "ready");

  assert.deepEqual(storage.getJson("contract-test-json", null), { ok: true });
  assert.equal(storage.getString("contract-test-string"), "ready");

  storage.remove("contract-test-json");
  assert.equal(storage.getJson("contract-test-json", null), null);
});

test("webapp dev demo data is localhost gated and catalog-ready", () => {
  assert.equal(
    isDevDemoEnabled({ search: "?demo_ui=1", hostname: "localhost" }),
    true,
  );
  assert.equal(
    isDevDemoEnabled({ search: "?demo_ui=1", hostname: "example.com" }),
    false,
  );

  const demo = createDevDemoData();
  assert.ok(demo.wantToBuy.length >= 4);
  assert.ok(demo.wantToBuy.some((circle) => circle.tweet));
  assert.ok(demo.holdList.length > 0);
});

test("webapp CSS is split by responsibility", () => {
  const html = read("apps/webapp/index.html");
  const expected = [
    "css/tokens.css",
    "css/base.css",
    "css/buttons.css",
    "css/forms.css",
    "css/target.css",
    "css/stats.css",
    "css/modals.css",
    "css/gallery.css",
    "css/maps.css",
    "css/sheets.css",
  ];

  expected.forEach((href) => {
    assert.match(html, new RegExp(`href="${href}"`));
  });
  assert.equal(existsSync(new URL("apps/webapp/style.css", root)), false);
});

test("webapp uses Vite with a relative static-host base and dedicated output", () => {
  const packageJson = JSON.parse(read("package.json"));
  const viteConfig = read("vite.config.ts");

  assert.equal(packageJson.scripts["dev:webapp"], "vite --host 127.0.0.1");
  assert.equal(packageJson.scripts["build:webapp"], "vite build");
  assert.match(viteConfig, /root:\s*webappRoot/);
  assert.match(viteConfig, /base:\s*["']\.\/["']/);
  assert.match(viteConfig, /outDir:\s*webappOutput/);
  assert.match(viteConfig, /server\.middlewares\.use\(["']\/assets\/maps["']/);
  assert.match(
    viteConfig,
    /cpSync\(bundleDirectory,\s*resolve\(outputDirectory,\s*["']assets\/maps["']/,
  );
});

test("webapp CI runs clean install, full verification, and mobile E2E", () => {
  const packageJson = JSON.parse(read("package.json"));
  const workflow = read(".github/workflows/webapp-ci.yml");

  assert.match(packageJson.scripts["verify:webapp"], /test:webapp/);
  assert.match(packageJson.scripts["verify:webapp"], /check:webapp/);
  assert.match(packageJson.scripts["verify:webapp"], /build:webapp/);
  assert.match(packageJson.scripts["verify:webapp"], /verify:webapp:build/);
  assert.match(workflow, /run:\s*npm ci/);
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/);
  assert.match(
    workflow,
    /image:\s*mcr\.microsoft\.com\/playwright:v1\.61\.1-noble/,
  );
  assert.doesNotMatch(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /run:\s*npm run verify:webapp/);
  assert.match(workflow, /run:\s*npm run test:e2e/);
  assert.match(workflow, /if:\s*failure\(\)/);
});

test("webapp CI runs for main integration and explicit manual dispatch", () => {
  const workflow = read(".github/workflows/webapp-ci.yml");

  assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+- main/);
  assert.match(workflow, /pull_request:\s*\n\s+branches:\s*\n\s+- main/);
  assert.match(workflow, /workflow_dispatch:/);
});

test("webapp navigation view model marks selected, purchased, and hold pins", () => {
  const circles = [
    { space: "東A23a", priority: 10, tweet: "https://example.com/a.jpg" },
    { space: "東A31b", priority: 9 },
    { space: "東A41a", priority: 7 },
  ];

  const pins = buildMapPins(circles, {
    selectedSpace: "東A23a",
    purchasedList: ["東A31b"],
    holdList: ["東A41a"],
  });

  assert.equal(pins.length, 3);
  assert.equal(pins.find((pin) => pin.space === "東A23a").state, "next");
  assert.equal(pins.find((pin) => pin.space === "東A23a").baseState, "todo");
  assert.equal(pins.find((pin) => pin.space === "東A31b").state, "done");
  assert.equal(pins.find((pin) => pin.space === "東A31b").baseState, "done");
  assert.equal(pins.find((pin) => pin.space === "東A41a").state, "hold");
  assert.equal(pins.find((pin) => pin.space === "東A41a").baseState, "hold");
  pins.forEach((pin) => {
    assert.ok(pin.x >= 8 && pin.x <= 88);
    assert.ok(pin.y >= 16 && pin.y <= 82);
  });
});

test("webapp navigation view model distinguishes the current and previewed pins", () => {
  const pins = buildMapPins([{ space: "東A23a" }, { space: "東A31b" }], {
    currentTargetSpace: "東A23a",
    selectedSpace: "東A31b",
  });

  assert.equal(pins.find((pin) => pin.space === "東A23a").state, "next");
  assert.equal(pins.find((pin) => pin.space === "東A31b").state, "selected");
});

test("webapp target links accept only absolute HTTP URLs", () => {
  assert.equal(
    normalizeExternalUrl("https://x.com/circle_a"),
    "https://x.com/circle_a",
  );
  assert.equal(
    normalizeExternalUrl("http://example.test/profile"),
    "http://example.test/profile",
  );
  assert.equal(normalizeExternalUrl("javascript:alert(1)"), "");
  assert.equal(normalizeExternalUrl("/relative/profile"), "");
  assert.equal(normalizeExternalUrl("not a url"), "");
});

test("webapp map point index converts map pixel centers to percentages", () => {
  const pointIndex = buildMapPointIndex({
    image: { width: 200, height: 100 },
    points: [
      { identifier: "A", number: "23", center_x: 50, center_y: 25 },
      { identifier: null, number: "99", center_x: 180, center_y: 90 },
    ],
  });

  assert.deepEqual(pointIndex.get("A:23"), [{ x: 25, y: 25 }]);
  assert.equal(pointIndex.has(":99"), false);
});

test("webapp map point index preserves duplicate OCR candidates", () => {
  const index = buildMapPointIndex({
    image: { width: 200, height: 100 },
    points: [
      { identifier: "A", number: "23", center_x: 50, center_y: 25 },
      { identifier: "A", number: "23", center_x: 150, center_y: 75 },
    ],
  });

  assert.deepEqual(index.get("A:23"), [
    { x: 25, y: 25 },
    { x: 75, y: 75 },
  ]);
});

test("webapp map pins prefer points json positions when an index is provided", () => {
  const pointIndex = buildMapPointIndex({
    image: { width: 400, height: 200 },
    points: [{ identifier: "A", number: "23", center_x: 100, center_y: 50 }],
  });

  const [pin] = buildMapPins([{ space: "東A23a", priority: 10 }], {
    pointIndex,
  });

  assert.equal(pin.x, 25);
  assert.equal(pin.y, 25);
});

test("webapp selected pins use the point chosen by grid ranking", () => {
  const [pin] = buildMapPins([
    {
      space: "東A23a",
      mapPosition: { x: 62.5, y: 37.5 },
    },
  ]);

  assert.deepEqual({ x: pin.x, y: pin.y }, { x: 62.5, y: 37.5 });
});

test("webapp map pin size follows the rendered map scale", () => {
  assert.equal(
    calculateMapPinSize({
      imageWidth: 4000,
      renderedWidth: 400,
      sourceSize: 32,
      minSize: 2,
    }),
    3.2,
  );
  assert.equal(
    calculateMapPinSize({
      imageWidth: 4000,
      renderedWidth: 800,
      sourceSize: 32,
      minSize: 2,
    }),
    6.4,
  );
});

test("webapp zoom reaches the source image native resolution", () => {
  assert.equal(
    calculateNativeImageScale({ imageWidth: 3790, renderedWidth: 379 }),
    10,
  );
  assert.equal(
    calculateNativeImageScale({ imageWidth: 1848, renderedWidth: 390 }),
    5,
  );
  assert.equal(
    calculateNativeImageScale({ imageWidth: 8000, renderedWidth: 320 }),
    16,
  );
});

test("webapp map pin source sizes stay close to one grid cell", () => {
  assert.equal(getPinSourceSize("todo"), 8);
  assert.equal(getPinSourceSize("start"), 10);
  assert.equal(getPinSourceSize("next"), 12);
});

test("webapp route strokes scale with the map instead of the viewport", () => {
  const css = read("apps/webapp/css/target.css");

  assert.doesNotMatch(css, /vector-effect:\s*non-scaling-stroke/);
  assert.match(css, /\.route-overlay-line[\s\S]*stroke-linecap:\s*round/);
});

test("webapp map pins fall back when points json has no matching identifier number", () => {
  const pointIndex = buildMapPointIndex({
    image: { width: 400, height: 200 },
    points: [
      { identifier: null, number: "23", center_x: 100, center_y: 50 },
      { identifier: "A", number: "24", center_x: 300, center_y: 150 },
    ],
  });

  const [pin] = buildMapPins([{ space: "東A23a", priority: 10 }], {
    pointIndex,
  });

  assert.deepEqual({ x: pin.x, y: pin.y }, getPinPosition("東A23a"));
});

test("webapp does not invent pin positions after the OCR index has loaded", () => {
  const pins = buildMapPins([{ space: "東A99a" }], {
    pointIndex: new Map(),
    requireIndexedPositions: true,
    startSpace: "東A98a",
  });

  assert.deepEqual(pins, []);
});

test("webapp map image box matches object-fit contain inside the transform layer", () => {
  assert.deepEqual(
    calculateContainedImageBox({
      containerWidth: 300,
      containerHeight: 300,
      imageWidth: 400,
      imageHeight: 200,
    }),
    { left: 0, top: 75, width: 300, height: 150 },
  );

  assert.deepEqual(
    calculateContainedImageBox({
      containerWidth: 300,
      containerHeight: 150,
      imageWidth: 100,
      imageHeight: 200,
    }),
    { left: 112.5, top: 0, width: 75, height: 150 },
  );
});

test("webapp fit transform keeps two pin-layer points inside the viewport padding", () => {
  const transform = calculateFitTransform({
    containerWidth: 400,
    containerHeight: 300,
    contentBox: { left: 20, top: 30, width: 360, height: 180 },
    points: [
      { x: 45, y: 50 },
      { x: 55, y: 50 },
    ],
    padding: 48,
    minScale: 1,
    maxScale: 4,
  });

  assert.equal(transform.scale, 4);

  const screenPoints = [
    { x: 20 + 360 * 0.45, y: 30 + 180 * 0.5 },
    { x: 20 + 360 * 0.55, y: 30 + 180 * 0.5 },
  ].map((point) => ({
    x: point.x * transform.scale + transform.x,
    y: point.y * transform.scale + transform.y,
  }));

  screenPoints.forEach((point) => {
    assert.ok(point.x >= 48 && point.x <= 352);
    assert.ok(point.y >= 48 && point.y <= 252);
  });
});

test("webapp fit transform keeps start, current, and candidate points visible", () => {
  const points = [
    { x: 12, y: 20 },
    { x: 52, y: 45 },
    { x: 88, y: 80 },
  ];
  const contentBox = { left: 0, top: 50, width: 400, height: 200 };
  const transform = calculateFitTransform({
    containerWidth: 400,
    containerHeight: 300,
    contentBox,
    points,
    padding: 48,
    minScale: 1,
    maxScale: 4,
  });

  points.forEach((point) => {
    const x =
      (contentBox.left + (contentBox.width * point.x) / 100) * transform.scale +
      transform.x;
    const y =
      (contentBox.top + (contentBox.height * point.y) / 100) * transform.scale +
      transform.y;
    assert.ok(x >= 48 && x <= 352);
    assert.ok(y >= 48 && y <= 252);
  });
});

test("webapp fit transform zooms nearby points but avoids excessive zoom for distant points", () => {
  const closeTransform = calculateFitTransform({
    containerWidth: 400,
    containerHeight: 300,
    contentBox: { left: 20, top: 30, width: 360, height: 180 },
    points: [
      { x: 45, y: 50 },
      { x: 55, y: 50 },
    ],
    padding: 48,
    minScale: 1,
    maxScale: 4,
  });
  const farTransform = calculateFitTransform({
    containerWidth: 400,
    containerHeight: 300,
    contentBox: { left: 20, top: 30, width: 360, height: 180 },
    points: [
      { x: 10, y: 50 },
      { x: 90, y: 50 },
    ],
    padding: 48,
    minScale: 1,
    maxScale: 4,
  });

  assert.ok(closeTransform.scale > farTransform.scale);
  assert.ok(closeTransform.scale > 1);
  assert.ok(farTransform.scale <= 1.1);
});

test("webapp fit transform clamps scale to min and max bounds", () => {
  assert.equal(
    calculateFitTransform({
      containerWidth: 400,
      containerHeight: 300,
      contentBox: { left: 0, top: 0, width: 400, height: 300 },
      points: [
        { x: 49, y: 50 },
        { x: 51, y: 50 },
      ],
      padding: 48,
      minScale: 1,
      maxScale: 2,
    }).scale,
    2,
  );

  assert.equal(
    calculateFitTransform({
      containerWidth: 400,
      containerHeight: 300,
      contentBox: { left: 0, top: 0, width: 400, height: 300 },
      points: [
        { x: 5, y: 50 },
        { x: 95, y: 50 },
      ],
      padding: 48,
      minScale: 1.2,
      maxScale: 4,
    }).scale,
    1.2,
  );
});

test("webapp route start marker is kept only when start and target share a map area", () => {
  assert.equal(getRouteStartSpaceForMap("東イ12a", "東ア23a"), "東イ12a");
  assert.equal(getRouteStartSpaceForMap("西あ12a", "東ア23a"), "");
  assert.equal(getRouteStartSpaceForMap("", "東ア23a"), "");
  assert.equal(getRouteStartSpaceForMap("東イ12a", ""), "");
});

test("webapp area config exposes grid route assets for each map", () => {
  Config.AREAS.forEach((area) => {
    assert.match(
      area.gridMetaFile,
      new RegExp(`assets/maps/${area.id}/grid-meta\\.json$`),
    );
    assert.match(
      area.gridFile,
      new RegExp(`assets/maps/${area.id}/grid\\.bin$`),
    );
  });
});

test("webapp route planner restores a 4-neighbor route around blocked cells", () => {
  const pointsPayload = {
    image: { width: 40, height: 30 },
    points: [
      {
        identifier: "A",
        number: "1",
        center_x: 5,
        center_y: 15,
        portals: [{ col: 0, row: 1, x: 5, y: 15 }],
      },
      {
        identifier: "A",
        number: "2",
        center_x: 35,
        center_y: 15,
        portals: [{ col: 3, row: 1, x: 35, y: 15 }],
      },
    ],
  };
  const gridMeta = { width: 40, height: 30, cell_size: 10, cols: 4, rows: 3 };
  const gridBytes = new Uint8Array([1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1]);

  const route = planRoute(pointsPayload, gridMeta, gridBytes, "東A1a", "東A2a");

  assert.equal(route.cost, 50);
  assert.deepEqual(route.cells[0], { col: 0, row: 1 });
  assert.deepEqual(route.cells.at(-1), { col: 3, row: 1 });
  assert.equal(
    route.cells.some(
      (cell) => cell.row === 1 && (cell.col === 1 || cell.col === 2),
    ),
    false,
  );
  assert.deepEqual(route.points[0], { x: 5, y: 15 });
  assert.deepEqual(route.points.at(-1), { x: 35, y: 15 });
});

test("webapp route planner gives crowded cells a higher movement cost", () => {
  const pointsPayload = {
    image: { width: 30, height: 10 },
    points: [
      {
        identifier: "A",
        number: "1",
        portals: [{ col: 0, row: 0, x: 5, y: 5 }],
      },
      {
        identifier: "A",
        number: "2",
        portals: [{ col: 2, row: 0, x: 25, y: 5 }],
      },
    ],
  };
  const gridMeta = { width: 30, height: 10, cell_size: 10, cols: 3, rows: 1 };
  const normalRoute = planRoute(
    pointsPayload,
    gridMeta,
    new Uint8Array([1, 1, 1]),
    "東A1a",
    "東A2a",
  );
  const crowdedRoute = planRoute(
    pointsPayload,
    gridMeta,
    new Uint8Array([1, 2, 1]),
    "東A1a",
    "東A2a",
  );

  assert.equal(normalRoute.cost, 20);
  assert.equal(crowdedRoute.cost, 25);
  assert.ok(crowdedRoute.cost > normalRoute.cost);
});

test("webapp route planner starts drawing from the portal used by the reached path", () => {
  const pointsPayload = {
    image: { width: 40, height: 10 },
    points: [
      {
        identifier: "A",
        number: "1",
        portals: [
          { col: 0, row: 0, x: 5, y: 5 },
          { col: 2, row: 0, x: 25, y: 5 },
        ],
      },
      {
        identifier: "A",
        number: "2",
        portals: [{ col: 3, row: 0, x: 35, y: 5 }],
      },
    ],
  };
  const route = planRoute(
    pointsPayload,
    { width: 40, height: 10, cell_size: 10, cols: 4, rows: 1 },
    new Uint8Array([1, 1, 1, 1]),
    "東A1a",
    "東A2a",
  );

  assert.equal(route.cost, 10);
  assert.deepEqual(route.cells[0], { col: 2, row: 0 });
  assert.deepEqual(route.points[0], { x: 25, y: 5 });
});

test("webapp route planner preserves the selected source portal for same-cell ties", () => {
  const pointsPayload = {
    image: { width: 20, height: 10 },
    points: [
      {
        identifier: "A",
        number: "1",
        portals: [
          { col: 0, row: 0, x: 5, y: 5 },
          { col: 0, row: 0, x: 8, y: 5 },
        ],
      },
      {
        identifier: "A",
        number: "2",
        portals: [{ col: 1, row: 0, x: 15, y: 5 }],
      },
    ],
  };
  const route = planRoute(
    pointsPayload,
    { width: 20, height: 10, cell_size: 10, cols: 2, rows: 1 },
    new Uint8Array([1, 1]),
    "東A1a",
    "東A2a",
  );

  assert.deepEqual(route.points[0], { x: 8, y: 5 });
});

test("webapp route planner reuses the requested start point for route comparison", () => {
  const pointsPayload = {
    image: { width: 40, height: 10 },
    points: [
      {
        identifier: "A",
        number: "1",
        center_x: 5,
        center_y: 5,
        portals: [{ col: 0, row: 0, x: 5, y: 5 }],
      },
      {
        identifier: "A",
        number: "1",
        center_x: 25,
        center_y: 5,
        portals: [{ col: 2, row: 0, x: 25, y: 5 }],
      },
      {
        identifier: "A",
        number: "2",
        center_x: 5,
        center_y: 5,
        portals: [{ col: 0, row: 0, x: 5, y: 5 }],
      },
      {
        identifier: "A",
        number: "3",
        center_x: 35,
        center_y: 5,
        portals: [{ col: 3, row: 0, x: 35, y: 5 }],
      },
    ],
  };
  const gridMeta = { width: 40, height: 10, cell_size: 10, cols: 4, rows: 1 };
  const gridBytes = new Uint8Array([1, 1, 1, 1]);
  const currentRoute = planRoute(
    pointsPayload,
    gridMeta,
    gridBytes,
    "東A1a",
    "東A2a",
  );
  const candidateRoute = planRoute(
    pointsPayload,
    gridMeta,
    gridBytes,
    "東A1a",
    "東A3a",
    { startPosition: currentRoute.startPosition },
  );

  assert.deepEqual(currentRoute.startPosition, { x: 12.5, y: 50 });
  assert.deepEqual(candidateRoute.startPosition, currentRoute.startPosition);
  assert.deepEqual(candidateRoute.points[0], { x: 5, y: 5 });
  assert.equal(candidateRoute.cost, 30);
});

test("webapp route planner returns null for missing portals or unreachable targets", () => {
  const gridMeta = { width: 30, height: 10, cell_size: 10, cols: 3, rows: 1 };
  assert.equal(
    planRoute(
      {
        image: { width: 30, height: 10 },
        points: [
          { identifier: "A", number: "1", portals: [] },
          {
            identifier: "A",
            number: "2",
            portals: [{ col: 2, row: 0, x: 25, y: 5 }],
          },
        ],
      },
      gridMeta,
      new Uint8Array([1, 1, 1]),
      "東A1a",
      "東A2a",
    ),
    null,
  );

  assert.equal(
    planRoute(
      {
        image: { width: 30, height: 10 },
        points: [
          {
            identifier: "A",
            number: "1",
            portals: [{ col: 0, row: 0, x: 5, y: 5 }],
          },
          {
            identifier: "A",
            number: "2",
            portals: [{ col: 2, row: 0, x: 25, y: 5 }],
          },
        ],
      },
      gridMeta,
      new Uint8Array([1, 0, 1]),
      "東A1a",
      "東A2a",
    ),
    null,
  );
});

test("webapp route planner ranks candidates by one grid Dijkstra from the start", () => {
  const pointsPayload = {
    image: { width: 50, height: 30 },
    points: [
      {
        identifier: "A",
        number: "1",
        portals: [{ col: 0, row: 1, x: 5, y: 15 }],
      },
      {
        identifier: "A",
        number: "2",
        portals: [{ col: 4, row: 1, x: 45, y: 15 }],
      },
      {
        identifier: "A",
        number: "3",
        portals: [{ col: 0, row: 2, x: 5, y: 25 }],
      },
    ],
  };
  const gridMeta = { width: 50, height: 30, cell_size: 10, cols: 5, rows: 3 };
  const gridBytes = new Uint8Array([
    1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1,
  ]);

  const ranked = rankCandidatesByGridDistance(
    pointsPayload,
    gridMeta,
    gridBytes,
    "東A1a",
    [
      { space: "東A2a", priority: 10 },
      { space: "東A3a", priority: 8 },
    ],
  );

  assert.deepEqual(
    ranked.map((item) => item.candidate.space),
    ["東A3a", "東A2a"],
  );
  assert.equal(ranked[0].distance, 10);
  assert.equal(ranked[1].distance, 60);
});

test("webapp route planner considers every point sharing an identifier and number", () => {
  const pointsPayload = {
    image: { width: 50, height: 10 },
    points: [
      {
        id: "start",
        identifier: "A",
        number: "1",
        center_x: 5,
        center_y: 5,
        portals: [{ col: 0, row: 0, x: 5, y: 5 }],
      },
      {
        id: "near",
        identifier: "A",
        number: "2",
        center_x: 15,
        center_y: 5,
        portals: [{ col: 1, row: 0, x: 15, y: 5 }],
      },
      {
        id: "far",
        identifier: "A",
        number: "2",
        center_x: 45,
        center_y: 5,
        portals: [{ col: 4, row: 0, x: 45, y: 5 }],
      },
    ],
  };
  const ranked = rankCandidatesByGridDistance(
    pointsPayload,
    { width: 50, height: 10, cell_size: 10, cols: 5, rows: 1 },
    new Uint8Array([1, 1, 1, 1, 1]),
    "東A1a",
    [{ space: "東A2a" }],
  );

  assert.equal(ranked[0].distance, 10);
  assert.equal(ranked[0].position.x, 30);
  assert.equal(ranked[0].position.y, 50);
});

test("webapp route exposes the exact OCR points selected for both endpoint pins", () => {
  const pointsPayload = {
    image: { width: 50, height: 20 },
    points: [
      {
        identifier: "A",
        number: "1",
        center_x: 5,
        center_y: 5,
        portals: [{ col: 0, row: 0, x: 5, y: 5 }],
      },
      {
        identifier: "A",
        number: "1",
        center_x: 5,
        center_y: 15,
        portals: [{ col: 0, row: 1, x: 5, y: 15 }],
      },
      {
        identifier: "A",
        number: "2",
        center_x: 45,
        center_y: 15,
        portals: [{ col: 4, row: 1, x: 45, y: 15 }],
      },
    ],
  };
  const route = planRoute(
    pointsPayload,
    { width: 50, height: 20, cell_size: 10, cols: 5, rows: 2 },
    new Uint8Array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]),
    "東A1a",
    "東A2a",
  );

  assert.deepEqual(route.startPosition, { x: 10, y: 75 });
  assert.deepEqual(route.targetPosition, { x: 90, y: 75 });

  const pins = buildMapPins([{ space: "東A2a" }], {
    startSpace: "東A1a",
    positionOverrides: new Map([
      ["東A1a", route.startPosition],
      ["東A2a", route.targetPosition],
    ]),
  });
  assert.deepEqual(
    pins.map(({ space, x, y }) => ({ space, x, y })),
    [
      { space: "東A2a", x: 90, y: 75 },
      { space: "東A1a", x: 10, y: 75 },
    ],
  );
});

test("webapp next-target search ranks candidates with grid route assets", () => {
  const appSource = read("apps/webapp/js/app.js");

  assert.match(appSource, /rankCandidatesByGridDistance/);
  assert.match(appSource, /fetch\(area\.gridFile\)/);
  assert.match(appSource, /gridDistance/);
});

test("webapp current location keeps an exact circle number", () => {
  assert.equal(
    buildSpaceFromLocation({ areaName: "東456", label: "ア", number: "49" }),
    "東ア49",
  );
  assert.equal(
    buildSpaceFromLocation({ areaName: "西12", label: "あ", number: 1 }),
    "西あ1",
  );
  assert.equal(
    buildSpaceFromLocation({ areaName: "東456", label: "ア", number: 0 }),
    null,
  );
  assert.equal(
    buildSpaceFromLocation({ areaName: "東456", label: "ア", number: 100 }),
    null,
  );
});

test("webapp uses an exact numeric input for the current location", () => {
  const html = read("apps/webapp/index.html");
  const uiSource = read("apps/webapp/js/ui-manager.js");

  assert.match(
    html,
    /<input[\s\S]*id="loc-number"[\s\S]*type="number"[\s\S]*min="1"[\s\S]*max="99"/,
  );
  assert.doesNotMatch(html, /<select\s+id="loc-number"/);
  assert.doesNotMatch(
    uiSource,
    /const\s+options\s*=\s*\[10,\s*20,\s*30,\s*40,\s*50,\s*60\]/,
  );
});

test("webapp preserves current location when setting a gallery target", () => {
  const appSource = read("apps/webapp/js/app.js");
  const handler =
    appSource.match(
      /async\s+handleSetNextTarget\(circle\)[\s\S]*?\n\s*}\n\n\s*\/\*\*/,
    )?.[0] || "";

  assert.match(handler, /readCurrentSpace/);
  assert.match(handler, /rankCandidatesByGrid\(currentSpace,\s*\[circle\]\)/);
  assert.doesNotMatch(handler, /updateCurrentLocation/);
});

test("webapp restarts automatic search from the exact completed space", () => {
  const appSource = read("apps/webapp/js/app.js");

  assert.match(appSource, /this\.searchNext\(space,\s*false\)/);
});

test("webapp opens an empty local event/day on a first visit", () => {
  const appSource = read("apps/webapp/js/app.js");
  const uiSource = read("apps/webapp/js/ui-manager.js");

  assert.match(appSource, /CSVデータ未設定。空のイベント・日程で起動しました/);
  assert.doesNotMatch(appSource, /GAS URLを設定してください/);
  assert.doesNotMatch(uiSource, /dataManager\.getGasUrl\(\)/);
  assert.doesNotMatch(uiSource, /dataManager\.getSelectedSheets\(\)/);
  assert.match(
    uiSource,
    /showSettings\(\)[\s\S]*settingsArea\.open\s*=\s*true/,
  );
});

test("webapp brings manually opened settings into view", () => {
  const appSource = read("apps/webapp/js/app.js");
  const uiSource = read("apps/webapp/js/ui-manager.js");

  assert.match(
    appSource,
    /toggleSettings\(document\.getElementById\(["']toggle-settings["']\)\)/,
  );
  assert.match(
    uiSource,
    /scrollIntoView\(\{[\s\S]*?behavior:\s*["']smooth["'][\s\S]*?block:\s*["']start["']/,
  );
  assert.match(
    uiSource,
    /setAttribute\(["']aria-expanded["'],\s*String\(isOpen\)\)/,
  );
});

test("webapp route overlay SVG follows image pixel coordinates without handling pointer events", () => {
  const overlay = buildRouteOverlaySvg({
    image: { width: 40, height: 30 },
    points: [
      { x: 5, y: 15 },
      { x: 15, y: 5 },
      { x: 35, y: 15 },
    ],
  });

  assert.equal(overlay.className, "route-overlay");
  assert.equal(overlay.getAttribute("viewBox"), "0 0 40 30");
  assert.equal(overlay.style.pointerEvents, "none");
  assert.equal(
    overlay.querySelector("polyline").getAttribute("points"),
    "5,15 15,5 35,15",
  );
});

test("webapp candidate route overlay exposes a distinct route kind", () => {
  const overlay = buildRouteOverlaySvg(
    {
      image: { width: 40, height: 30 },
      points: [
        { x: 5, y: 15 },
        { x: 35, y: 15 },
      ],
    },
    undefined,
    "candidate",
  );

  assert.equal(overlay.className, "route-overlay route-overlay-candidate");
  assert.equal(overlay.getAttribute("data-route-kind"), "candidate");
});

test("webapp navigation view model deduplicates spaces before rendering pins", () => {
  const pins = buildMapPins(
    [
      { space: "東A23a", priority: 10 },
      { space: "東A23a", priority: 3 },
      { space: "東A31b", priority: 9 },
    ],
    { selectedSpace: "東A23a" },
  );

  assert.deepEqual(
    pins.map((pin) => pin.space),
    ["東A23a", "東A31b"],
  );
  assert.equal(pins.find((pin) => pin.space === "東A23a").state, "next");
});

test("webapp target view model keeps mincho UI labels Japanese-first", () => {
  const viewModel = formatTargetViewModel(
    { space: "東A23a", priority: 10, tweet: "https://example.com/a.jpg" },
    "東A12a",
    { space: "東A31b" },
  );

  assert.equal(viewModel.statusLabel, "次の目的地");
  assert.equal(viewModel.space, "東A23a");
  assert.equal(viewModel.priorityLabel, "優先度 10");
  assert.equal(viewModel.nextLabel, "次 東A31b");
  assert.equal(viewModel.hasCatalogImage, true);
});

test("webapp target view model prefers grid distance when available", () => {
  const viewModel = formatTargetViewModel(
    { space: "東A23a", priority: 10, gridDistance: 928.4 },
    "東A12a",
  );

  assert.equal(viewModel.distanceLabel, "距離 928");
});

test("webapp target view model exposes the source sheet name", () => {
  const viewModel = formatTargetViewModel({
    space: "東A23a",
    priority: 10,
    sheetName: "1日目・東",
  });

  assert.equal(viewModel.sheetNameLabel, "シート: 1日目・東");
  assert.equal(formatTargetViewModel({ space: "東A24a" }).sheetNameLabel, "");
});

test("webapp renders spreadsheet and source-sheet titles in compact labels", () => {
  const html = read("apps/webapp/index.html");
  const dataManagerSource = read("apps/webapp/js/data-manager.ts");
  const uiSource = read("apps/webapp/js/ui-manager.js");

  assert.match(html, /id="spreadsheet-title"/);
  assert.match(html, /id="target-sheet-name"/);
  assert.match(dataManagerSource, /spreadsheetTitle/);
  assert.match(dataManagerSource, /spreadsheetTitle/);
  assert.match(uiSource, /updateSpreadsheetTitle/);
  assert.match(uiSource, /viewModel\.sheetNameLabel/);
});

test("webapp typography uses mincho as the primary UI font", () => {
  const tokens = read("apps/webapp/css/tokens.css");

  assert.match(tokens, /--font-main:\s*"Hiragino Mincho ProN"/);
  assert.match(tokens, /--font-ui-sans:/);
  assert.match(tokens, /--font-mono:/);
  assert.doesNotMatch(tokens, /--font-main:\s*"Zen Maru Gothic"/);
});

test("webapp map manifest references one complete fictional bundle per area", () => {
  assert.deepEqual(
    Config.AREAS.map((area) => area.id),
    ["demo-east", "demo-west"],
  );
  Config.AREAS.forEach((area) => {
    assert.equal(area.mapId, area.id);
    assert.equal(
      area.mapFile,
      `https://example.test/assets/maps/${area.id}/source.png`,
    );
    assert.equal(
      area.pointsFile,
      `https://example.test/assets/maps/${area.id}/points.json`,
    );

    const assetDir = `apps/webapp/map-bundles/demo-v1/${area.id}`;
    ["source.png", "points.json", "grid-meta.json", "grid.bin"].forEach(
      (fileName) => {
        assert.equal(
          existsSync(new URL(`${assetDir}/${fileName}`, root)),
          true,
          `${assetDir}/${fileName} should exist`,
        );
      },
    );
  });
});

test("webapp demo image, points, portals, and grid share one coordinate system", () => {
  Config.AREAS.forEach((area) => {
    const assetBase = `apps/webapp/map-bundles/demo-v1/${area.id}`;
    const webImagePath = `${assetBase}/source.png`;
    const points = JSON.parse(read(`${assetBase}/points.json`));
    const gridMeta = JSON.parse(read(`${assetBase}/grid-meta.json`));
    const grid = readFileSync(new URL(`${assetBase}/grid.bin`, root));
    const dimensions = readPngDimensions(webImagePath);

    assert.equal(points.image.width, dimensions.width);
    assert.equal(points.image.height, dimensions.height);
    assert.equal(gridMeta.width, dimensions.width);
    assert.equal(gridMeta.height, dimensions.height);
    assert.equal(grid.length, gridMeta.cols * gridMeta.rows);
    assert.deepEqual([...new Set(grid)].sort(), [0, 1, 2]);

    const pointIds = new Set();
    points.points.forEach((point) => {
      assert.equal(
        pointIds.has(point.id),
        false,
        `${area.id}:${point.id} must be unique`,
      );
      pointIds.add(point.id);
      assert.ok(point.center_x >= 0 && point.center_x < dimensions.width);
      assert.ok(point.center_y >= 0 && point.center_y < dimensions.height);
      assert.ok(point.portals.length > 0);
      point.portals.forEach((portal) => {
        assert.ok(portal.col >= 0 && portal.col < gridMeta.cols);
        assert.ok(portal.row >= 0 && portal.row < gridMeta.rows);
        assert.ok(portal.x >= 0 && portal.x < dimensions.width);
        assert.ok(portal.y >= 0 && portal.y < dimensions.height);
      });
    });
  });

  const eastPoints = JSON.parse(
    read("apps/webapp/map-bundles/demo-v1/demo-east/points.json"),
  );
  assert.equal(
    eastPoints.points.filter(
      (point) => point.identifier === "ア" && point.number === "23",
    ).length,
    2,
  );
});

test("webapp navigation map renders the configured map image", () => {
  const html = read("apps/webapp/index.html");
  const mapRenderer = read("apps/webapp/js/map-renderer.js");

  assert.match(html, /id="navigation-map-image"/);
  assert.match(mapRenderer, /navigationMapImage/);
  assert.match(mapRenderer, /\.src\s*=\s*area\.mapFile/);
  assert.match(mapRenderer, /classList\.remove\(["']hidden["']\)/);
});

test("webapp validates the map manifest before constructing App", () => {
  const appSource = read("apps/webapp/js/app.js");
  const loadIndex = appSource.indexOf(
    "await loadRuntimeMapBundleManifestFromUrl",
  );
  const initializeIndex = appSource.indexOf(
    "Config.initializeAreas",
    loadIndex,
  );
  const constructIndex = appSource.indexOf("new App()", initializeIndex);

  assert.ok(loadIndex >= 0);
  assert.ok(initializeIndex > loadIndex);
  assert.ok(constructIndex > initializeIndex);
  assert.match(
    appSource,
    /catch\s*\(error\)[\s\S]*renderMapBootstrapError\(document,\s*error\)/,
  );
});

test("webapp map rendering avoids a permanently low-resolution transform layer", () => {
  const css = read("apps/webapp/css/target.css");
  const gestureHelper = read("apps/webapp/js/utils/gesture-helper.js");

  assert.doesNotMatch(css, /will-change:\s*transform/);
  assert.doesNotMatch(
    gestureHelper,
    /style\.willChange\s*=\s*["']transform["']/,
  );
  assert.match(gestureHelper, /setMaxScale/);
});

test("webapp navigation map loads the configured point index for pins", () => {
  const mapRenderer = read("apps/webapp/js/map-renderer.js");

  assert.match(mapRenderer, /loadPointIndex/);
  assert.match(mapRenderer, /fetch\(area\.pointsFile\)/);
  assert.match(mapRenderer, /buildMapPins\(circles,\s*\{[\s\S]*pointIndex/);
  assert.match(
    mapRenderer,
    /requireIndexedPositions:\s*Boolean\(area\?\.pointsFile\)/,
  );
});

test("webapp navigation map load listener is guarded across repeated init calls", () => {
  const mapRenderer = read("apps/webapp/js/map-renderer.js");

  assert.match(mapRenderer, /navigationMapImageLoadListenerAttached/);
  assert.match(mapRenderer, /!this\.navigationMapImageLoadListenerAttached/);
  assert.match(
    mapRenderer,
    /this\.navigationMapImageLoadListenerAttached\s*=\s*true/,
  );
});
