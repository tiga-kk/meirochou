import type {
  CircleRecord,
  DataSource,
  EventDayRef,
} from "../../event-day/public-api";

export type DataSourceType = "csv" | "gas";

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

export type CircleDataSourceErrorCode =
  | "invalid_url"
  | "network_error"
  | "timeout"
  | "invalid_csv"
  | "unsupported_file"
  | "file_too_large"
  | "expired_preview"
  | "stale_generation";

export interface CircleDataPreview {
  readonly previewId: string;
  readonly ref: EventDayRef;
  readonly mode: "initial" | "replacement" | "refresh";
  readonly expectedSourceGeneration: string;
  readonly diff: SourceDiff;
  readonly newCircles: readonly CircleRecord[];
  readonly source?: DataSource;
  readonly fetchedAt: string;
  readonly expiresAt: string;
}

export interface CircleDataSourceDraftUpdate {
  readonly draftWebAppUrl?: string;
  readonly selectedSheetName?: string;
}
