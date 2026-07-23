// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { GasApiClient } from "../apps/webapp/js/api/gas-api-client";
import {
  GasRefreshService,
  StaleGasPreviewError,
} from "../apps/webapp/js/data/gas-refresh-service";
import { DataManager } from "../apps/webapp/js/data-manager";
import { EventDayRepository } from "../apps/webapp/js/state/event-day-repository";
import { SourceSettingsService } from "../apps/webapp/js/state/source-settings-service";
import {
  type StorageAdapter,
  StorageService,
} from "../apps/webapp/js/state/storage-service";
import type {
  EventDayRef,
  EventRegistryV1,
  GasDataSource,
  LocalEventDayState,
} from "../apps/webapp/js/types/domain";

class MockStorageAdapter implements StorageAdapter {
  public map = new Map<string, string>();
  public failWrites = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("storage quota exceeded");
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function createRegistry(): EventRegistryV1 {
  return {
    schemaVersion: 1,
    events: [
      {
        eventId: "C108",
        displayName: "Comiket 108",
        mapBundle: "demo-v1",
        days: [
          { dayId: "day1", displayName: "1日目" },
          { dayId: "day2", displayName: "2日目" },
        ],
      },
    ],
  };
}

function createTestSetup(adapter = new MockStorageAdapter()) {
  let now = new Date("2026-07-21T07:45:00.000Z");
  let generationCount = 0;
  let previewCount = 0;

  const storage = new StorageService(adapter);
  const repository = new EventDayRepository(storage);
  const sourceSettings = new SourceSettingsService(repository);
  const client = new GasApiClient({ fetch: vi.fn() });

  const serviceOptions = {
    now: () => now,
    createSourceGeneration: () => `gen-${++generationCount}`,
    createPreviewId: () => `prev-${++previewCount}`,
    previewTtlMs: 1000,
  };

  const service = new GasRefreshService(
    repository,
    client,
    sourceSettings,
    serviceOptions,
  );

  const manager = new DataManager(storage, {
    ...serviceOptions,
    client,
    repository,
    sourceSettings,
    refreshService: service,
  });
  manager.eventRegistry = createRegistry();

  const advanceTime = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };

  return {
    adapter,
    repository,
    sourceSettings,
    client,
    service,
    manager,
    advanceTime,
    getNow: () => now,
  };
}

