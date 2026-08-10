import type { CatalogOfflineCachePort } from "../application/catalog-offline-cache-port";

export const CATALOG_CACHE_NAME = "comipath-catalog-v1";

interface BrowserCatalogOfflineCacheOptions {
  readonly caches?: CacheStorage;
  readonly fetcher?: typeof fetch;
  readonly persist?: () => Promise<boolean>;
}

function uniqueUrls(urls: readonly string[]): string[] {
  return [...new Set(urls)].filter((url) => url.trim() !== "");
}

export class BrowserCatalogOfflineCache implements CatalogOfflineCachePort {
  private persistenceRequested = false;
  private readonly cacheStorage: CacheStorage | undefined;
  private readonly fetcher: typeof fetch;
  private readonly persist: (() => Promise<boolean>) | undefined;

  constructor(options: BrowserCatalogOfflineCacheOptions = {}) {
    this.cacheStorage = options.caches ?? globalThis.caches;
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.persist = options.persist ?? globalThis.navigator?.storage?.persist?.bind(globalThis.navigator.storage);
  }

  async getStatus(urls: readonly string[]): Promise<{ cached: number; total: number }> {
    const entries = uniqueUrls(urls);
    const cache = await this.openCache();
    const cached = await Promise.all(entries.map((url) => cache.match(url)));
    return { cached: cached.filter(Boolean).length, total: entries.length };
  }

  async cacheAll(
    urls: readonly string[],
    onProgress: (progress: { current: number; total: number }) => void,
  ): Promise<{
    cached: readonly string[];
    failed: readonly { url: string; reason: string }[];
  }> {
    const entries = uniqueUrls(urls);
    const cached: string[] = [];
    const failed: Array<{ url: string; reason: string }> = [];
    await this.requestPersistence();

    let cache: Cache;
    try {
      cache = await this.openCache();
    } catch (error) {
      for (const url of entries) {
        failed.push({ url, reason: errorMessage(error) });
        onProgress({ current: failed.length, total: entries.length });
      }
      return { cached, failed };
    }

    for (const [index, url] of entries.entries()) {
      try {
        const request = new Request(url, { mode: "no-cors" });
        if (await cache.match(request)) {
          cached.push(url);
        } else {
          const response = await this.fetcher(request);
          if (response.type !== "opaque" && !response.ok) {
            throw new Error(`Catalog image request failed: ${response.status}`);
          }
          await cache.put(request, response.clone());
          cached.push(url);
        }
      } catch (error) {
        failed.push({ url, reason: errorMessage(error) });
      }
      onProgress({ current: index + 1, total: entries.length });
    }

    return { cached, failed };
  }

  async remove(urls: readonly string[]): Promise<void> {
    const cache = await this.openCache();
    await Promise.all(uniqueUrls(urls).map((url) => cache.delete(url)));
  }

  private async openCache(): Promise<Cache> {
    if (!this.cacheStorage) throw new Error("Cache Storage is unavailable");
    return this.cacheStorage.open(CATALOG_CACHE_NAME);
  }

  private async requestPersistence(): Promise<void> {
    if (this.persistenceRequested) return;
    this.persistenceRequested = true;
    try {
      await this.persist?.();
    } catch {
      // Persistence is advisory; Cache Storage remains the source of truth.
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
