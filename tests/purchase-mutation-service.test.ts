// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { GasApiClient } from "../apps/webapp/js/api/gas-api-client";
import {
  EventDayRepository,
  StorageWriteError,
} from "../apps/webapp/js/state/event-day-repository";
import { GasOutboxService } from "../apps/webapp/js/state/gas-outbox-service";
import { PurchaseMutationService } from "../apps/webapp/js/state/purchase-mutation-service";
import {
  type StorageAdapter,
  StorageService,
} from "../apps/webapp/js/state/storage-service";
import type {
  EventDayRef,
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

function createSetup(adapter = new MockStorageAdapter()) {
  let outboxId = 0;
  const storage = new StorageService(adapter);
  const repository = new EventDayRepository(storage);
  const client = new GasApiClient({ fetch: vi.fn() });
  const outbox = new GasOutboxService(repository, client, {
    createId: () => `outbox-${++outboxId}`,
  });
  const service = new PurchaseMutationService(repository, outbox);

  return { adapter, storage, repository, client, outbox, service };
}

describe("Phase 3 Task 5: PurchaseMutationService", () => {
  const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
  const gasSource: GasDataSource = {
    type: "gas",
    gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
    sheetName: "Day1",
  };
  const now = "2026-07-23T09:00:00.000Z";

  function createInitialState(source = gasSource): LocalEventDayState {
    return {
      schemaVersion: 1,
      source,
      sourceGeneration: "gen-1",
      circles: [
        { space: "A-01", priority: 1 },
        { space: "A-02", priority: 2 },
        { space: "B-01", priority: 1, removedFromSource: true },
      ],
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
  }

  test("Step 1: setPurchased (purchase, cancel, no-op, CSV vs GAS)", () => {
    const { repository, service } = createSetup();
    repository.save(ref, createInitialState());

    // 1. Purchase GAS space
    const res1 = service.setPurchased(ref, "A-01", true, now);
    expect(res1.state.purchased).toEqual(["A-01"]);
    expect(res1.state.history).toHaveLength(1);
    expect(res1.state.history[0]).toEqual({
      type: "purchase",
      space: "A-01",
      timestamp: now,
    });
    expect(res1.pendingCount).toBe(1);
    expect(res1.queuedEntryId).toBe("outbox-1");
    expect(res1.state.gasOutbox[0]).toMatchObject({
      id: "outbox-1",
      space: "A-01",
      purchased: true,
    });

    // 2. No-op purchase (already purchased)
    const resNoop = service.setPurchased(ref, "A-01", true, now);
    expect(resNoop.pendingCount).toBe(1);
    expect(resNoop.queuedEntryId).toBeNull();

    // 3. Cancel purchase (setPurchased false)
    const res2 = service.setPurchased(ref, "A-01", false, now);
    expect(res2.state.purchased).toEqual([]);
    expect(res2.state.history).toHaveLength(2);
    expect(res2.state.history[1]).toEqual({
      type: "unpurchase",
      space: "A-01",
      timestamp: now,
    });
    // Tail coalesced because attempts === 0 for A-01
    expect(res2.state.gasOutbox).toHaveLength(1);
    expect(res2.state.gasOutbox[0].purchased).toBe(false);

    // 4. CSV source never enqueues outbox
    const csvRef: EventDayRef = { eventId: "C108", dayId: "day2" };
    repository.save(csvRef, {
      ...createInitialState({ type: "csv", fileName: "test.csv" }),
    });
    const resCsv = service.setPurchased(csvRef, "A-01", true, now);
    expect(resCsv.state.purchased).toEqual(["A-01"]);
    expect(resCsv.pendingCount).toBe(0);
    expect(resCsv.queuedEntryId).toBeNull();
    expect(resCsv.state.gasOutbox).toHaveLength(0);
  });

  test("Step 3: storage failure leaves memory and state unchanged", () => {
    const { adapter, repository, service } = createSetup();
    const state = createInitialState();
    repository.save(ref, state);

    adapter.failWrites = true;

    expect(() => service.setPurchased(ref, "A-01", true, now)).toThrow(
      StorageWriteError,
    );
    try {
      service.setPurchased(ref, "A-01", true, now);
    } catch (error) {
      expect(error).toBeInstanceOf(StorageWriteError);
      expect((error as StorageWriteError).cause).toBeInstanceOf(Error);
      expect((error as StorageWriteError).cause).toHaveProperty(
        "message",
        "storage quota exceeded",
      );
    }
    expect(repository.load(ref)).toEqual(state);
  });

  test("purchase keeps hold state independent", () => {
    const { repository, service } = createSetup();
    repository.save(ref, {
      ...createInitialState(),
      hold: ["A-01"],
    });

    const result = service.setPurchased(ref, "A-01", true, now);

    expect(result.state.purchased).toEqual(["A-01"]);
    expect(result.state.hold).toEqual(["A-01"]);
  });

  test("Step 4: undo / redo / reset queue tests", () => {
    const { repository, service } = createSetup();
    repository.save(ref, createInitialState());

    // Purchase A-01 and A-02
    service.setPurchased(ref, "A-01", true, now);
    service.setPurchased(ref, "A-02", true, now);

    // Undo A-02
    const undoRes = service.undo(ref, now);
    expect(undoRes).not.toBeNull();
    expect(undoRes?.state.purchased).toEqual(["A-01"]);
    expect(undoRes?.state.redo).toHaveLength(1);
    expect(undoRes?.state.redo[0].space).toBe("A-02");
    // Outbox should contain desired false for A-02
    const a02Outbox = undoRes?.state.gasOutbox.find((e) => e.space === "A-02");
    expect(a02Outbox?.purchased).toBe(false);

    // Redo A-02
    const redoRes = service.redo(ref, now);
    expect(redoRes).not.toBeNull();
    expect(redoRes?.state.purchased).toEqual(["A-01", "A-02"]);
    expect(redoRes?.state.redo).toHaveLength(0);

    // Reset activity
    const resetRes = service.resetActivity(ref, now);
    expect(resetRes.state.purchased).toEqual([]);
    expect(resetRes.state.hold).toEqual([]);
    expect(resetRes.state.history).toEqual([]);
    expect(resetRes.state.redo).toEqual([]);
    // Both A-01 and A-02 should have outbox entries with purchased: false
    const falseSpaces = resetRes.state.gasOutbox
      .filter((e) => !e.purchased)
      .map((e) => e.space);
    expect(falseSpaces).toContain("A-01");
    expect(falseSpaces).toContain("A-02");
  });
});
