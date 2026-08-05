import { describe, expect, it, vi } from "vitest";
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
    const fixedDate = new Date(2026, 6, 5, 9, 4, 8); // 2026-07-05 09:04:08
    const useCase = new ExportCirclesToCsvUseCase(repo, mockDownloader, {
      now: () => fixedDate,
    });

    useCase.execute({ eventDay: { eventId: "c104", dayId: "day1" } });

    expect(downloadedFilename).toBe("comipath-c104-day1-20260705-090408.csv");
  });

  it("handles valid eventId and dayId boundaries at 1 and 64 characters", () => {
    const state: LocalEventDayState = {
      schemaVersion: 2,
      source: { type: "csv", fileName: "circles.csv" },
      sourceGeneration: "gen-1",
      circles: [{ space: "東A01a", priority: 1 }],
      circleStates: {},
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
    const fixedDate = new Date(2026, 6, 25, 12, 0, 0);
    const useCase = new ExportCirclesToCsvUseCase(repo, mockDownloader, {
      now: () => fixedDate,
    });

    const maxRef = {
      eventId: "a".repeat(64),
      dayId: "b".repeat(64),
    };
    useCase.execute({ eventDay: maxRef });

    expect(downloadedFilename).toBe(
      `comipath-${"a".repeat(64)}-${"b".repeat(64)}-20260725-120000.csv`,
    );
  });

  it("filters out source-removed circles during CSV export while passing purchased states", () => {
    const state: LocalEventDayState = {
      schemaVersion: 2,
      source: { type: "csv", fileName: "circles.csv" },
      sourceGeneration: "gen-1",
      circles: [
        { space: "東A01a", priority: 1 },
        { space: "東A02b", priority: 2, removedFromSource: true },
      ],
      circleStates: { 東A01a: "purchased" },
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
      },
    };

    let exportedCircles: readonly any[] = [];
    let exportedPurchased: ReadonlySet<string> = new Set();
    const mockDownloader = {
      downloadCirclesAsCsv: (
        _filename: string,
        circles: readonly any[],
        purchased: ReadonlySet<string>,
      ) => {
        exportedCircles = circles;
        exportedPurchased = purchased;
      },
    };

    const repo = { load: () => state };
    const useCase = new ExportCirclesToCsvUseCase(repo, mockDownloader);

    useCase.execute({ eventDay: { eventId: "c104", dayId: "day1" } });

    expect(exportedCircles).toHaveLength(1);
    expect(exportedCircles[0].space).toBe("東A01a");
    expect(exportedPurchased.has("東A01a")).toBe(true);
  });

  it("throws an explicit error when event day state is not found", () => {
    const repo = { load: () => null };
    const mockDownloader = { downloadCirclesAsCsv: vi.fn() };
    const useCase = new ExportCirclesToCsvUseCase(repo, mockDownloader);

    expect(() =>
      useCase.execute({ eventDay: { eventId: "missing", dayId: "day1" } }),
    ).toThrow("Event day state not found");
    expect(mockDownloader.downloadCirclesAsCsv).not.toHaveBeenCalled();
  });

  it("BrowserCircleCsvDownloader creates Blob with UTF-8 MIME, appends link to body, clicks, and revokes URL", () => {
    let createdBlob: Blob | null = null;
    const calls: string[] = [];

    const mockLink = {
      href: "",
      download: "",
      click: () => calls.push("click"),
    };

    const mockWindow = {
      URL: {
        createObjectURL: (blob: Blob) => {
          createdBlob = blob;
          calls.push("createObjectURL");
          return "blob:http://localhost/mock-url";
        },
        revokeObjectURL: (url: string) => {
          calls.push(`revoke:${url}`);
        },
      },
      document: {
        createElement: (tag: string) => {
          calls.push(`createElement:${tag}`);
          return mockLink as any;
        },
        body: {
          appendChild: (el: any) => {
            calls.push("appendChild");
            return el;
          },
          removeChild: (el: any) => {
            calls.push("removeChild");
            return el;
          },
        },
      },
    } as unknown as Window & typeof globalThis;

    const downloader = new BrowserCircleCsvDownloader(mockWindow);
    downloader.downloadCirclesAsCsv(
      "export.csv",
      [{ space: "東A01a", priority: 1 }],
      new Set(["東A01a"]),
    );

    expect(createdBlob).not.toBeNull();
    expect(createdBlob?.type).toBe("text/csv;charset=utf-8;");
    expect(mockLink.download).toBe("export.csv");
    expect(calls).toEqual([
      "createObjectURL",
      "createElement:a",
      "appendChild",
      "click",
      "removeChild",
      "revoke:blob:http://localhost/mock-url",
    ]);
  });

  it("BrowserCircleCsvDownloader revokes ObjectURL even if link click throws an error", () => {
    const calls: string[] = [];
    const mockLink = {
      href: "",
      download: "",
      click: () => {
        calls.push("click");
        throw new Error("Click failed");
      },
    };

    const mockWindow = {
      URL: {
        createObjectURL: () => {
          calls.push("createObjectURL");
          return "blob:http://localhost/mock-url";
        },
        revokeObjectURL: (url: string) => {
          calls.push(`revoke:${url}`);
        },
      },
      document: {
        createElement: () => mockLink as any,
        body: {
          appendChild: () => {},
          removeChild: () => {},
        },
      },
    } as unknown as Window & typeof globalThis;

    const downloader = new BrowserCircleCsvDownloader(mockWindow);

    expect(() =>
      downloader.downloadCirclesAsCsv("export.csv", [], new Set()),
    ).toThrow("Click failed");

    expect(calls).toEqual(["createObjectURL", "click", "revoke:blob:http://localhost/mock-url"]);
  });

  it("BrowserCircleCsvDownloader handles empty circles list correctly", () => {
    const mockWindow = {
      URL: {
        createObjectURL: () => "blob:mock",
        revokeObjectURL: () => {},
      },
      document: {
        createElement: () => ({ href: "", download: "", click: () => {} } as any),
        body: {
          appendChild: () => {},
          removeChild: () => {},
        },
      },
    } as unknown as Window & typeof globalThis;

    const downloader = new BrowserCircleCsvDownloader(mockWindow);
    expect(() =>
      downloader.downloadCirclesAsCsv("empty.csv", [], new Set()),
    ).not.toThrow();
  });
});