describe("Phase 3 Task 4: GasRefreshService and DataManager integration", () => {
  test("Step 1: opening cached CSV/GAS states makes zero GET calls", async () => {
    const { manager, client, repository } = createTestSetup();
    const fetchCirclesSpy = vi.spyOn(client, "fetchCircles");
    const fetchSheetListSpy = vi.spyOn(client, "fetchSheetList");

    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };

    // Initial empty CSV open
    await manager.openEventDay(ref);
    expect(fetchCirclesSpy).not.toHaveBeenCalled();
    expect(fetchSheetListSpy).not.toHaveBeenCalled();

    // Prepare cached GAS state
    const gasState: LocalEventDayState = {
      schemaVersion: 1,
      source: {
        type: "gas",
        gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
        sheetName: "Day1",
      },
      sourceGeneration: "gen-100",
      circles: [{ space: "A-01", priority: 1 }],
      purchased: [],
      hold: [],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    };
    repository.save(ref, gasState);

    await manager.openEventDay(ref);
    expect(fetchCirclesSpy).not.toHaveBeenCalled();
    expect(fetchSheetListSpy).not.toHaveBeenCalled();
  });

  test("Step 2: initial preview/apply flow", async () => {
    const { manager, client, repository } = createTestSetup();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);
    const saveSpy = vi.spyOn(repository, "save");

    const gasSource: GasDataSource = {
      type: "gas",
      gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
      sheetName: "Day1",
    };
    const expectedSource = { ...gasSource };
    const mutableSource = gasSource as {
      type: "gas";
      gasUrl: string;
      sheetName: string;
    };

    vi.spyOn(client, "fetchCircles").mockResolvedValueOnce({
      circles: [
        { space: "A-01", priority: 1, isSale: "x" },
        { space: "B-02", priority: 2 },
      ],
      spreadsheetTitle: "My Comiket List",
    });

    const preview = await manager.previewInitialGasImport(ref, gasSource);
    mutableSource.gasUrl =
      "https://script.google.com/macros/s/AKfycbx_mutated/exec";

    expect(preview.mode).toBe("initial");
    expect(preview.replacementOperation).toBe("gas-initial-import");
    expect(preview.spreadsheetTitle).toBe("My Comiket List");
    expect(preview.diff.added).toHaveLength(2);
    expect(repository.load(ref)?.source.type).toBe("csv"); // no change before apply

    const applied = manager.applyGasPreview(preview.previewId);

    expect(applied.source).toEqual(expectedSource);
    expect(applied.sourceGeneration).toBe("gen-2");
    expect(applied.circles).toHaveLength(2);
    expect(applied.purchased).toEqual(["A-01"]);
    expect(applied.history).toHaveLength(1);
    expect(applied.history[0].type).toBe("purchase");
    expect(applied.history[0].space).toBe("A-01");
    expect(saveSpy).toHaveBeenCalledTimes(1);

    // Preview removed after apply
    expect(() => manager.applyGasPreview(preview.previewId)).toThrow(
      StaleGasPreviewError,
    );
  });

  test("Step 2: initial import eligibility check", async () => {
    const { service, repository } = createTestSetup();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    const gasSource: GasDataSource = {
      type: "gas",
      gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
      sheetName: "Day1",
    };

    // State is non-empty CSV (has circles)
    const state: LocalEventDayState = {
      schemaVersion: 1,
      source: { type: "csv", fileName: "day1.csv" },
      sourceGeneration: "gen-0",
      circles: [{ space: "A-01", priority: 1 }],
      purchased: [],
      hold: [],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    };
    repository.save(ref, state);

    await expect(service.previewInitialImport(ref, gasSource)).rejects.toThrow(
      "Initial GAS import requires an empty sentinel state",
    );
  });

  test("Step 3: refresh preview/apply flow for existing GAS source", async () => {
    const { manager, client, repository } = createTestSetup();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };

    const gasSource: GasDataSource = {
      type: "gas",
      gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
      sheetName: "Day1",
    };

    const initialGasState: LocalEventDayState = {
      schemaVersion: 1,
      source: gasSource,
      sourceGeneration: "gen-10",
      circles: [
        { space: "A-01", priority: 1 },
        { space: "B-01", priority: 2 },
      ],
      purchased: ["A-01"],
      hold: ["B-01"],
      history: [
        {
          type: "purchase",
          space: "A-01",
          timestamp: "2026-07-21T07:45:00.000Z",
        },
      ],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    };
    repository.save(ref, initialGasState);
    await manager.openEventDay(ref);

    vi.spyOn(client, "fetchCircles").mockResolvedValueOnce({
      circles: [
        { space: "A-01", priority: 5 }, // updated
        { space: "C-01", priority: 1, isSale: "x" }, // added with isSale
      ],
      spreadsheetTitle: "My Comiket List Updated",
    });

    const preview = await manager.previewGasRefresh(ref);
    expect(preview.mode).toBe("refresh");
    expect(preview.replacementOperation).toBeNull();
    expect(preview.expectedSourceGeneration).toBe("gen-10");
    expect(preview.diff.updated).toHaveLength(1);
    expect(preview.diff.added).toHaveLength(1);
    expect(preview.diff.removed).toHaveLength(1); // B-01 removed from remote

    const applied = manager.applyGasPreview(preview.previewId);

    // Generation remains same on refresh!
    expect(applied.sourceGeneration).toBe("gen-10");
    // Local purchases/holds preserved
    expect(applied.purchased).toEqual(["A-01"]);
    expect(applied.hold).toEqual(["B-01"]);
    // circles updated
    expect(applied.circles).toEqual([
      { space: "A-01", priority: 5 },
      { space: "C-01", priority: 1, isSale: "x" },
      { space: "B-01", priority: 2, removedFromSource: true },
    ]);
  });

  test("Step 3: replacement preview/apply (CSV to GAS & GAS URL/sheet change)", async () => {
    const { manager, client, repository } = createTestSetup();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };

    const initialGasState: LocalEventDayState = {
      schemaVersion: 1,
      source: {
        type: "gas",
        gasUrl: "https://script.google.com/macros/s/AKfycbx_old/exec",
        sheetName: "Day1",
      },
      sourceGeneration: "gen-5",
      circles: [{ space: "A-01", priority: 1 }],
      purchased: ["A-01"],
      hold: [],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    };
    repository.save(ref, initialGasState);
    await manager.openEventDay(ref);

    // URL change replacement
    const newSource: GasDataSource = {
      type: "gas",
      gasUrl: "https://script.google.com/macros/s/AKfycbx_new/exec",
      sheetName: "Day1",
    };

    vi.spyOn(client, "fetchCircles").mockResolvedValueOnce({
      circles: [{ space: "A-01", priority: 1 }],
      spreadsheetTitle: "New List",
    });

    const preview = await manager.previewGasSourceReplacement(ref, newSource);
    expect(preview.mode).toBe("replacement");
    expect(preview.replacementOperation).toBe("gas-url-change");

    const applied = manager.applyGasPreview(preview.previewId);
    expect(applied.source).toEqual(newSource);
    expect(applied.sourceGeneration).toBe("gen-1"); // Mints new generation
  });

  test("Step 4: stale and failure cases", async () => {
    const { manager, client, repository, advanceTime } = createTestSetup();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };

    const gasSource: GasDataSource = {
      type: "gas",
      gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
      sheetName: "Day1",
    };

    const initialGasState: LocalEventDayState = {
      schemaVersion: 1,
      source: gasSource,
      sourceGeneration: "gen-1",
      circles: [{ space: "A-01", priority: 1 }],
      purchased: [],
      hold: [],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    };
    repository.save(ref, initialGasState);
    await manager.openEventDay(ref);

    vi.spyOn(client, "fetchCircles").mockResolvedValue({
      circles: [{ space: "A-01", priority: 2 }],
      spreadsheetTitle: "List",
    });

    // 1. Expired preview
    const previewExpired = await manager.previewGasRefresh(ref);
    advanceTime(1001); // ttl is 1000ms
    expect(() => manager.applyGasPreview(previewExpired.previewId)).toThrow(
      "GAS refresh preview has expired",
    );

    // 2. Source generation change after preview
    const previewStale = await manager.previewGasRefresh(ref);
    // Mutate state generation
    repository.save(ref, {
      ...initialGasState,
      sourceGeneration: "gen-2",
    });
    expect(() => manager.applyGasPreview(previewStale.previewId)).toThrow(
      StaleGasPreviewError,
    );

    // 3. Source circles fingerprint changed (e.g. circle added directly or by another source replacement)
    repository.save(ref, {
      ...initialGasState,
      circles: [{ space: "A-01", priority: 99 }],
    });
    const previewCircleStale = await manager.previewGasRefresh(ref);
    // Mutate circles again
    repository.save(ref, {
      ...initialGasState,
      circles: [{ space: "A-01", priority: 100 }],
    });
    expect(() => manager.applyGasPreview(previewCircleStale.previewId)).toThrow(
      "Source snapshot fingerprint mismatch",
    );

    // 4. Pending outbox inserted after preview
    repository.save(ref, initialGasState);
    const previewOutbox = await manager.previewGasRefresh(ref);
    repository.save(ref, {
      ...initialGasState,
      gasOutbox: [
        {
          id: "outbox-1",
          eventId: "C108",
          dayId: "day1",
          sourceGeneration: "gen-1",
          gasUrl: gasSource.gasUrl,
          sheetName: gasSource.sheetName,
          space: "A-01",
          purchased: true,
          createdAt: "2026-07-21T07:45:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    });
    expect(() => manager.applyGasPreview(previewOutbox.previewId)).toThrow(
      "blocked by 1 pending outbox entries",
    );
  });

  test("Step 4: cancelPreview works as expected", async () => {
    const { manager, client, repository } = createTestSetup();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };

    const gasSource: GasDataSource = {
      type: "gas",
      gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
      sheetName: "Day1",
    };
    repository.save(ref, {
      schemaVersion: 1,
      source: gasSource,
      sourceGeneration: "gen-1",
      circles: [],
      purchased: [],
      hold: [],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    });

    vi.spyOn(client, "fetchCircles").mockResolvedValueOnce({
      circles: [{ space: "A-01", priority: 1 }],
      spreadsheetTitle: "Title",
    });

    const preview = await manager.previewGasRefresh(ref);
    manager.cancelGasPreview(preview.previewId);

    expect(() => manager.applyGasPreview(preview.previewId)).toThrow(
      StaleGasPreviewError,
    );
  });

  test("Step 4: repository save failure keeps state and preview available", async () => {
    const { manager, client, repository, adapter } = createTestSetup();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    const gasSource: GasDataSource = {
      type: "gas",
      gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
      sheetName: "Day1",
    };

    await manager.openEventDay(ref);
    const before = repository.load(ref);
    vi.spyOn(client, "fetchCircles").mockResolvedValueOnce({
      circles: [{ space: "A-01", priority: 1 }],
      spreadsheetTitle: "Title",
    });

    const preview = await manager.previewInitialGasImport(ref, gasSource);
    adapter.failWrites = true;
    expect(() => manager.applyGasPreview(preview.previewId)).toThrow();
    adapter.failWrites = false;

    expect(repository.load(ref)).toEqual(before);
    expect(() => manager.applyGasPreview(preview.previewId)).not.toThrow();
  });
});
