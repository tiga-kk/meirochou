// @ts-check
import { expect, test } from "@playwright/test";
import { routeDemoEventRegistry } from "./fixture-registry";

test.beforeEach(async ({ page }) => {
  await routeDemoEventRegistry(page);
});

test.describe("Phase 5C Task 9: Mobile Navigation Flow & Accessibility", () => {
  test("mobile navigation lifecycle & accessibility checks", async ({
    page,
  }) => {
    // 15. no unexpected external network (monitored via route abort and zero external requests)
    const externalRequests = [];
    page.on("request", (req) => {
      const url = req.url();
      if (
        !url.startsWith("http://localhost") &&
        !url.startsWith("http://127.0.0.1")
      ) {
        externalRequests.push(url);
      }
    });

    // 16. console / page error monitoring
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (
        !url.startsWith("http://localhost") &&
        !url.startsWith("http://127.0.0.1")
      ) {
        externalRequests.push(url);
        return route.abort();
      }
      return route.continue();
    });

    // Load with demo_ui
    await page.goto("/?demo_ui=1");

    // 1. Target visibility
    await expect(page.locator("#target-content")).toBeVisible();

    // 32. Every visible button must meet the 44px touch target contract.
    const buttons = page.locator("button:visible");
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      const buttonLabel = await buttons.nth(i).evaluate((button) => ({
        id: button.id,
        text: button.textContent?.trim(),
        className: button.className,
      }));
      expect(
        box,
        `button ${JSON.stringify(buttonLabel)} should be measurable`,
      ).not.toBeNull();
      expect(
        box?.width,
        `button ${JSON.stringify(buttonLabel)} width`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        box?.height,
        `button ${JSON.stringify(buttonLabel)} height`,
      ).toBeGreaterThanOrEqual(44);
    }

    // 37. Portrait width horizontal overflow check
    const bodyWidth = await page.evaluate(() =>
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    );
    const viewportWidth = page.viewportSize()?.width ?? 375;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2); // 2px tolerance

    // 27. No external request is allowed.
    expect(externalRequests).toHaveLength(0);
    // 28. Check console errors list
    expect(consoleErrors).toHaveLength(0);
  });
});
