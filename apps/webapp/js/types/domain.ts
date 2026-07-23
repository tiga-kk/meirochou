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

export interface GasSaleUpdate {
  readonly action: "sale";
  readonly sheetName: string;
  readonly space: string;
  readonly undo: boolean;
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

export interface EventDay {
  readonly dayId: string;
  readonly displayName: string;
}

export interface EventRegistryEntryV1 {
  readonly eventId: string;
  readonly displayName: string;
  readonly mapBundle: string;
  readonly days: readonly EventDay[];
}

export interface EventRegistryV1 {
  readonly schemaVersion: 1;
  readonly events: readonly EventRegistryEntryV1[];
}

export type DataSourceType = "csv" | "gas";

export interface CsvDataSource {
  readonly type: "csv";
  readonly fileName: string;
}

export interface GasDataSource {
  readonly type: "gas";
  readonly gasUrl: string;
  readonly sheetName: string;
}

export type DataSource = CsvDataSource | GasDataSource;

export interface CircleRecord {
  readonly space: string;
  readonly priority?: number;
  readonly account?: string;
  readonly tweet?: string;
  readonly memo?: string;
  readonly isSale?: string;
  readonly removedFromSource?: boolean;
}

export interface HistoryEntry {
  readonly type: "purchase" | "hold" | "unpurchase" | "unhold";
  readonly space: string;
  readonly timestamp: string;
}

export interface GasOutboxEntry {
  readonly id: string;
  readonly eventId: string;
  readonly dayId: string;
  readonly sourceGeneration: string;
  readonly gasUrl: string;
  readonly sheetName: string;
  readonly space: string;
  readonly purchased: boolean;
  readonly createdAt: string;
  readonly attempts: number;
  readonly lastError: string | null;
}

export interface LocalEventDayState {
  readonly schemaVersion: 1;
  readonly source: DataSource;
  readonly sourceGeneration: string;
  readonly circles: readonly CircleRecord[];
  readonly purchased: readonly string[];
  readonly hold: readonly string[];
  readonly history: readonly HistoryEntry[];
  readonly redo: readonly HistoryEntry[];
  readonly gasOutbox: readonly GasOutboxEntry[];
  readonly timestamps: {
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly sourceUpdatedAt: string;
  };
}

export interface CsvIssue {
  readonly row: number;
  readonly column: string;
  readonly message: string;
}

export type CsvImportResult =
  | { readonly ok: true; readonly circles: readonly CircleRecord[] }
  | { readonly ok: false; readonly issues: readonly CsvIssue[] };

export interface SourceDiff {
  readonly added: readonly CircleRecord[];
  readonly updated: readonly {
    readonly before: CircleRecord;
    readonly after: CircleRecord;
  }[];
  readonly removed: readonly CircleRecord[];
  readonly unchanged: readonly CircleRecord[];
}

export interface GasOutboxResult {
  readonly sent: number;
  readonly pending: number;
  readonly error: Error | null;
}

export interface AppendedOutboxState {
  readonly state: LocalEventDayState;
  readonly entry: GasOutboxEntry;
}

export type ProtectedSourceOperation =
  | "csv-replacement"
  | "gas-initial-import"
  | "gas-refresh-apply"
  | "gas-url-change"
  | "sheet-name-change"
  | "source-type-change"
  | "circles-delete"
  | "activity-delete"
  | "event-day-delete";

/** Memory-only metadata for an explicit GAS import or refresh preview. */
export interface GasRefreshPreview {
  readonly previewId: string;
  readonly ref: EventDayRef;
  readonly mode: "initial" | "replacement" | "refresh";
  readonly replacementOperation:
    | "gas-initial-import"
    | "gas-url-change"
    | "sheet-name-change"
    | "source-type-change"
    | null;
  readonly expectedSourceGeneration: string;
  readonly expectedSnapshotHash: string;
  readonly source: GasDataSource;
  readonly spreadsheetTitle: string;
  readonly diff: SourceDiff;
  readonly fetchedAt: string;
  readonly expiresAt: string;
}
