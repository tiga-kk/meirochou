import { expect, test } from "@playwright/test";
import { routeDemoEventRegistry } from "./fixture-registry";

const catalogPixel = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0,
  0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31,
  0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);

test("管理overviewのoffline準備が対象catalogの進捗を表示する", async ({
  page,
}) => {
  await routeDemoEventRegistry(page);
  await page.route("**/catalog-managed.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(catalogPixel),
    });
  });
  await page.addInitScript(() => {
    const timestamp = "2026-07-25T00:00:00.000Z";
    const state = {
      schemaVersion: 2,
      source: { type: "csv", fileName: "catalog.csv" },
      sourceGeneration: "gen-offline-e2e",
      circles: [{
        space: "東ア23a",
        tweet: `${location.origin}/catalog-managed.png`,
      }],
      circleStates: {},
      gasOutbox: [],
      timestamps: {
        createdAt: timestamp,
        updatedAt: timestamp,
        sourceUpdatedAt: timestamp,
      },
    };
    localStorage.setItem(
      "comipath:v1:index:event-days",
      JSON.stringify([{ eventId: "demo-v1", dayId: "day1" }]),
    );
    localStorage.setItem(
      "comipath:v1:last-opened",
      JSON.stringify({ eventId: "demo-v1", dayId: "day1" }),
    );
    localStorage.setItem(
      "comipath:v1:demo-v1:day1:state",
      JSON.stringify(state),
    );
  });

  await page.goto("/");
  await page.locator("#toggle-settings").click();
  const row = page.locator("event-day-management-view .event-day-management-row").first();
  await expect(row).toContainText("Data 1件");
  await row.locator('button[data-action="offline"]').click();
  await expect(page.locator("async-operation-indicator")).toContainText(
    "お品書き 1 / 1 保存済み",
  );
});

test("offline準備のpartial failureは成功cacheを保持しretryで不足分だけ再取得する", async ({
  page,
}) => {
  let failSecond = true;
  let firstRequests = 0;
  let secondRequests = 0;
  await routeDemoEventRegistry(page);
  await page.route("**/catalog-retry-a.png", async (route) => {
    firstRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(catalogPixel),
    });
  });
  await page.route("**/catalog-retry-b.png", async (route) => {
    secondRequests += 1;
    if (failSecond) {
      await route.fulfill({ status: 503, body: "temporary failure" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(catalogPixel),
    });
  });
  await page.addInitScript(() => {
    const timestamp = "2026-07-25T00:00:00.000Z";
    const origin = location.origin;
    localStorage.setItem(
      "comipath:v1:index:event-days",
      JSON.stringify([{ eventId: "demo-v1", dayId: "day1" }]),
    );
    localStorage.setItem(
      "comipath:v1:last-opened",
      JSON.stringify({ eventId: "demo-v1", dayId: "day1" }),
    );
    localStorage.setItem(
      "comipath:v1:demo-v1:day1:state",
      JSON.stringify({
        schemaVersion: 2,
        source: { type: "csv", fileName: "catalog-retry.csv" },
        sourceGeneration: "gen-offline-retry-e2e",
        circles: [
          { space: "東ア23a", tweet: `${origin}/catalog-retry-a.png` },
          { space: "東ア31b", tweet: `${origin}/catalog-retry-b.png` },
        ],
        circleStates: {},
        gasOutbox: [],
        timestamps: {
          createdAt: timestamp,
          updatedAt: timestamp,
          sourceUpdatedAt: timestamp,
        },
      }),
    );
  });

  await page.goto("/");
  firstRequests = 0;
  secondRequests = 0;
  await page.locator("#toggle-settings").click();
  const row = page.locator("event-day-management-view .event-day-management-row").first();
  await row.locator('button[data-action="offline"]').click();
  await expect(page.locator("async-operation-indicator")).toContainText(
    "お品書き 1 / 2 保存済み、1件失敗",
  );
  const firstAfterInitial = firstRequests;
  const secondAfterInitial = secondRequests;
  failSecond = false;
  await row.locator('button[data-action="offline"]').click();
  await expect(page.locator("async-operation-indicator")).toContainText(
    "お品書き 2 / 2 保存済み",
  );
  expect(firstRequests).toBe(firstAfterInitial);
  expect(secondRequests).toBe(secondAfterInitial + 1);
});

test("catalog cache hit works offline while uncached images use the network", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) throw new Error("worker is not controlling page");
    const cache = await caches.open("comipath-catalog-v1");
    const pixel = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0,
      0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31,
      0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68,
      174, 66, 96, 130,
    ]);
    await cache.put(
      "/catalog-cached.png",
      new Response(pixel, { headers: { "Content-Type": "image/png" } }),
    );
  });

  await context.setOffline(true);
  const result = await page.evaluate(async () => {
    const load = (src: string) =>
      new Promise<boolean>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = src;
      });
    return {
      cached: await load("/catalog-cached.png"),
      uncached: await load("/catalog-not-saved.png"),
    };
  });

  expect(result.cached).toBe(true);
  expect(result.uncached).toBe(false);
});
