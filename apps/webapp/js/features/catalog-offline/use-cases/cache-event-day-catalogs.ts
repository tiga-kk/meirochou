import type { CatalogOfflineCachePort } from "../application/catalog-offline-cache-port";
import type { CircleRecord } from "../../event-day/public-api";

export interface CacheEventDayCatalogsInput {
  readonly urls: readonly string[];
  readonly onProgress: (progress: { current: number; total: number }) => void;
}

export function catalogUrlsFromCircles(
  circles: readonly Pick<CircleRecord, "tweet" | "removedFromSource">[],
): readonly string[] {
  return [
    ...new Set(
      circles
        .filter((circle) => circle.removedFromSource !== true)
        .map((circle) => circle.tweet)
        .filter((url): url is string => {
          if (typeof url !== "string" || url.trim() === "") return false;
          try {
            const protocol = new URL(url).protocol;
            return protocol === "http:" || protocol === "https:";
          } catch {
            return false;
          }
        }),
    ),
  ];
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
