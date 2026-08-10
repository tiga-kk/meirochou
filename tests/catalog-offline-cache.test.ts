import { describe, expect, it, vi } from "vitest";
import { BrowserCatalogOfflineCache } from "../apps/webapp/js/features/catalog-offline/infrastructure/browser-catalog-offline-cache";

function response(type: ResponseType = "basic", ok = true): Response {
  return { ok, type, clone: () => response(type, ok) } as Response;
}

function cacheDouble(initial: string[] = []) {
  const entries = new Set(initial);
  const match = vi.fn(async (request: RequestInfo) =>
    entries.has(typeof request === "string" ? request : request.url)
      ? response()
      : undefined,
  );
  const put = vi.fn(async (request: RequestInfo) => {
    entries.add(typeof request === "string" ? request : request.url);
  });
  const cache = { match, put, delete: vi.fn() } as unknown as Cache;
  return { cache, match, put, entries };
}

describe("BrowserCatalogOfflineCache", () => {
  it("deduplicates URLs, keeps existing entries, accepts opaque responses, and reports failures", async () => {
    const fake = cacheDouble(["https://example.test/existing.png"]);
    const fetcher = vi.fn(async (request: Request) =>
      request.url.endsWith("opaque.png")
        ? response("opaque")
        : response("basic", false),
    );
    const cache = new BrowserCatalogOfflineCache({
      caches: { open: vi.fn(async () => fake.cache) } as unknown as CacheStorage,
      fetcher,
      persist: vi.fn(async () => false),
    });

    const result = await cache.cacheAll(
      [
        "https://example.test/existing.png",
        "https://example.test/opaque.png",
        "https://example.test/opaque.png",
        "https://example.test/failed.png",
      ],
      () => {},
    );

    expect(result.cached).toEqual([
      "https://example.test/existing.png",
      "https://example.test/opaque.png",
    ]);
    expect(result.failed).toEqual([
      { url: "https://example.test/failed.png", reason: expect.any(String) },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fake.put).toHaveBeenCalledTimes(1);
  });

  it("counts unique cached URLs and reports progress for every unique input", async () => {
    const fake = cacheDouble(["https://example.test/a.png"]);
    const progress: Array<{ current: number; total: number }> = [];
    const cache = new BrowserCatalogOfflineCache({
      caches: { open: vi.fn(async () => fake.cache) } as unknown as CacheStorage,
      fetcher: vi.fn(async () => response()),
      persist: vi.fn(async () => true),
    });

    await cache.cacheAll(
      ["https://example.test/a.png", "https://example.test/a.png", "https://example.test/b.png"],
      (value) => progress.push(value),
    );

    expect(progress).toEqual([
      { current: 1, total: 2 },
      { current: 2, total: 2 },
    ]);
    await expect(cache.getStatus(["https://example.test/a.png", "https://example.test/a.png"])).resolves.toEqual({
      cached: 1,
      total: 1,
    });
  });
});
