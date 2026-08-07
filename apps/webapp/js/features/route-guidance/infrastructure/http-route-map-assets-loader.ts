import type { MapArea } from "../domain/map-area";
import type {
  RouteMapAssets,
  RouteMapAssetsLoader,
} from "../use-cases/route-map-assets-loader";

export class HttpRouteMapAssetsLoader implements RouteMapAssetsLoader {
  private cache = new Map<string, RouteMapAssets>();

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async loadMapAssets(mapArea: MapArea): Promise<RouteMapAssets> {
    if (!mapArea.assets) {
      throw new Error(`Route map assets are not configured: ${mapArea.areaId}`);
    }
    const cacheKey = `${mapArea.areaId}:${mapArea.assets.points}:${mapArea.assets.gridMeta}:${mapArea.assets.grid}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const load = async (url: string): Promise<Response> => {
      let response: Response;
      try {
        response = await this.fetcher(url);
      } catch (error) {
        throw new Error(`Failed to load route map asset: ${url}`, {
          cause: error,
        });
      }
      if (!response.ok) {
        throw new Error(
          `Failed to load route map asset (${response.status}): ${url}`,
        );
      }
      return response;
    };

    const pointsRes = await load(mapArea.assets.points);
    const points = (await pointsRes.json()) as RouteMapAssets["points"];
    const metaRes = await load(mapArea.assets.gridMeta);
    const gridMetadata =
      (await metaRes.json()) as RouteMapAssets["gridMetadata"];
    const bytesRes = await load(mapArea.assets.grid);
    const gridBytes = new Uint8Array(await bytesRes.arrayBuffer());

    const assets: RouteMapAssets = { points, gridMetadata, gridBytes };
    this.cache.set(cacheKey, assets);
    return assets;
  }

  clearCachedMapAssets(mapAreaId?: string): void {
    if (mapAreaId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${mapAreaId}:`)) this.cache.delete(key);
      }
    } else {
      this.cache.clear();
    }
  }
}
