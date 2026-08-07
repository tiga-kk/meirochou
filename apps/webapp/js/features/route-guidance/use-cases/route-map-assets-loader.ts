import type { MapArea } from "../domain/map-area";
import type {
  GridMeta,
  PointsPayload,
} from "../domain/routing/grid-route-types";

export interface RouteMapAssets {
  readonly points: PointsPayload;
  readonly gridMetadata: GridMeta;
  readonly gridBytes: Uint8Array;
}

export interface RouteMapAssetsLoader {
  loadMapAssets(mapArea: MapArea): Promise<RouteMapAssets>;
  clearCachedMapAssets(mapAreaId?: string): void;
}
