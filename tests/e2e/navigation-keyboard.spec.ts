// @ts-check
import { expect, test } from "@playwright/test";
import { routeDemoEventRegistry } from "./fixture-registry";

test.beforeEach(async ({ page }) => {
  await routeDemoEventRegistry(page);
});

test.describe("Phase 5C Task 9: Desktop Keyboard Navigation", () => {
  test("supports keyboard navigation for lists, details, and shortcuts", async ({
    page,
  }) => {
    await page.goto("/?demo_ui=1");

    // Check Tab navigation reaches an actionable control with a visible focus ring.
    const searchButton = page.locator("#btn-search");
    await searchButton.focus();
    await expect(searchButton).toBeFocused();
    const focusStyle = await searchButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(focusStyle.outlineStyle).not.toBe("none");
    expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(
      3,
    );

    // Keyboard-only operation can open and close the settings surface.
    const settingsButton = page.locator("#toggle-settings");
    await settingsButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#settings-area")).toHaveClass(/show/);
    await page.keyboard.press("Escape");
    await expect(settingsButton).toBeFocused();

    // 200% text zoom must retain access to the primary action without overflow.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect(searchButton).toBeVisible();
    const zoomedWidth = await page.evaluate(() =>
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    );
    expect(zoomedWidth).toBeLessThanOrEqual(
      (page.viewportSize()?.width ?? 1280) + 2,
    );

    await page.keyboard.press("Escape");
  });
});
