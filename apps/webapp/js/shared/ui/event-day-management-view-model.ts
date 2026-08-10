import type { CatalogOfflineCachePort } from "../../features/catalog-offline/public-api";
import { catalogUrlsFromCircles } from "../../features/catalog-offline/public-api";
import type {
  EventDayRef,
  EventRegistry,
  LocalEventDayState,
} from "../../features/event-day/public-api";
import { buildEventDayOptions } from "./management-view-model";

export interface EventDayManagementRow {
  readonly ref: EventDayRef;
  readonly eventLabel: string;
  readonly dayLabel: string;
  readonly configured: boolean;
  readonly selected: boolean;
  readonly sourceType: "csv" | "gas" | "none";
  readonly sourceLabel: string;
  readonly sourceEndpointSummary: string | null;
  readonly circleCount: number;
  readonly pendingGasCount: number;
  readonly offlineCatalog: {
    readonly cached: number | null;
    readonly total: number;
  };
}

export interface BuildEventDayManagementRowsInput {
  readonly registry: EventRegistry;
  readonly states: readonly { ref: EventDayRef; state: LocalEventDayState }[];
  readonly selected: EventDayRef | null;
  readonly offlineCache: CatalogOfflineCachePort;
}

function stateKey(ref: EventDayRef): string {
  return `${ref.eventId}:${ref.dayId}`;
}

function sourceSummary(state: LocalEventDayState): Pick<
  EventDayManagementRow,
  "sourceType" | "sourceLabel" | "sourceEndpointSummary"
> {
  if (state.source.type === "csv") {
    return {
      sourceType: "csv",
      sourceLabel: state.source.fileName,
      sourceEndpointSummary: null,
    };
  }

  let endpoint = "script.google.com";
  try {
    endpoint = new URL(state.source.gasUrl).hostname || endpoint;
  } catch {
    // Keep the safe default instead of exposing the configured URL.
  }
  return {
    sourceType: "gas",
    sourceLabel: state.source.sheetName,
    sourceEndpointSummary: endpoint,
  };
}

export async function buildEventDayManagementRows(
  input: BuildEventDayManagementRowsInput,
): Promise<readonly EventDayManagementRow[]> {
  const stateMap = new Map(input.states.map((item) => [stateKey(item.ref), item.state]));
  const options = buildEventDayOptions(input.registry, input.states, input.selected);

  return Promise.all(
    options.map(async (option) => {
      const ref = { eventId: option.eventId, dayId: option.dayId };
      const state = stateMap.get(stateKey(ref));
      if (!state || !option.configured) {
        return Object.freeze({
          ref: Object.freeze(ref),
          eventLabel: option.eventLabel,
          dayLabel: option.dayLabel,
          configured: false,
          selected: option.selected,
          sourceType: "none" as const,
          sourceLabel: "未設定",
          sourceEndpointSummary: null,
          circleCount: 0,
          pendingGasCount: 0,
          offlineCatalog: Object.freeze({ cached: 0, total: 0 }),
        });
      }

      const urls = catalogUrlsFromCircles(state.circles);
      let offlineCatalog: EventDayManagementRow["offlineCatalog"];
      try {
        offlineCatalog = await input.offlineCache.getStatus(urls);
      } catch {
        offlineCatalog = { cached: null, total: urls.length };
      }
      return Object.freeze({
        ref: Object.freeze(ref),
        eventLabel: option.eventLabel,
        dayLabel: option.dayLabel,
        configured: true,
        selected: option.selected,
        ...sourceSummary(state),
        circleCount: state.circles.filter(
          (circle) => circle.removedFromSource !== true,
        ).length,
        pendingGasCount: state.gasOutbox.length,
        offlineCatalog: Object.freeze(offlineCatalog),
      });
    }),
  );
}
