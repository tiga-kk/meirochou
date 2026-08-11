import { expect, test } from "@playwright/test";

test("auto-fit map keeps the vector source and records render diagnostics", async ({
  page,
}) => {
  await page.goto("/?demo_ui=1");
  await expect(page.locator("#target-content")).toBeVisible();
  await page.locator("#btn-search").click();
  await expect(page.locator('[data-route-kind="current"]')).toBeVisible();

  const diagnostics = await page.locator("#navigation-map").evaluate(() => {
    const image = document.querySelector<HTMLImageElement>(
      "#navigation-map-image",
    );
    const layer = document.querySelector<HTMLElement>("#navigation-map-layer");
    const map = document.querySelector<HTMLElement>("#navigation-map");
    return {
      devicePixelRatio: window.devicePixelRatio,
      source: image?.currentSrc || image?.src || "",
      naturalWidth: image?.naturalWidth || 0,
      naturalHeight: image?.naturalHeight || 0,
      transform: layer ? getComputedStyle(layer).transform : "",
      stageWidth: layer?.getBoundingClientRect().width || 0,
      stageHeight: layer?.getBoundingClientRect().height || 0,
      willChange: layer ? getComputedStyle(layer).willChange : "",
      viewportWidth: map?.getBoundingClientRect().width || 0,
      viewportHeight: map?.getBoundingClientRect().height || 0,
    };
  });

  expect(diagnostics.source).toMatch(/\.(?:svg|png)(?:$|[?#])/i);
  expect(diagnostics.naturalWidth).toBeGreaterThan(0);
  expect(diagnostics.naturalHeight).toBeGreaterThan(0);
  expect(diagnostics.stageWidth).toBeGreaterThan(0);
  expect(diagnostics.stageHeight).toBeGreaterThan(0);
  expect(diagnostics.viewportWidth).toBeGreaterThan(0);
  expect(diagnostics.viewportHeight).toBeGreaterThan(0);
  expect(diagnostics.willChange).toBe("auto");

  await page.locator("#navigation-map").screenshot({
    path: "test-results/map-render-quality-auto-fit.png",
  });
});
