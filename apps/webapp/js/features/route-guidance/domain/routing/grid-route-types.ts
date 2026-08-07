import type { MapPoint } from "../../../event-day/public-api";

export type { MapPoint };

export interface OcrPortal extends MapPoint {
  col: number;
  row: number;
}

export interface OcrPoint {
  id?: string;
  point_id?: number;
  group_id?: string;
  identifier: string;
  number: string | number;
  center_x: number;
  center_y: number;
  portals: OcrPortal[];
}

export interface PointsPayload {
  schema_version?: number;
  map_id?: string;
  image: {
    path?: string;
    width: number;
    height: number;
  };
  grid?: {
    cell_size: number;
    cols: number;
    rows: number;
    grid_file?: string;
    meta_file?: string;
  };
  points: OcrPoint[];
}

export interface GridMeta {
  schema_version?: number;
  map_id?: string;
  width: number;
  height: number;
  cell_size: number;
  cols: number;
  rows: number;
  cell_values?: Record<string, number>;
  byte_order?: string;
  layout?: string;
  grid_file?: string;
}

export interface RouteCell {
  col: number;
  row: number;
}

export interface RouteResult {
  cost: number;
  cells: RouteCell[];
  points: MapPoint[];
  startPosition: MapPoint;
  targetPosition: MapPoint;
  image: { width: number; height: number };
}
