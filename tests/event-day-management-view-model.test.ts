import { describe, expect, it, vi } from "vitest";
import type { CatalogOfflineCachePort } from "../apps/webapp/js/features/catalog-offline/public-api";
import type { EventRegistry, EventDayRef, LocalEventDayState } from "../apps/webapp/js/features/event-day/public-api";
import { buildEventDayManagementRows } from "../apps/webapp/js/shared/ui/event-day-management-view-model";

const registry: EventRegistry = {
  schemaVersion: 1,
  events: [
    {
      eventId: "C108",
      displayName: "コミケ108",
      mapBundle: "../maps/C108/manifest.json",
      days: [
        { dayId: "day1", displayName: "1日目" },
        { dayId: "day2", displayName: "2日目" },
      ],
    },
  ],
};

function state(source: LocalEventDayState["source"], circles: LocalEventDayState["circles"], gasOutbox = []): LocalEventDayState {
  return {
    schemaVersion: 2,
    source,
    sourceGeneration: "generation-1",
    circles,
    circleStates: {},
    gasOutbox,
    timestamps: {
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      sourceUpdatedAt: "2026-08-10T00:00:00.000Z",
    },
  };
}

describe("buildEventDayManagementRows", () => {
  it("keeps registry order and includes an unconfigured day", async () => {
    const offlineCache: CatalogOfflineCachePort = {
      getStatus: vi.fn(async () => ({ cached: 1, total: 1 })),
      cacheAll: vi.fn(),
      remove: vi.fn(),
    };
    const day1: EventDayRef = { eventId: "C108", dayId: "day1" };
    const rows = await buildEventDayManagementRows({
      registry,
      states: [
        {
          ref: day1,
          state: state(
            { type: "csv", fileName: "circles.csv" },
            [{ space: "東A01a", tweet: "https://example.test/catalog.png" }],
            [{ id: "pending-1" } as never],
          ),
        },
      ],
      selected: day1,
      offlineCache,
    });

    expect(rows.map((row) => `${row.ref.eventId}:${row.ref.dayId}`)).toEqual([
      "C108:day1",
      "C108:day2",
    ]);
    expect(rows[0]).toMatchObject({
      configured: true,
      selected: true,
      sourceType: "csv",
      sourceLabel: "circles.csv",
      circleCount: 1,
      pendingGasCount: 1,
    });
    expect(rows[1]).toMatchObject({
      configured: false,
      sourceType: "none",
      circleCount: 0,
      pendingGasCount: 0,
      offlineCatalog: { cached: 0, total: 0 },
    });
    expect(offlineCache.getStatus).toHaveBeenCalledTimes(1);
  });

  it("summarizes GAS safely and distinguishes zero status from status failure", async () => {
    const gasRef = { eventId: "C108", dayId: "day1" };
    const offlineCache: CatalogOfflineCachePort = {
      getStatus: vi.fn(async (urls) => {
        if (urls[0]?.includes("failed")) throw new Error("storage unavailable");
        return { cached: 0, total: urls.length };
      }),
      cacheAll: vi.fn(),
      remove: vi.fn(),
    };
    const rows = await buildEventDayManagementRows({
      registry,
      states: [
        {
          ref: gasRef,
          state: state(
            {
              type: "gas",
              gasUrl: "https://script.google.com/macros/s/secret/exec",
              sheetName: "day1-sheet",
            },
            [
              { space: "東A01a", tweet: "https://example.test/failed.png" },
              { space: "東A02a", tweet: "https://example.test/failed.png", removedFromSource: true },
              { space: "東A03a", tweet: "not-a-url" },
            ],
          ),
        },
      ],
      selected: null,
      offlineCache,
    });

    expect(rows[0]).toMatchObject({
      sourceType: "gas",
      sourceLabel: "day1-sheet",
      sourceEndpointSummary: "script.google.com",
      circleCount: 2,
      offlineCatalog: { cached: null, total: 1 },
    });

    const zeroRows = await buildEventDayManagementRows({
      registry,
      states: [
        {
          ref: gasRef,
          state: state(
            { type: "gas", gasUrl: "https://script.google.com/macros/s/secret/exec", sheetName: "day1" },
            [{ space: "東A01a", tweet: "https://example.test/zero.png" }],
          ),
        },
      ],
      selected: null,
      offlineCache: {
        ...offlineCache,
        getStatus: vi.fn(async () => ({ cached: 0, total: 1 })),
      },
    });
    expect(zeroRows[0].offlineCatalog).toEqual({ cached: 0, total: 1 });
  });
});
