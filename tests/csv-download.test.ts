import { describe, expect, it } from "vitest";
import {
  BrowserCircleCsvDownloader,
} from "../apps/webapp/js/features/circle-data-source/infrastructure/browser-circle-csv-downloader";
import {
  ExportCirclesToCsvUseCase,
} from "../apps/webapp/js/features/circle-data-source/use-cases/export-circles-to-csv";
import type { LocalEventDayState } from "../apps/webapp/js/features/event-day/public-api";

describe("ExportCirclesToCsvUseCase & BrowserCircleCsvDownloader Unit", () => {
  it("formats export filename deterministically with date-time stamp", () => {
    const state: LocalEventDayState = {
      schemaVersion: 2,
      source: { type: "csv", fileName: "circles.csv" },
      sourceGeneration: "gen-1",
      circles: [{ space: "東A01a", priority: 1 }],
      circleStates: { 東A01a: "purchased" },
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
      },
    };

    let downloadedFilename = "";
    const mockDownloader = {
      downloadCirclesAsCsv: (filename: string) => {
        downloadedFilename = filename;
      },
    };

    const repo = { load: () => state };
    const fixedDate = new Date(2026, 6, 25, 14, 30, 0); // 2026-07-25 14:30:00
    const useCase = new ExportCirclesToCsvUseCase(repo, mockDownloader, {
      now: () => fixedDate,
    });

    useCase.execute({ eventDay: { eventId: "c104", dayId: "day1" } });

    expect(downloadedFilename).toBe("comipath-c104-day1-20260725-143000.csv");
  });

  it("filters out source-removed circles during CSV export", () => {
    const state: LocalEventDayState = {
      schemaVersion: 2,
      source: { type: "csv", fileName: "circles.csv" },
      sourceGeneration: "gen-1",
      circles: [
        { space: "東A01a", priority: 1 },
        { space: "東A02b", priority: 2, removedFromSource: true },
      ],
      circleStates: {},
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
      },
    };

    let exportedCircles: readonly any[] = [];
    const mockDownloader = {
      downloadCirclesAsCsv: (_filename: string, circles: readonly any[]) => {
        exportedCircles = circles;
      },
    };

    const repo = { load: () => state };
    const useCase = new ExportCirclesToCsvUseCase(repo, mockDownloader);

    useCase.execute({ eventDay: { eventId: "c104", dayId: "day1" } });

    expect(exportedCircles).toHaveLength(1);
    expect(exportedCircles[0].space).toBe("東A01a");
  });
});
