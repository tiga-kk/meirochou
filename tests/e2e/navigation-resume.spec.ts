import { expect, type Page, test } from "@playwright/test";
import { routeDemoEventRegistry } from "./fixture-registry";

const STATE_KEY = "comipath:v1:demo-v1:day1:state";
const SNAPSHOT_KEY = "comipath:nav-snapshot:demo-v1:day1";
const MATRIX_KEY = "comipath:distance-matrix:demo-v1:day1:fixture";

const demoState = {
  schemaVersion: 2,
  source: { type: "csv", fileName: "empty.csv" },
  sourceGeneration: "gen-e2e-01",
  circles: [
    { space: "東ア23a", priority: 1, isTarget: true, removedFromSource: false },
    {
      space: "東ア31b",
      priority: 2,
      isTarget: false,
      removedFromSource: false,
    },
  ],
  circleStates: {},
  gasOutbox: [],
  timestamps: {
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
  },
};

const snapshot = {
  schemaVersion: 1,
  eventId: "demo-v1",
  dayId: "day1",
  areaId: "demo-east",
  bundleVersion: "fixture-v1",
  matrixRef: "fixture-distance-matrix",
  navState: {
    stage: "navigating",
    areaId: "demo-east",
    currentPosition: {
      areaId: "demo-east",
      gridIndex: 4812,
      svgX: 100,
      svgY: 324,
      source: "manual-start",
    },
    targetSpace: "東ア23a",
    lockedFirstLeg: {
      from: { type: "start", areaId: "demo-east", gridIndex: 4812 },
      toSpace: "東ア23a",
    },
    provisionalOrder: ["東ア23a", "東ア31b"],
    bestOrder: ["東ア23a", "東ア31b"],
  },
  optimizationTimeLimitMs: 10000,
  savedAt: "2026-07-27T00:00:00.000Z",
};

async function seedNavigation(page: Page): Promise<void> {
  await page.addInitScript(
    ({ state, navSnapshot, stateKey, snapshotKey, matrixKey }) => {
      localStorage.setItem(
        "comipath:v1:index:event-days",
        JSON.stringify([{ eventId: "demo-v1", dayId: "day1" }]),
      );
      localStorage.setItem(
        "comipath:v1:last-opened",
        JSON.stringify({ eventId: "demo-v1", dayId: "day1" }),
      );
      localStorage.setItem(stateKey, JSON.stringify(state));
      localStorage.setItem(snapshotKey, JSON.stringify(navSnapshot));
      localStorage.setItem(
        `comipath:matrix:${navSnapshot.matrixRef}`,
        JSON.stringify({
          schemaVersion: 1,
          cacheKey: navSnapshot.matrixRef,
          areaId: navSnapshot.areaId,
          spaces: state.circles.map((circle) => circle.space),
          size: state.circles.length,
          distances: [0, 288, 288, 0],
          createdAt: "2026-07-25T00:00:00.000Z",
        }),
      );
      // This is an unrelated localStorage sentinel, not a real matrix schema.
      localStorage.setItem(matrixKey, JSON.stringify({ retained: true }));
    },
    {
      state: demoState,
      navSnapshot: snapshot,
      stateKey: STATE_KEY,
      snapshotKey: SNAPSHOT_KEY,
      matrixKey: MATRIX_KEY,
    },
  );
}

async function routeDemoManifest(page: Page): Promise<void> {
  await page.route("**/assets/maps/demo-v1/manifest.json", async (route) => {
    const response = await route.fetch();
    const manifest = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      response,
      body: JSON.stringify({ ...manifest, bundleVersion: "fixture-v1" }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await routeDemoEventRegistry(page);
  await routeDemoManifest(page);
});

test("valid snapshot resumes in the dialog, preserves target, and reappears after reload", async ({
  page,
}) => {
  await seedNavigation(page);
  await page.goto("/");

  const dialog = page.locator("#navigation-resume-dialog");
  await expect(dialog).toHaveAttribute("open", "");
  await expect(dialog).toContainText("東ア23a");
  await expect(page.locator("#target-space-heading")).not.toContainText(
    "東ア23a",
  );

  await dialog.locator("button.btn-primary").click();
  await expect(dialog).not.toHaveAttribute("open", "");
  await expect(page.locator("#target-space-heading")).toContainText("東ア23a");
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null"),
        SNAPSHOT_KEY,
      ),
    )
    .toMatchObject({
      navState: { optimizationGeneration: 1 },
      savedAt: expect.any(String),
    });
  const savedSnapshot = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    SNAPSHOT_KEY,
  );
  expect(savedSnapshot).toEqual({
    ...snapshot,
    navState: {
      ...snapshot.navState,
      optimizationGeneration: 1,
    },
    savedAt: expect.any(String),
  });
  expect(Number.isNaN(Date.parse(savedSnapshot.savedAt))).toBe(false);

  await page.reload();
  await expect(page.locator("#navigation-resume-dialog")).toHaveAttribute(
    "open",
    "",
  );
});

test("resetting the start clears snapshot but retains the matrix storage sentinel", async ({
  page,
}) => {
  await seedNavigation(page);
  await page.goto("/");

  const dialog = page.locator("#navigation-resume-dialog");
  await expect(dialog).toHaveAttribute("open", "");
  await dialog.locator("button.btn-secondary").click();
  await expect(dialog).not.toHaveAttribute("open", "");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_KEY))
    .toBeNull();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), MATRIX_KEY))
    .toBe(JSON.stringify({ retained: true }));
});
