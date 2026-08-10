import { expect, test } from "@playwright/test";

test("catalog cache hit works offline while uncached images use the network", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(async () => {
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
