import { describe, expect, it, vi } from "vitest";
import {
  CacheEventDayCatalogsUseCase,
  GetCatalogOfflineStatusUseCase,
} from "../apps/webapp/js/features/catalog-offline/public-api";

describe("catalog offline use cases", () => {
  it("keeps partial success and forwards progress", async () => {
    const cache = {
      cacheAll: vi.fn(async (_urls, onProgress) => {
        onProgress({ current: 1, total: 3 });
        onProgress({ current: 2, total: 3 });
        onProgress({ current: 3, total: 3 });
        return {
          cached: ["a", "b"],
          failed: [{ url: "c", reason: "offline" }],
        };
      }),
      getStatus: vi.fn(),
      remove: vi.fn(),
    };
    const progress: Array<{ current: number; total: number }> = [];

    await expect(
      new CacheEventDayCatalogsUseCase(cache).execute({
        urls: ["a", "b", "c"],
        onProgress: (value) => progress.push(value),
      }),
    ).resolves.toEqual({ cachedCount: 2, totalCount: 3, failedCount: 1 });
    expect(progress).toHaveLength(3);
  });

  it("delegates status without turning a storage error into zero", async () => {
    const cache = {
      cacheAll: vi.fn(),
      getStatus: vi.fn().mockRejectedValue(new Error("storage unavailable")),
      remove: vi.fn(),
    };

    await expect(
      new GetCatalogOfflineStatusUseCase(cache).execute(["a"]),
    ).rejects.toThrow("storage unavailable");
  });
});
