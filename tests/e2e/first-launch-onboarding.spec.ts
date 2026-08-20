import { expect, test } from "@playwright/test";
import { routeDemoEventRegistry } from "./fixture-registry";

const FIRST_USE_KEY = "meirochou.first-use-guide-seen";

test.beforeEach(async ({ context, page }) => {
  await context.route(
    /(?:cdnjs\.cloudflare\.com|platform\.twitter\.com)/,
    (route) => route.abort(),
  );
  await routeDemoEventRegistry(page, { firstUseGuideSeen: false });
});

test("normal runtime opens the guide once on first launch", async ({
  page,
}) => {
  await page.goto("/");

  const guide = page.locator("#user-guide-dialog");
  const dialog = guide.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("管理");
  await expect(dialog).toContainText("次の目的地を検索");
  await expect(dialog).toContainText("使い方");
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), FIRST_USE_KEY),
    )
    .toBe("1");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(guide.getByRole("dialog")).toHaveCount(0);

  await page.locator("#btn-open-user-guide").click();
  await expect(guide.getByRole("dialog")).toBeVisible();
});

test("demo runtime does not auto-open or write the first-use marker", async ({
  page,
}) => {
  await page.goto("/?demo_ui=1");

  const guide = page.locator("#user-guide-dialog");
  await expect(guide.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.evaluate((key) => localStorage.getItem(key), FIRST_USE_KEY),
  ).resolves.toBeNull();

  await page.locator("#btn-open-user-guide").click();
  await expect(guide.getByRole("dialog")).toBeVisible();
  await expect(
    page.evaluate((key) => localStorage.getItem(key), FIRST_USE_KEY),
  ).resolves.toBeNull();
});
