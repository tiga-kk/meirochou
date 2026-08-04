import type { GridMeta, PointsPayload } from "../domain/route-guidance-types";

export interface RouteMapAssets {
  readonly points: PointsPayload;
  readonly gridMetadata: GridMeta;
  readonly gridBytes: Uint8Array;
}

export interface RouteMapAssetsLoader {
  loadMapAssets(mapAreaId: string): Promise<RouteMapAssets>;
  clearCachedMapAssets(mapAreaId?: string): void;
}
