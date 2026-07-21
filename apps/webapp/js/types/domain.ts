export interface MapPoint {
  x: number;
  y: number;
}

export interface MapBundleAreaV1 {
  id: string;
  mapId: string;
  name: string;
  prefixes: readonly string[];
  labels: readonly string[];
  mapFile: string;
  pointsFile: string;
  gridMetaFile: string;
  gridFile: string;
}

export interface MapBundleManifestV1 {
  schemaVersion: 1;
  eventId: string;
  displayName: string;
  areas: readonly MapBundleAreaV1[];
}

export interface Circle {
  space: string;
  priority?: number | string;
  isSale?: string;
  account?: string;
  tweet?: string;
  sheetName?: string;
  gridDistance?: number;
  mapPosition?: MapPoint;
  [key: string]: unknown;
}

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

export interface GasSheetListResponse {
  sheets: string[];
  spreadsheetTitle: string;
}

export interface GasCircleResponse {
  wantToBuy: Circle[];
  spreadsheetTitle: string;
}

export type ActionType = "purchase" | "hold";

export interface ActionHistoryEntry {
  type: ActionType;
  space: string;
  sheetName?: string;
}

export interface CachedCircleData {
  wantToBuy: Circle[];
  spreadsheetTitle: string;
}

export type SaleUpdatePayload =
  | { action: "sale"; space: string; undo: boolean; sheetName?: string }
  | { action: "sale"; spaces: string[]; undo: true };

export interface EventDayRef {
  readonly eventId: string;
  readonly dayId: string;
}

export interface SourceRef {
  readonly eventId: string;
  readonly dayId: string;
  readonly sourceGeneration: string;
}
