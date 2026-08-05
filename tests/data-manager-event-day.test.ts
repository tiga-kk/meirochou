// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { ComiPathBrowserRuntime } from "../apps/webapp/js/comipath-browser-runtime";
import { EventDayDataStore } from "../apps/webapp/js/event-day-data-store";
import {
  ApplyCircleDataPreviewUseCase,
  type CircleDataPreview,
  ExportCirclesToCsvUseCase,
  PreviewCsvImportUseCase,
  serializeCircleCsv,
} from "../apps/webapp/js/features/circle-data-source/public-api";
import type {
  EventDayRef,
  EventRegistryV1,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import { getCircleVisitState } from "../apps/webapp/js/state/storage-schema";
import {
  type StorageAdapter,
  StorageService,
} from "../apps/webapp/js/state/storage-service";

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

function createManager(adapter = new MockStorageAdapter()): {
  adapter: MockStorageAdapter;
  manager: EventDayDataStore & {
    previewCsvReplacement: (
      ref: EventDayRef,
      fileName: string,
      text: string,
    ) => Promise<
      CircleDataPreview & {
        fileName: string;
        incomingHash: string;
        text: string;
      }
    >;
    applyCsvReplacement: (previewId: string) => Promise<LocalEventDayState>;
    cancelCsvPreview: (previewId: string) => void;
    exportCsv: (ref: EventDayRef) => string;
    csvPreviews: Map<
      string,
      CircleDataPreview & {
        fileName: string;
        incomingHash: string;
        text: string;
      }
    >;
  };
} {
  let now = new Date("2026-07-21T07:45:00.000Z");
  let generation = 0;
  const storage = new StorageService(adapter);
  const manager = new EventDayDataStore(storage, {
    now: () => now,
    createSourceGeneration: () => `generation-${++generation}`,
  });
  manager.eventRegistry = createRegistry();

  const previews = new Map<
    string,
    CircleDataPreview & { fileName: string; incomingHash: string; text: string }
  >();
  const hash = (text: string): string => {
    let value = 0x811c9dc5;
    for (const character of text) {
      value ^= character.charCodeAt(0);
      value = Math.imul(value, 0x01000193);
    }
    return (value >>> 0).toString(16).padStart(8, "0");
  };
  let previewSequence = 0;
  const previewUseCase = new PreviewCsvImportUseCase(manager.repository, {
    now: () => now.toISOString(),
    createPreviewId: () => `preview-${++previewSequence}`,
    previewTtlMs: 1_000,
  });
  const applyUseCase = new ApplyCircleDataPreviewUseCase(
    manager.repository,
    manager.activeEventDaySession,
    { invalidateAfterCircleSourceChange: vi.fn() },
    {
      now: () => now.toISOString(),
      createSourceGeneration: () => `generation-${++generation}`,
    },
  );
  const sourceManager = manager as EventDayDataStore & {
    previewCsvReplacement: (
      ref: EventDayRef,
      fileName: string,
      text: string,
    ) => Promise<
      CircleDataPreview & {
        fileName: string;
        incomingHash: string;
        text: string;
      }
    >;
    applyCsvReplacement: (previewId: string) => Promise<LocalEventDayState>;
    cancelCsvPreview: (previewId: string) => void;
    exportCsv: (ref: EventDayRef) => string;
    csvPreviews: Map<
      string,
      CircleDataPreview & {
        fileName: string;
        incomingHash: string;
        text: string;
      }
    >;
  };
  sourceManager.csvPreviews = previews;
  sourceManager.previewCsvReplacement = async (ref, fileName, text) => {
    const preview = previewUseCase.execute({ eventDay: ref, fileName, text });
    const record = { ...preview, fileName, incomingHash: hash(text), text };
    previews.set(preview.previewId, record);
    return record;
  };
  sourceManager.applyCsvReplacement = async (previewId) => {
    const preview = previews.get(previewId);
    if (!preview) throw new Error("CSV preview is missing or already applied");
    if (hash(preview.text) !== preview.incomingHash) {
      throw new Error("CSV preview hash mismatch");
    }
    const result = await applyUseCase.execute({ previewId, preview });
    previews.delete(previewId);
    return result;
  };
  sourceManager.cancelCsvPreview = (previewId) => {
    previews.delete(previewId);
  };
  sourceManager.exportCsv = (ref) => {
    let result = "";
    new ExportCirclesToCsvUseCase(manager.repository, {
      downloadCirclesAsCsv: (_filename, circles, purchasedSpaces) => {
        result = serializeCircleCsv(circles, purchasedSpaces);
      },
    }).execute({ eventDay: ref });
    return result;
  };

  Object.defineProperty(manager, "advanceTime", {
    value: (milliseconds: number) => {
      now = new Date(now.getTime() + milliseconds);
    },
  });

  return { adapter, manager: sourceManager };
}

const csv = (rows: string): string =>
  `space,priority,isSale,account,tweet,memo\r\n${rows}`;

describe("Phase 2 Task 7 local data service", () => {
  test("transition service activates the shared session after commit", async () => {
    const { manager } = createManager();
    manager.eventRegistry = {
      schemaVersion: 1,
      events: [
        {
          eventId: "demo-v1",
          displayName: "Demo Event",
          mapBundle: "../maps/demo-v1/manifest.json",
          days: [
            { dayId: "day1", displayName: "Day 1" },
            { dayId: "day2", displayName: "Day 2" },
          ],
        },
      ],
    };
    manager.eventRegistryUrl =
      "https://example.test/assets/events/manifest.json";
    await manager.openEventDay({ eventId: "demo-v1", dayId: "day1" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            eventId: "demo-v1",
            displayName: "Demo Event",
            bundleVersion: "demo-v1",
            areas: [
              {
                id: "east",
                mapId: "east",
                name: "East",
                prefixes: ["E"],
                labels: ["A"],
                mapFile: "map.png",
                pointsFile: "points.json",
                gridMetaFile: "grid.json",
                gridFile: "grid.bin",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    try {
      await manager.getTransitionService().execute({
        eventId: "demo-v1",
        dayId: "day2",
      });

      expect(manager.activeRef).toEqual({ eventId: "demo-v1", dayId: "day2" });
    expect(manager.activeState).toEqual(
        manager.repository.load({ eventId: "demo-v1", dayId: "day2" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("routes legacy actions without an active day through the session", () => {
    const { manager } = createManager();

    manager.addPurchased("A-01");
    manager.addHold("B-02");

    expect(manager.activeRef).toEqual({
      eventId: "legacy-session",
      dayId: "default",
    });
    expect(manager.purchasedList).toEqual(["A-01"]);
    expect(manager.holdList).toEqual(["B-02"]);
  });

  test("opens only a registered event/day and returns a safe empty state", async () => {
    const { manager } = createManager();

    const state = await manager.openEventDay({
      eventId: "C108",
      dayId: "day1",
    });

    expect(state.circles).toEqual([]);
    expect(state.source).toEqual({ type: "csv", fileName: "empty.csv" });
    await expect(
      manager.openEventDay({ eventId: "C108", dayId: "day3" }),
    ).rejects.toThrow("Event/Day not found in registry");
  });

  test("creates a CSV source only through the initial import boundary", async () => {
    const { manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);

    const state = await manager.importInitialCsv(
      ref,
      "day1.csv",
      csv("A-01,3,x,@account,tweet,memo\r\n"),
    );

    expect(state.source).toEqual({ type: "csv", fileName: "day1.csv" });
    expect(state.sourceGeneration).toBe("generation-2");
    expect(getCircleVisitState(state.circleStates, "A-01")).toBe("purchased");
    expect((await manager.openEventDay(ref)).circles).toEqual(state.circles);
    await expect(
      manager.importInitialCsv(ref, "again.csv", csv("B-01,1,,,,\r\n")),
    ).rejects.toThrow("Initial CSV import requires an empty state");
  });

  test("excludes circles marked excluded from the normal unvisited candidates", async () => {
    const { manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);
    const imported = await manager.importInitialCsv(
      ref,
      "day1.csv",
      csv("A-01,1,,,,\r\nB-02,1,,,,\r\n"),
    );
    manager.repository.save(ref, {
      ...imported,
      circleStates: { "A-01": "excluded" },
    });

    await manager.openEventDay(ref);

    expect(manager.getUnvisited().map((circle) => circle.space)).toEqual([
      "B-02",
    ]);
  });

  test("applies only a valid CSV preview and preserves local state", async () => {
    const { manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);
    await manager.importInitialCsv(ref, "day1.csv", csv("A-01,1,,,,\r\n"));
    manager.addPurchased("A-01");

    const preview = await manager.previewCsvReplacement(
      ref,
      "replacement.csv",
      csv("A-01,2,,,,\r\nB-01,1,,,,\r\n"),
    );

    expect(preview.previewId).toMatch(/^preview-/);
    expect(preview.expectedSourceGeneration).toBe("generation-2");
    expect(preview.incomingHash).toMatch(/^[0-9a-f]{8}$/);
    expect(preview.fileName).toBe("replacement.csv");
    expect(preview.diff.updated[0]?.after.priority).toBe(2);

    const applied = await manager.applyCsvReplacement(preview.previewId);
    expect(applied.source).toEqual({
      type: "csv",
      fileName: "replacement.csv",
    });
    expect(applied.sourceGeneration).toBe("generation-3");
    expect(getCircleVisitState(applied.circleStates, "A-01")).toBe("purchased");
    expect(manager.wantToBuy.map((circle) => circle.space)).toEqual([
      "A-01",
      "B-01",
    ]);
    await expect(
      manager.applyCsvReplacement(preview.previewId),
    ).rejects.toThrow("CSV preview is missing or already applied");
  });

  test("rejects stale, expired, and tampered previews without changing state", async () => {
    const { manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);
    await manager.importInitialCsv(ref, "day1.csv", csv("A-01,1,,,,\r\n"));

    const expired = await manager.previewCsvReplacement(
      ref,
      "expired.csv",
      csv("B-01,1,,,,\r\n"),
    );
    (
      manager as unknown as { advanceTime: (milliseconds: number) => void }
    ).advanceTime(1_001);
    await expect(
      manager.applyCsvReplacement(expired.previewId),
    ).rejects.toThrow("CSV preview has expired");

    const tampered = await manager.previewCsvReplacement(
      ref,
      "tampered.csv",
      csv("C-01,1,,,,\r\n"),
    );
    const previews = (
      manager as unknown as {
        csvPreviews: Map<string, { text: string; incomingHash: string }>;
      }
    ).csvPreviews;
    const stored = previews.get(tampered.previewId);
    if (!stored) throw new Error("test preview was not stored");
    stored.text = csv("D-01,1,,,,\r\n");
    await expect(
      manager.applyCsvReplacement(tampered.previewId),
    ).rejects.toThrow("CSV preview hash mismatch");

    const stale = await manager.previewCsvReplacement(
      ref,
      "stale.csv",
      csv("E-01,1,,,,\r\n"),
    );
    const fresh = await manager.previewCsvReplacement(
      ref,
      "new.csv",
      csv("F-01,1,,,,\r\n"),
    );
    await manager.applyCsvReplacement(fresh.previewId);
    const current = manager.repository.load(ref) as LocalEventDayState;
    await expect(manager.applyCsvReplacement(stale.previewId)).rejects.toThrow(
      "CSV preview source generation is stale",
    );
    expect(current.sourceGeneration).toBe("generation-3");
  });

  test("keeps event/day purchases, holds, and history isolated", async () => {
    const { manager } = createManager();
    const day1: EventDayRef = { eventId: "C108", dayId: "day1" };
    const day2: EventDayRef = { eventId: "C108", dayId: "day2" };

    await manager.openEventDay(day1);
    await manager.importInitialCsv(day1, "day1.csv", csv("A-01,1,,,,\r\n"));
    manager.addPurchased("A-01");

    await manager.openEventDay(day2);
    await manager.importInitialCsv(day2, "day2.csv", csv("B-01,1,,,,\r\n"));
    expect(manager.purchasedList).toEqual([]);
    expect(manager.holdList).toEqual([]);
    expect(manager.actionHistory).toEqual([]);

    const restored = await manager.openEventDay(day1);
    expect(getCircleVisitState(restored.circleStates, "A-01")).toBe(
      "purchased",
    );
  });

  test("does not change in-memory local state when repository save fails", async () => {
    const { adapter, manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);
    await manager.importInitialCsv(ref, "day1.csv", csv("A-01,1,,,,\r\n"));
    adapter.failWrites = true;

    expect(() => manager.addPurchased("A-01")).toThrow(
      "Failed to save event day state",
    );
    expect(manager.purchasedList).toEqual([]);
    const loadedState = manager.repository.load(ref);
    expect(
      loadedState
        ? getCircleVisitState(loadedState.circleStates, "A-01")
        : "pending",
    ).toBe("pending");
  });

  test("legacy preview reports invalid rows and never deletes legacy keys", async () => {
    const { adapter, manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    adapter.setItem(
      "comiketData",
      JSON.stringify({
        wantToBuy: [
          { space: "A-01", priority: 1 },
          { priority: "not-a-number" },
        ],
      }),
    );
    adapter.setItem("purchasedList", JSON.stringify(["A-01"]));
    adapter.setItem("holdList", JSON.stringify([]));
    adapter.setItem("actionHistory", JSON.stringify([]));
    adapter.setItem("redoStack", JSON.stringify([]));

    const preview = manager.previewLegacyImport(ref);
    expect(preview.circleCount).toBe(1);
    expect(preview.issues).toHaveLength(1);
    expect(() => manager.applyLegacyImport(ref, preview.previewId)).toThrow(
      "Legacy preview contains invalid rows",
    );
    expect(adapter.getItem("comiketData")).not.toBeNull();
    expect(manager.repository.load(ref)).toBeNull();
  });

  test("valid legacy import copies data and retains every legacy key", () => {
    const { adapter, manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    adapter.setItem(
      "comiketData",
      JSON.stringify({ wantToBuy: [{ space: "A-01", priority: 1 }] }),
    );
    adapter.setItem("purchasedList", JSON.stringify(["A-01"]));
    adapter.setItem("holdList", JSON.stringify([]));
    adapter.setItem("actionHistory", JSON.stringify([]));
    adapter.setItem("redoStack", JSON.stringify([]));

    const preview = manager.previewLegacyImport(ref);
    const state = manager.applyLegacyImport(ref, preview.previewId);

    expect(state.circles).toEqual([{ space: "A-01", priority: 1 }]);
    expect(getCircleVisitState(state.circleStates, "A-01")).toBe("purchased");
    expect(adapter.getItem("comiketData")).not.toBeNull();
    expect(adapter.getItem("purchasedList")).not.toBeNull();
  });

  test("does not apply a legacy preview to a different event/day", () => {
    const { adapter, manager } = createManager();
    const day1: EventDayRef = { eventId: "C108", dayId: "day1" };
    const day2: EventDayRef = { eventId: "C108", dayId: "day2" };
    adapter.setItem(
      "comiketData",
      JSON.stringify({ wantToBuy: [{ space: "A-01", priority: 1 }] }),
    );

    const preview = manager.previewLegacyImport(day1);

    expect(() => manager.applyLegacyImport(day2, preview.previewId)).toThrow(
      "Legacy preview target is stale",
    );
    expect(manager.repository.load(day2)).toBeNull();
    expect(adapter.getItem("comiketData")).not.toBeNull();
  });

  test("startup and local actions do not read or send GAS data", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("GAS must not be contacted in Phase 2"));
    const adapter = new MockStorageAdapter();
    adapter.setItem("webAppURL", "https://example.test/gas");
    const manager = createManager(adapter).manager;
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);
    await manager.importInitialCsv(
      ref,
      "day1.csv",
      csv("A-01,1,,,,\r\nA-02,2,,,,\r\n"),
    );
    const app = new ComiPathBrowserRuntime();
    app.dm = manager;
    app.searchNext = vi.fn();
    app.ui.init = vi.fn();
    app.setupEvents = vi.fn();
    app.ui.updateCounts = vi.fn();
    app.ui.showToast = vi.fn();
    app.ui.showSettings = vi.fn();

    await app.init({ eventId: "C108", areas: [] });
    manager.addPurchased("A-01");
    manager.addHold("A-02");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(manager.activeRef).toEqual(ref);
    expect(adapter.getItem("webAppURL")).toBe("https://example.test/gas");
    fetchSpy.mockRestore();
  });

  test("allows GAS to CSV source-type-change replacement via applyCsvReplacement", async () => {
    const { manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);

    // Manually set initial state as GAS source
    const initialGasState: LocalEventDayState = {
      schemaVersion: 1,
      source: {
        type: "gas",
        gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
        sheetName: "Day1",
      },
      sourceGeneration: "generation-1",
      circles: [{ space: "A-01", priority: 1 }],
      purchased: ["A-01"],
      hold: [],
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
    manager.repository.save(ref, initialGasState);
    await manager.openEventDay(ref);

    const preview = await manager.previewCsvReplacement(
      ref,
      "from_gas.csv",
      csv("A-01,2,,,,\r\n"),
    );

    const applied = await manager.applyCsvReplacement(preview.previewId);

    expect(applied.source).toEqual({ type: "csv", fileName: "from_gas.csv" });
    expect(applied.sourceGeneration).toBe("generation-2");
    expect(getCircleVisitState(applied.circleStates, "A-01")).toBe("purchased");
  });

  test("blocks CSV apply when pending outbox exists, preserving preview and state", async () => {
    const { manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);

    // Initial state with GAS source
    const initialGasState: LocalEventDayState = {
      schemaVersion: 2,
      source: {
        type: "gas",
        gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
        sheetName: "Day1",
      },
      sourceGeneration: "generation-1",
      circles: [{ space: "A-01", priority: 1 }],
      circleStates: { "A-01": "purchased" },
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    };
    manager.repository.save(ref, initialGasState);
    await manager.openEventDay(ref);

    const preview = await manager.previewCsvReplacement(
      ref,
      "test.csv",
      csv("A-01,2,,,,\r\n"),
    );

    // Simulate pending outbox entry inserted after preview
    const stateWithOutbox: LocalEventDayState = {
      ...initialGasState,
      gasOutbox: [
        {
          id: "pending-1",
          eventId: "C108",
          dayId: "day1",
          sourceGeneration: "generation-1",
          gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
          sheetName: "Day1",
          space: "A-01",
          purchased: true,
          createdAt: "2026-07-21T07:45:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ],
    };
    manager.repository.save(ref, stateWithOutbox);

    await expect(
      manager.applyCsvReplacement(preview.previewId),
    ).rejects.toThrow("blocked by 1 pending outbox entries");

    // State is unchanged
    expect(manager.repository.load(ref)?.source.type).toBe("gas");

    // Clear outbox and confirm preview is still usable
    manager.repository.save(ref, initialGasState);
    const applied = await manager.applyCsvReplacement(preview.previewId);
    expect(applied.source.type).toBe("csv");
  });

  test("cancels a CSV preview without changing state", async () => {
    const { manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);

    const preview = await manager.previewCsvReplacement(
      ref,
      "test.csv",
      csv("A-01,2,,,,\r\n"),
    );

    expect(manager.csvPreviews.has(preview.previewId)).toBe(true);

    manager.cancelCsvPreview(preview.previewId);

    expect(manager.csvPreviews.has(preview.previewId)).toBe(false);
    await expect(
      manager.applyCsvReplacement(preview.previewId),
    ).rejects.toThrow("CSV preview is missing or already applied");
  });

  test("exportCsv exports active circles only, derives isSale from purchased truth, preserves formula text, and causes no state mutation", async () => {
    const { manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);

    const initialGasState: LocalEventDayState = {
      schemaVersion: 1,
      source: {
        type: "gas",
        gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
        sheetName: "Day1",
      },
      sourceGeneration: "generation-1",
      circles: [
        {
          space: "東A-01a",
          priority: 1,
          account: "@admin",
          memo: "=SUM(A1)",
        },
        {
          space: "東A-02b",
          priority: 2,
          memo: "+123",
        },
        {
          space: "東A-03c",
          priority: 3,
          removedFromSource: true,
        },
      ],
      purchased: ["東A-01a"],
      hold: ["東A-02b"],
      history: [],
      redo: [],
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    };
    manager.repository.save(ref, initialGasState);
    await manager.openEventDay(ref);

    const exported = manager.exportCsv(ref);

    // Removed circle (東A-03c) is omitted from export
    expect(exported).not.toContain("東A-03c");

    // 東A-01a is purchased, so isSale should be x
    expect(exported).toContain("東A-01a,1,x,@admin,,=SUM(A1)");

    // 東A-02b is not purchased, so isSale should be empty
    expect(exported).toContain("東A-02b,2,,,," + "+123");

    // CRLF line endings
    expect(exported).toContain("\r\n");

    // In-memory state and repository remain unchanged
    const afterState = manager.repository.load(ref);
    expect(afterState?.sourceGeneration).toBe("generation-1");
    expect(afterState?.circles).toEqual(initialGasState.circles);
    expect(afterState?.timestamps).toEqual(initialGasState.timestamps);
  });
});
