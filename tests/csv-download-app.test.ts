// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComiPathBrowserRuntime } from "../apps/webapp/js/comipath-browser-runtime";
import type {
  EventDayRef,
  EventRegistryV1,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import type { DownloadAdapter } from "../apps/webapp/js/ui/csv-download";

function createRegistry(): EventRegistryV1 {
  return {
    schemaVersion: 1,
    events: [
      {
        eventId: "c104",
        displayName: "C104",
        mapBundle: "demo-v1",
        days: [{ dayId: "day1", displayName: "1日目" }],
      },
    ],
  };
}

describe("ComiPathBrowserRuntime CSV Export Integration", () => {
  let app: ComiPathBrowserRuntime;
  let mockAdapter: DownloadAdapter;
  let clickedUrl: string | null = null;
  let clickedFilename: string | null = null;

  beforeEach(() => {
    clickedUrl = null;
    clickedFilename = null;
    mockAdapter = {
      createObjectURL: vi.fn((_blob: Blob) => "blob:http://localhost/mock-csv"),
      revokeObjectURL: vi.fn(),
      click: vi.fn((url: string, filename: string) => {
        clickedUrl = url;
        clickedFilename = filename;
      }),
    };

    app = new ComiPathBrowserRuntime();
    app.dm.eventRegistry = createRegistry();
    app.downloadAdapter = mockAdapter;
    app.ui.showToast = vi.fn();
    app.ui.updateSettingsState = vi.fn();
  });

  it("exports active event day CSV via injected downloadAdapter on request", async () => {
    const ref: EventDayRef = { eventId: "c104", dayId: "day1" };
    const sampleState: LocalEventDayState = {
      schemaVersion: 1,
      source: { type: "csv", fileName: "test.csv" },
      sourceGeneration: "gen-1",
      circles: [{ space: "東A01a", priority: 1 }],
      purchased: ["東A01a"],
      hold: [],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
      },
    };
    app.dm.repository.save(ref, sampleState);
    await app.dm.openEventDay(ref);

    app.handleCsvExportRequest(ref);

    expect(mockAdapter.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mockAdapter.click).toHaveBeenCalledTimes(1);
    expect(mockAdapter.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedUrl).toBe("blob:http://localhost/mock-csv");
    expect(clickedFilename).toMatch(/^comipath-c104-day1-\d{8}-\d{6}\.csv$/);
    expect(app.ui.showToast).toHaveBeenCalledWith("CSVをダウンロードしました");
  });

  it("does not export when activeCircleCount is 0", async () => {
    const ref: EventDayRef = { eventId: "c104", dayId: "day1" };
    const emptyState: LocalEventDayState = {
      schemaVersion: 1,
      source: { type: "csv", fileName: "empty.csv" },
      sourceGeneration: "gen-1",
      circles: [{ space: "東A01a", priority: 1, removedFromSource: true }],
      purchased: [],
      hold: [],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
      },
    };
    app.dm.repository.save(ref, emptyState);
    await app.dm.openEventDay(ref);

    app.handleCsvExportRequest(ref);

    expect(mockAdapter.createObjectURL).not.toHaveBeenCalled();
    expect(app.ui.showToast).not.toHaveBeenCalled();
  });

  it("ignores an export request for a stale event/day ref", async () => {
    const activeRef: EventDayRef = { eventId: "c104", dayId: "day1" };
    const staleRef: EventDayRef = { eventId: "c104", dayId: "day2" };
    const state: LocalEventDayState = {
      schemaVersion: 1,
      source: { type: "csv", fileName: "test.csv" },
      sourceGeneration: "gen-1",
      circles: [{ space: "東A01a", priority: 1 }],
      purchased: [],
      hold: [],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
      },
    };
    app.dm.repository.save(activeRef, state);
    await app.dm.openEventDay(activeRef);

    app.handleCsvExportRequest(staleRef);

    expect(mockAdapter.createObjectURL).not.toHaveBeenCalled();
    expect(app.ui.showToast).not.toHaveBeenCalled();
  });
});
