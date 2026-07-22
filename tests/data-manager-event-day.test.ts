// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { App } from "../apps/webapp/js/app";
import { DataManager } from "../apps/webapp/js/data-manager";
import {
  type StorageAdapter,
  StorageService,
} from "../apps/webapp/js/state/storage-service";
import type {
  EventDayRef,
  EventRegistryV1,
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

function createManager(adapter = new MockStorageAdapter()): {
  adapter: MockStorageAdapter;
  manager: DataManager;
} {
  let now = new Date("2026-07-21T07:45:00.000Z");
  let generation = 0;
  let preview = 0;
  const storage = new StorageService(adapter);
  const manager = new DataManager(storage, {
    now: () => now,
    createSourceGeneration: () => `generation-${++generation}`,
    createPreviewId: () => `preview-${++preview}`,
    previewTtlMs: 1_000,
  });
  manager.eventRegistry = createRegistry();

  Object.defineProperty(manager, "advanceTime", {
    value: (milliseconds: number) => {
      now = new Date(now.getTime() + milliseconds);
    },
  });

  return { adapter, manager };
}

const csv = (rows: string): string =>
  `space,priority,isSale,account,tweet,memo\r\n${rows}`;

describe("Phase 2 Task 7 local data service", () => {
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
    expect(state.purchased).toEqual(["A-01"]);
    expect((await manager.openEventDay(ref)).circles).toEqual(state.circles);
    await expect(
      manager.importInitialCsv(ref, "again.csv", csv("B-01,1,,,,\r\n")),
    ).rejects.toThrow("Initial CSV import requires an empty state");
  });

  test("applies only a valid CSV preview and preserves local state", async () => {
    const { manager } = createManager();
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await manager.openEventDay(ref);
    await manager.importInitialCsv(ref, "day1.csv", csv("A-01,1,,,,\r\n"));
    manager.addPurchased("A-01");
    manager.addHold("A-01");

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

    const applied = manager.applyCsvReplacement(preview.previewId);
    expect(applied.source).toEqual({
      type: "csv",
      fileName: "replacement.csv",
    });
    expect(applied.sourceGeneration).toBe("generation-3");
    expect(applied.purchased).toEqual(["A-01"]);
    expect(applied.hold).toEqual(["A-01"]);
    expect(applied.history).toHaveLength(2);
    expect(manager.wantToBuy.map((circle) => circle.space)).toEqual([
      "A-01",
      "B-01",
    ]);
    expect(() => manager.applyCsvReplacement(preview.previewId)).toThrow(
      "CSV preview is missing or already applied",
    );
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
    expect(() => manager.applyCsvReplacement(expired.previewId)).toThrow(
      "CSV preview has expired",
    );

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
    expect(() => manager.applyCsvReplacement(tampered.previewId)).toThrow(
      "CSV preview hash mismatch",
    );

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
    manager.applyCsvReplacement(fresh.previewId);
    const current = manager.repository.load(ref) as LocalEventDayState;
    expect(() => manager.applyCsvReplacement(stale.previewId)).toThrow(
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
    manager.addHold("A-01");

    await manager.openEventDay(day2);
    await manager.importInitialCsv(day2, "day2.csv", csv("B-01,1,,,,\r\n"));
    expect(manager.purchasedList).toEqual([]);
    expect(manager.holdList).toEqual([]);
    expect(manager.actionHistory).toEqual([]);

    const restored = await manager.openEventDay(day1);
    expect(restored.purchased).toEqual(["A-01"]);
    expect(restored.hold).toEqual(["A-01"]);
    expect(restored.history).toHaveLength(2);
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
    expect(manager.repository.load(ref)?.purchased).toEqual([]);
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
    expect(state.purchased).toEqual(["A-01"]);
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
    await manager.importInitialCsv(ref, "day1.csv", csv("A-01,1,,,,\r\n"));
    const app = new App();
    app.dm = manager;
    app.searchNext = vi.fn();
    app.ui.init = vi.fn();
    app.setupEvents = vi.fn();
    app.ui.updateCounts = vi.fn();
    app.ui.showToast = vi.fn();
    app.ui.showSettings = vi.fn();

    await app.init({ eventId: "C108", areas: [] });
    manager.addPurchased("A-01");
    manager.addHold("A-01");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(manager.activeRef).toEqual(ref);
    expect(adapter.getItem("webAppURL")).toBe("https://example.test/gas");
    fetchSpy.mockRestore();
  });
});
