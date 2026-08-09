export type CircleVisitState = "pending" | "held" | "purchased" | "excluded";
export type CircleStatus = CircleVisitState;

export interface MapPoint {
  x: number;
  y: number;
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
  readonly queueClass?: "normal" | "wall";
  readonly removedFromSource?: boolean;
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

export interface EventDayRef {
  readonly eventId: string;
  readonly dayId: string;
}

export interface SourceRef {
  readonly eventId: string;
  readonly dayId: string;
  readonly sourceGeneration: string;
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

export interface CircleStateOverrides {
  readonly [space: string]: Exclude<CircleVisitState, "pending">;
}

export interface LocalEventDayState {
  readonly schemaVersion: 2;
  readonly source: DataSource;
  readonly sourceGeneration: string;
  readonly circles: readonly CircleRecord[];
  readonly circleStates: CircleStateOverrides;
  readonly gasOutbox: readonly GasOutboxEntry[];
  readonly timestamps: {
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly sourceUpdatedAt: string;
  };
}

export interface ActiveEventDaySnapshot {
  readonly ref: EventDayRef;
  readonly state: LocalEventDayState;
}
