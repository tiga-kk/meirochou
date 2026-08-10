import type { CatalogOfflineCachePort } from "../application/catalog-offline-cache-port";

export class GetCatalogOfflineStatusUseCase {
  constructor(private readonly cache: CatalogOfflineCachePort) {}

  execute(urls: readonly string[]): Promise<{ cached: number; total: number }> {
    return this.cache.getStatus(urls);
  }
}
