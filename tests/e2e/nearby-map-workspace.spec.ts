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
    const workspaceRect = workspace.getBoundingClientRect();
    return {
      mode: workspace.getAttribute("data-mode"),
      display: getComputedStyle(workspace).display,
      map,
      panel,
      workspaceRect,
    };
  });

  expect(layout.mode).toBe("medium");
  expect(layout.display).toBe("block");
  expect(layout.map?.top).toBeGreaterThanOrEqual(layout.workspaceRect.top);
  expect(layout.map?.bottom).toBeLessThanOrEqual(layout.workspaceRect.bottom);
  expect(layout.panel?.width).toBeCloseTo(layout.workspaceRect.width, 0);
});

test("uses the JS-selected panel width at 1024px", async ({ page }) => {
  await openNearbyMap(page, 1024);

  const layout = await page.locator("#nearby-map-workspace").evaluate((workspace) => {
    const map = workspace.querySelector("#nearby-map-viewport")?.getBoundingClientRect();
    const panel = workspace.querySelector("#nearby-map-catalog-panel")?.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();
    return {
      mode: workspace.getAttribute("data-mode"),
      map,
      panel,
      workspaceRect,
    };
  });

  expect(layout.mode).toBe("wide");
  expect(layout.panel?.width).toBeCloseTo(layout.workspaceRect.width, 0);
  expect(layout.map?.left).toBeGreaterThanOrEqual(layout.workspaceRect.left);
  expect(layout.map?.right).toBeLessThanOrEqual(layout.workspaceRect.right);
});
