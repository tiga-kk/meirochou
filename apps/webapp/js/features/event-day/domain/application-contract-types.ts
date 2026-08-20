import type {
  Circle,
  CircleRecord,
  CircleVisitState,
  EventDayRef,
  GasDataSource,
  GasOutboxEntry,
  LocalEventDayState,
} from "./event-day-types";

export type {
  Circle,
  CircleRecord,
  CircleStateOverrides,
  CircleVisitState,
  CsvDataSource,
  DataSource,
  DataSourceType,
  EventDayRef,
  GasDataSource,
  GasOutboxEntry,
  LocalEventDayState,
  MapPoint,
  SourceRef,
} from "./event-day-types";

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
  /** Optional for legacy fictional bundles; required by the strict C108 contract. */
  metersPerPixel?: number;
}

export interface MapBundleManifestV1 {
  schemaVersion: 1;
  eventId: string;
  displayName: string;
  /** Content-derived bundle identity used by navigation snapshot validation. */
  bundleVersion?: string;
  areas: readonly MapBundleAreaV1[];
}

export interface GasSheetListResponse {
  sheets: string[];
  spreadsheetTitle: string;
}

export interface GasCircleResponse {
  circles: Circle[];
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

export interface EventDay {
  readonly dayId: string;
  readonly displayName: string;
  readonly date?: string;
}

export interface EventRegistryEntryV1 {
  readonly eventId: string;
  readonly displayName: string;
  readonly mapBundle: string;
  readonly mapBundleContract?: "event" | "legacy";
  readonly days: readonly EventDay[];
}

export interface EventRegistryV1 {
  readonly schemaVersion: 1;
  readonly events: readonly EventRegistryEntryV1[];
}

export interface HistoryEntry {
  readonly type: "purchase" | "hold" | "unpurchase" | "unhold";
  readonly space: string;
  readonly timestamp: string;
}

export interface CircleStateUndoToken {
  readonly space: string;
  readonly before: CircleVisitState;
  readonly after: CircleVisitState;
  readonly createdAtMs: number;
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

/** Result of a local activity mutation and its optional GAS outbox append. */
export interface PurchaseMutationResult {
  readonly state: LocalEventDayState;
  readonly pendingCount: number;
  readonly queuedEntryId: string | null;
}

/** Aggregate result for one all-event/day outbox processing run. */
export interface GasSyncSummary {
  readonly processedRefs: number;
  readonly sent: number;
  readonly pending: number;
  readonly failures: readonly { ref: EventDayRef; category: string }[];
}

/** Minimal browser event target used to inject online lifecycle events in tests. */
export interface OnlineEventTarget {
  addEventListener(type: "online", listener: () => void): void;
  removeEventListener(type: "online", listener: () => void): void;
}

export interface MapAssetPaths {
  readonly svg: string;
  readonly points: string;
  readonly gridMeta: string;
  readonly grid: string;
}

export interface EventMapAreaManifest {
  readonly areaId: string;
  readonly displayName: string;
  readonly metersPerPixel: number;
  readonly prefixes: readonly string[];
  readonly labels: readonly string[];
  readonly assets: MapAssetPaths;
}

export interface EventMapBundleManifest {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly bundleVersion: string;
  readonly areas: readonly EventMapAreaManifest[];
}

export type NavigationStage = "idle" | "navigating" | "atTarget";

export type RouteEndpointId =
  | {
      readonly type: "start";
      readonly areaId: string;
      readonly gridIndex: number;
    }
  | { readonly type: "circle"; readonly space: string };

export interface ConfirmedPosition {
  readonly areaId: string;
  readonly gridIndex: number;
  readonly svgX: number;
  readonly svgY: number;
  readonly source: "manual-start" | "arrived-circle";
  readonly circleSpace?: string;
}

export interface LockedLeg {
  readonly from: RouteEndpointId;
  readonly toSpace: string;
}

export interface NavigationState {
  readonly stage: NavigationStage;
  readonly areaId: string | null;
  readonly currentPosition: ConfirmedPosition | null;
  readonly targetSpace: string | null;
  readonly lockedFirstLeg: LockedLeg | null;
  readonly provisionalOrder: readonly string[];
  readonly bestOrder: readonly string[];
  /** Monotonic token used to discard progress from an obsolete optimizer job. */
  readonly optimizationGeneration?: number;
}
