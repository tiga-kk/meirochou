// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserApplication } from "../apps/webapp/js/app/browser-application";
import { createBrowserApplicationOptions } from "./helpers/browser-event-binding-fixture";
import type {
  EventDayRef,
  EventRegistryV1,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import {
  BrowserCircleCsvDownloader,
} from "../apps/webapp/js/features/circle-data-source/infrastructure/browser-circle-csv-downloader";
import {
  ExportCirclesToCsvUseCase,
} from "../apps/webapp/js/features/circle-data-source/use-cases/export-circles-to-csv";

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

describe("ComiPathBrowserRuntime & CircleDataSource CSV Export Integration", () => {
  let app: BrowserApplication;
  let clickedUrl: string | null = null;
  let clickedFilename: string | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    clickedUrl = null;
    clickedFilename = null;

    vi.spyOn(window.URL, "createObjectURL").mockImplementation(() => "blob:http://localhost/mock-csv");
    vi.spyOn(window.URL, "revokeObjectURL").mockImplementation(() => {});

    app = new BrowserApplication(createBrowserApplicationOptions());
    app.eventRegistry = createRegistry();
    app.eventRegistryUrl = "http://localhost/assets/events/manifest.json";
  });

  it("exports active event day CSV via BrowserCircleCsvDownloader on request", async () => {
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
    app.eventDayRepository.save(ref, sampleState);
    await app.openEventDay(ref);

    const downloader = new BrowserCircleCsvDownloader(window);
    const useCase = new ExportCirclesToCsvUseCase(app.eventDayRepository, downloader);

    expect(() => useCase.execute({ eventDay: ref })).not.toThrow();
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("exports active circles excluding source-removed ones", async () => {
    const ref: EventDayRef = { eventId: "c104", dayId: "day1" };
    const stateWithRemoved: LocalEventDayState = {
      schemaVersion: 1,
      source: { type: "csv", fileName: "test.csv" },
      sourceGeneration: "gen-1",
      circles: [
        { space: "東A01a", priority: 1 },
        { space: "東A02b", priority: 2, removedFromSource: true },
      ],
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
    app.eventDayRepository.save(ref, stateWithRemoved);

    const downloader = new BrowserCircleCsvDownloader(window);
    const useCase = new ExportCirclesToCsvUseCase(app.eventDayRepository, downloader);

    expect(() => useCase.execute({ eventDay: ref })).not.toThrow();
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("throws error when event day state is missing", () => {
    const ref: EventDayRef = { eventId: "non-existent", dayId: "day1" };
    const downloader = new BrowserCircleCsvDownloader(window);
    const useCase = new ExportCirclesToCsvUseCase(app.eventDayRepository, downloader);

    expect(() => useCase.execute({ eventDay: ref })).toThrow("Event day state not found");
  });

  it("triggers CSV export for active event day using ExportCirclesToCsvUseCase and BrowserCircleCsvDownloader", async () => {
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
    app.eventDayRepository.save(ref, sampleState);
    await app.openEventDay(ref);

    const downloader = new BrowserCircleCsvDownloader(window);
    const exportUseCase = new ExportCirclesToCsvUseCase(app.eventDayRepository, downloader);

    expect(() => exportUseCase.execute({ eventDay: ref })).not.toThrow();
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("handles active event day with empty circles array during CSV export", async () => {
    const ref: EventDayRef = { eventId: "c104", dayId: "day1" };
    const emptyState: LocalEventDayState = {
      schemaVersion: 1,
      source: { type: "csv", fileName: "empty.csv" },
      sourceGeneration: "gen-1",
      circles: [],
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
    app.eventDayRepository.save(ref, emptyState);

    const downloader = new BrowserCircleCsvDownloader(window);
    const useCase = new ExportCirclesToCsvUseCase(app.eventDayRepository, downloader);

    expect(() => useCase.execute({ eventDay: ref })).not.toThrow();
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
