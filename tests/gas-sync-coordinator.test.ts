// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { GasApiClient } from "../apps/webapp/js/api/gas-api-client";
import { EventDayRepository } from "../apps/webapp/js/state/event-day-repository";
import { GasOutboxService } from "../apps/webapp/js/state/gas-outbox-service";
import { GasSyncCoordinator } from "../apps/webapp/js/state/gas-sync-coordinator";
import {
  type StorageAdapter,
  StorageService,
} from "../apps/webapp/js/state/storage-service";
import type {
  EventDayRef,
  GasDataSource,
  LocalEventDayState,
  OnlineEventTarget,
} from "../apps/webapp/js/types/domain";

class MockStorageAdapter implements StorageAdapter {
  public map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

class FakeOnlineTarget implements OnlineEventTarget {
  private listeners: Array<() => void> = [];

  addEventListener(type: "online", listener: () => void): void {
    if (type === "online") {
      this.listeners.push(listener);
    }
  }

  removeEventListener(type: "online", listener: () => void): void {
    if (type === "online") {
      this.listeners = this.listeners.filter((l) => l !== listener);
    }
  }

  emitOnline(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  listenerCount(): number {
    return this.listeners.length;
  }
}

function createSetup() {
  const adapter = new MockStorageAdapter();
  const storage = new StorageService(adapter);
  const repository = new EventDayRepository(storage);
  const fetchSpy = vi.fn();
  const client = new GasApiClient({ fetcher: fetchSpy });
  let outboxId = 0;
  const outbox = new GasOutboxService(repository, client, {
    createId: () => `outbox-${++outboxId}`,
  });
  const onlineTarget = new FakeOnlineTarget();
  const coordinator = new GasSyncCoordinator(repository, outbox, onlineTarget);

  return {
    adapter,
    repository,
    client,
    fetchSpy,
    outbox,
    onlineTarget,
    coordinator,
  };
}

function createGasState(
  ref: EventDayRef,
  pendingSpaces: string[],
  sourceGeneration = "gen-1",
): LocalEventDayState {
  const gasSource: GasDataSource = {
    type: "gas",
    gasUrl: `https://script.google.com/macros/s/AKfycbx_ABCDEFGHIJKLMNOPQRSTUVWXYZ_${ref.eventId}_${ref.dayId}/exec`,
    sheetName: ref.dayId,
  };

  return {
    schemaVersion: 1,
    source: gasSource,
    sourceGeneration,
    circles: pendingSpaces.map((space) => ({ space, priority: 1 })),
    purchased: pendingSpaces,
    hold: [],
    history: [],
    redo: [],
    gasOutbox: pendingSpaces.map((space, idx) => ({
      id: `outbox-${ref.eventId}-${ref.dayId}-${idx}`,
      eventId: ref.eventId,
      dayId: ref.dayId,
      sourceGeneration,
      gasUrl: gasSource.gasUrl,
      sheetName: gasSource.sheetName,
      space,
      purchased: true,
      createdAt: "2026-07-23T09:00:00.000Z",
      attempts: 0,
      lastError: null,
    })),
    timestamps: {
      createdAt: "2026-07-21T07:45:00.000Z",
      updatedAt: "2026-07-21T07:45:00.000Z",
      sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
    },
  };
}

describe("Phase 3 Task 6: GasSyncCoordinator", () => {
  test("Step 1: start, online event listener registration, coalesce, and dispose", async () => {
    const { onlineTarget, coordinator, fetchSpy } = createSetup();
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => ({ status: "success", ok: true }),
    });

    expect(onlineTarget.listenerCount()).toBe(0);

    coordinator.start();
    expect(onlineTarget.listenerCount()).toBe(1);

    // Call start again - should not duplicate listener
    coordinator.start();
    expect(onlineTarget.listenerCount()).toBe(1);

    // Emitting online triggers processAll
    onlineTarget.emitOnline();
    expect(onlineTarget.listenerCount()).toBe(1);

    coordinator.dispose();
    expect(onlineTarget.listenerCount()).toBe(0);

    // Emitting online after dispose does nothing
    onlineTarget.emitOnline();
  });

  test("Step 2: multi-ref processing order, failure in middle continues, summary aggregation", async () => {
    const { repository, coordinator, fetchSpy } = createSetup();

    const ref1: EventDayRef = { eventId: "c108", dayId: "day2" };
    const ref2: EventDayRef = { eventId: "c108", dayId: "day1" };
    const ref3: EventDayRef = { eventId: "c109", dayId: "day1" };

    repository.save(ref1, createGasState(ref1, ["A-01"]));
    repository.save(ref2, createGasState(ref2, ["B-01"]));
    repository.save(ref3, createGasState(ref3, ["C-01"]));

    // Mock fetch: ref2 (c108/day1 - first in alphabetical order) succeeds, ref1 (c108/day2) fails, ref3 (c109/day1) succeeds
    fetchSpy.mockImplementation((input: unknown) => {
      const urlStr =
        typeof input === "string"
          ? input
          : input && typeof input === "object" && "url" in input
            ? String((input as { url: unknown }).url)
            : String(input);
      if (urlStr.includes("c108_day2")) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => ({
          ok: true,
          status: "success",
          sheetName: urlStr.includes("c109") ? "day1" : "day1",
          space: urlStr.includes("c109") ? "C-01" : "B-01",
          updated: true,
          timestamp: "2026-07-23T09:00:00.000Z",
        }),
      });
    });

    const summary = await coordinator.processAll();

    expect(summary.processedRefs).toBe(3);
    expect(summary.sent).toBe(2); // ref2 and ref3 sent
    expect(summary.pending).toBe(1); // ref1 pending
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].ref).toEqual(ref1);
    expect(summary.failures[0].category).toBe("network");
    // Ensure sensitive URL is NOT present in failure category
    expect(summary.failures[0].category).not.toContain("https://");
  });

  test("Step 2: unexpected processing errors are redacted and retain pending count", async () => {
    const { repository, coordinator, outbox } = createSetup();
    const ref: EventDayRef = { eventId: "c108", dayId: "day1" };
    repository.save(ref, createGasState(ref, ["A-01"]));

    vi.spyOn(outbox, "process").mockRejectedValue(
      new Error("request failed for https://secret.example/sheet/Day1"),
    );

    const summary = await coordinator.processAll();

    expect(summary.processedRefs).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.pending).toBe(1);
    expect(summary.failures).toEqual([{ ref, category: "unknown" }]);
  });

  test("retry(null) delegates to processAll and retry(ref) processes single ref", async () => {
    const { repository, coordinator, fetchSpy } = createSetup();

    const ref1: EventDayRef = { eventId: "c108", dayId: "day1" };
    const ref2: EventDayRef = { eventId: "c108", dayId: "day2" };

    repository.save(ref1, createGasState(ref1, ["A-01"]));
    repository.save(ref2, createGasState(ref2, ["B-01"]));

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => ({
        ok: true,
        status: "success",
        sheetName: "day1",
        space: "A-01",
        updated: true,
      }),
    });

    // Test retry single ref
    const singleSummary = await coordinator.retry(ref1);
    expect(singleSummary.processedRefs).toBe(1);
    expect(singleSummary.sent).toBe(1);
    expect(singleSummary.pending).toBe(0);

    // Test retry null (all refs)
    const allSummary = await coordinator.retry(null);
    expect(allSummary.processedRefs).toBe(1); // ref2 (1 pending) processed, ref1 was already empty
    expect(allSummary.sent).toBe(1); // ref2 sent
    expect(allSummary.pending).toBe(0);
  });
});
