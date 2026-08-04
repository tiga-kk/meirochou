import type {
  RouteMapAssets,
  RouteMapAssetsLoader,
} from "../use-cases/route-map-assets-loader";

export class HttpRouteMapAssetsLoader implements RouteMapAssetsLoader {
  private cache = new Map<string, RouteMapAssets>();

  async loadMapAssets(mapAreaId: string): Promise<RouteMapAssets> {
    const cached = this.cache.get(mapAreaId);
    if (cached) {
      return cached;
    }

    const load = async (url: string): Promise<Response> => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to load route map asset (${response.status}): ${url}`,
        );
      }
      return response;
    };

    const pointsRes = await load(`/maps/c108-${mapAreaId}-points.json`);
    const points = (await pointsRes.json()) as RouteMapAssets["points"];
    const metaRes = await load(`/maps/c108-${mapAreaId}-grid-meta.json`);
    const gridMetadata =
      (await metaRes.json()) as RouteMapAssets["gridMetadata"];
    const bytesRes = await load(`/maps/c108-${mapAreaId}-grid.bin`);
    const gridBytes = new Uint8Array(await bytesRes.arrayBuffer());

    const assets: RouteMapAssets = { points, gridMetadata, gridBytes };
    this.cache.set(mapAreaId, assets);
    return assets;
  }

  clearCachedMapAssets(mapAreaId?: string): void {
    if (mapAreaId) {
      this.cache.delete(mapAreaId);
    } else {
      this.cache.clear();
    }
  }
}
