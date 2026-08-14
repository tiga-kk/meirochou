import { expect, type Page, test } from "@playwright/test";
import { routeDemoEventRegistry } from "./fixture-registry";

async function openNearbyMap(page: Page, width: number) {
  await page.setViewportSize({ width, height: 700 });
  await routeDemoEventRegistry(page);
  await page.goto("/");
  await page.getByRole("button", { name: "地図" }).click();
  await expect(page.locator("#nearby-map-workspace")).toBeVisible();
  await expect(page.locator("#nearby-map-image")).toHaveJSProperty("complete", true);
}

test("keeps the 920px workspace in one CSS mode", async ({ page }) => {
  await openNearbyMap(page, 920);

  const layout = await page.locator("#nearby-map-workspace").evaluate((workspace) => {
    const map = workspace.querySelector("#nearby-map-viewport")?.getBoundingClientRect();
    const panel = workspace.querySelector("#nearby-map-catalog-panel")?.getBoundingClientRect();
    return {
      mode: workspace.getAttribute("data-mode"),
      columns: getComputedStyle(workspace).gridTemplateColumns,
      map,
      panel,
    };
  });

  expect(layout.mode).toBe("medium");
  expect(layout.columns.split(" ")).toHaveLength(1);
  expect(layout.panel?.top).toBeGreaterThanOrEqual((layout.map?.bottom ?? 0) - 1);
});

test("uses the JS-selected panel width at 1024px", async ({ page }) => {
  await openNearbyMap(page, 1024);

  const layout = await page.locator("#nearby-map-workspace").evaluate((workspace) => {
    const map = workspace.querySelector("#nearby-map-viewport")?.getBoundingClientRect();
    const panel = workspace.querySelector("#nearby-map-catalog-panel")?.getBoundingClientRect();
    const workspaceWidth = workspace.clientWidth;
    const expectedPanelWidth = Math.min(340, Math.max(280, Math.round(workspaceWidth * 0.31)));
    return {
      mode: workspace.getAttribute("data-mode"),
      expectedPanelWidth,
      map,
      panel,
    };
  });

  expect(layout.mode).toBe("wide");
  expect(layout.panel?.width).toBeCloseTo(layout.expectedPanelWidth, 0);
  expect(layout.panel?.left).toBeGreaterThanOrEqual(layout.map?.right ?? 0);
});
