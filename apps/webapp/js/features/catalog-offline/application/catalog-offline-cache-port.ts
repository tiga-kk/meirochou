export interface CatalogOfflineCachePort {
  getStatus(urls: readonly string[]): Promise<{ cached: number; total: number }>;

  cacheAll(
    urls: readonly string[],
    onProgress: (progress: { current: number; total: number }) => void,
  ): Promise<{
    cached: readonly string[];
    failed: readonly { url: string; reason: string }[];
  }>;

  remove(urls: readonly string[]): Promise<void>;
}
