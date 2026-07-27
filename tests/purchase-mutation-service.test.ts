// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { GasApiClient } from "../apps/webapp/js/api/gas-api-client";
import {
  EventDayRepository,
  StorageWriteError,
} from "../apps/webapp/js/state/event-day-repository";
import { GasOutboxService } from "../apps/webapp/js/state/gas-outbox-service";
import { PurchaseMutationService } from "../apps/webapp/js/state/purchase-mutation-service";
import { getCircleVisitState } from "../apps/webapp/js/state/storage-schema";
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
      schemaVersion: 2,
      source,
      sourceGeneration: "gen-1",
      circles: [
        { space: "A-01", priority: 1 },
        { space: "A-02", priority: 2 },
        { space: "B-01", priority: 1, removedFromSource: true },
      ],
      circleStates: {},
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
    expect(getCircleVisitState(res1.state.circleStates, "A-01")).toBe(
      "purchased",
    );
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
    expect(getCircleVisitState(res2.state.circleStates, "A-01")).toBe(
      "pending",
    );
    // Tail coalesced because attempts === 0 for A-01
    expect(res2.state.gasOutbox).toHaveLength(1);
    expect(res2.state.gasOutbox[0].purchased).toBe(false);

    // 4. CSV source never enqueues outbox
    const csvRef: EventDayRef = { eventId: "C108", dayId: "day2" };
    repository.save(csvRef, {
      ...createInitialState({ type: "csv", fileName: "test.csv" }),
    });
    const resCsv = service.setPurchased(csvRef, "A-01", true, now);
    expect(getCircleVisitState(resCsv.state.circleStates, "A-01")).toBe(
      "purchased",
    );
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

  test("circle visit state transitions exclusively", () => {
    const { repository, service } = createSetup();
    repository.save(ref, createInitialState());

    // 1. Transition to held
    const res1 = service.setCircleState(ref, "A-01", "held", now);
    expect(getCircleVisitState(res1.state.circleStates, "A-01")).toBe("held");
    // Held state changes do not trigger GAS outbox
    expect(res1.state.gasOutbox).toHaveLength(0);

    // 2. Transition from held to purchased
    const res2 = service.setCircleState(ref, "A-01", "purchased", now);
    expect(getCircleVisitState(res2.state.circleStates, "A-01")).toBe(
      "purchased",
    );
    // Transitioning to purchased enqueues outbox
    expect(res2.state.gasOutbox).toHaveLength(1);
    expect(res2.state.gasOutbox[0].purchased).toBe(true);
  });

  test("resetActivity resets circleStates and enqueues cancellation for purchased circles", () => {
    const { repository, service } = createSetup();
    repository.save(ref, createInitialState());

    // Purchase A-01 and A-02
    service.setPurchased(ref, "A-01", true, now);
    service.setPurchased(ref, "A-02", true, now);

    // Reset activity
    const resetRes = service.resetActivity(ref, now);
    expect(resetRes.state.circleStates).toEqual({});
    // Both A-01 and A-02 should have outbox entries with purchased: false
    const falseSpaces = resetRes.state.gasOutbox
      .filter((e) => !e.purchased)
      .map((e) => e.space);
    expect(falseSpaces).toContain("A-01");
    expect(falseSpaces).toContain("A-02");
  });
});
