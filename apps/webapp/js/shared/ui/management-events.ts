import type {
  EventDayRef,
  GasDataSource,
} from "../../features/event-day/public-api";

/** A user-selected source file or a GAS source draft that is not persisted yet. */
export type DataSourceDraft =
  | { readonly type: "csv"; readonly file: File }
  | {
      readonly type: "gas";
      readonly gasUrl: string;
      readonly sheetName: string;
    };

/** The four storage deletion scopes exposed by the management UI. */
export type DeleteScope =
  | { readonly type: "circles"; readonly ref: EventDayRef }
  | { readonly type: "activity"; readonly ref: EventDayRef }
  | { readonly type: "event-day"; readonly ref: EventDayRef }
  | { readonly type: "all-events" };

/** Detail payloads for every bubbling management event. */
export interface ManagementEventDetailMap {
  "event-day-select": EventDayRef;
  "event-day-open-request": { ref: EventDayRef };
  "event-day-refresh-request": { ref: EventDayRef };
  "event-day-offline-request": { ref: EventDayRef };
  "event-day-edit-request": { ref: EventDayRef };
  "event-day-delete-request": { ref: EventDayRef };
  "csv-preview-request": { file: File };
  "gas-sheets-request": { gasUrl: string };
  "gas-preview-request": {
    source: GasDataSource;
    mode: "initial" | "replacement" | "refresh";
  };
  "source-preview-apply": { previewId: string };
  "source-preview-cancel": Record<string, never>;
  "gas-retry-request": { ref: EventDayRef | null };
  "delete-option-select": { scope: DeleteScope };
  "gas-discard-request": {
    ref: EventDayRef;
    ids: readonly string[];
    confirmation: string;
  };
  "storage-delete-cancel": Record<string, never>;
  "storage-delete-request": { scope: DeleteScope; confirmation: string };
  "csv-export-request": { ref: EventDayRef };
}

/** Dispatches a typed, bubbling management event from a light-DOM component. */
export function dispatchManagementEvent<
  K extends keyof ManagementEventDetailMap,
>(target: EventTarget, type: K, detail: ManagementEventDetailMap[K]): boolean {
  const event = new CustomEvent(type, {
    bubbles: true,
    composed: true,
    detail,
  });
  return target.dispatchEvent(event);
}
