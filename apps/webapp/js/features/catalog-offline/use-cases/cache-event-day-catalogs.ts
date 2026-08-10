import type { CatalogOfflineCachePort } from "../application/catalog-offline-cache-port";

export interface CacheEventDayCatalogsInput {
  readonly urls: readonly string[];
  readonly onProgress: (progress: { current: number; total: number }) => void;
}

export class CacheEventDayCatalogsUseCase {
  constructor(private readonly cache: CatalogOfflineCachePort) {}

  async execute(input: CacheEventDayCatalogsInput): Promise<{
    cachedCount: number;
    totalCount: number;
    failedCount: number;
  }> {
    const result = await this.cache.cacheAll(input.urls, input.onProgress);
    return {
      cachedCount: result.cached.length,
      totalCount: new Set(input.urls.filter((url) => url.trim() !== "")).size,
      failedCount: result.failed.length,
    };
  }
}
