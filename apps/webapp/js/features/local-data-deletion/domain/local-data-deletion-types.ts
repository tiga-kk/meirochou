import type { EventDayRef } from "../../event-day/public-api";

export type LocalDataDeletionScope =
  | { readonly kind: "circle-source"; readonly eventDay: EventDayRef }
  | { readonly kind: "activity"; readonly eventDay: EventDayRef }
  | { readonly kind: "event-day"; readonly eventDay: EventDayRef }
  | { readonly kind: "all-event-days" };
