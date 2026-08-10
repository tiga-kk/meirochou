import { describe, expect, it, vi } from "vitest";
import type { CatalogOfflineCachePort } from "../apps/webapp/js/features/catalog-offline/public-api";
import type {
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import type { LocalDataDeletionScope } from "../apps/webapp/js/features/local-data-deletion/public-api";
import { DeleteLocalDataWithCatalogCleanup } from "../apps/webapp/js/app/delete-local-data-with-catalog-cleanup";

const dayA: EventDayRef = { eventId: "event", dayId: "day1" };
const dayB: EventDayRef = { eventId: "event", dayId: "day2" };
const shared = "https://example.test/shared.png";
const onlyA = "https://example.test/only-a.png";

function state(urls: readonly string[]): LocalEventDayState {
  return {
    schemaVersion: 2,
    source: { type: "csv", fileName: "circles.csv" },
    sourceGeneration: "generation",
    circles: urls.map((tweet, index) => ({ space: `A${index}`, tweet })),
    circleStates: {},
    gasOutbox: [],
    timestamps: {
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      sourceUpdatedAt: "2026-08-10T00:00:00.000Z",
    },
  };
}

function repository(states: Map<string, LocalEventDayState>): EventDayRepository {
  return {
    load: vi.fn((ref) => states.get(`${ref.eventId}:${ref.dayId}`) ?? null),
    save: vi.fn(),
    saveAndRememberLastOpened: vi.fn(),
    listEventDays: vi.fn(() => [...states.keys()].map((key) => {
      const [eventId, dayId] = key.split(":");
      return { eventId, dayId };
    })),
    getLastOpenedEventDay: vi.fn(() => null),
    rememberLastOpenedEventDay: vi.fn(),
    deleteEventDay: vi.fn(),
    listEventDaysForDeletion: vi.fn(() => [...states.entries()].map(([key, value]) => {
      const [eventId, dayId] = key.split(":");
      return { ref: { eventId, dayId }, state: value };
    })),
    deleteAllEventDays: vi.fn(),
  };
}

function cache(): CatalogOfflineCachePort {
  return {
    getStatus: vi.fn(),
    cacheAll: vi.fn(),
    remove: vi.fn(async () => {}),
  };
}

describe("DeleteLocalDataWithCatalogCleanup", () => {
  it("removes only catalog URLs no longer referenced after event-day deletion", async () => {
    const states = new Map([
      ["event:day1", state([shared, onlyA])],
      ["event:day2", state([shared])],
    ]);
    const inner = {
      execute: vi.fn(async (scope: LocalDataDeletionScope) => {
        if (scope.kind === "event-day") states.delete("event:day1");
      }),
    };
    const offlineCache = cache();
    const operation = new DeleteLocalDataWithCatalogCleanup(
      inner,
      repository(states),
      offlineCache,
    );

    await operation.execute({ kind: "event-day", eventDay: dayA });

    expect(offlineCache.remove).toHaveBeenCalledWith([onlyA]);
    expect(offlineCache.remove).not.toHaveBeenCalledWith(
      expect.arrayContaining([shared]),
    );
  });

  it("cleans circle-source URLs but never cleans activity data", async () => {
    const states = new Map([
      ["event:day1", state([shared, onlyA])],
      ["event:day2", state([shared])],
    ]);
    const inner = {
      execute: vi.fn(async (scope: LocalDataDeletionScope) => {
        if (scope.kind === "circle-source") {
          states.set("event:day1", state([]));
        }
      }),
    };
    const offlineCache = cache();
    const operation = new DeleteLocalDataWithCatalogCleanup(
      inner,
      repository(states),
      offlineCache,
    );

    await operation.execute({ kind: "circle-source", eventDay: dayA });
    expect(offlineCache.remove).toHaveBeenCalledWith([onlyA]);

    vi.mocked(offlineCache.remove).mockClear();
    await operation.execute({ kind: "activity", eventDay: dayA });
    expect(inner.execute).toHaveBeenLastCalledWith({
      kind: "activity",
      eventDay: dayA,
    });
    expect(offlineCache.remove).not.toHaveBeenCalled();
  });

  it("takes all-event-days candidates before deletion and removes only URLs absent afterward", async () => {
    const states = new Map([
      ["event:day1", state([shared, onlyA])],
      ["event:day2", state([shared, "https://example.test/only-b.png"])],
      ["event:day3", state([shared])],
    ]);
    const inner = {
      execute: vi.fn(async (scope: LocalDataDeletionScope) => {
        if (scope.kind === "all-event-days") {
          states.delete("event:day1");
          states.delete("event:day2");
        }
      }),
    };
    const offlineCache = cache();
    const operation = new DeleteLocalDataWithCatalogCleanup(
      inner,
      repository(states),
      offlineCache,
    );

    await operation.execute({ kind: "all-event-days" });

    expect(offlineCache.remove).toHaveBeenCalledWith([
      onlyA,
      "https://example.test/only-b.png",
    ]);
    expect(offlineCache.remove).not.toHaveBeenCalledWith(
      expect.arrayContaining([shared]),
    );
  });

  it("performs candidate snapshot, deletion, remaining union, then cleanup in order", async () => {
    const states = new Map([["event:day1", state([onlyA])]]);
    const repo = repository(states);
    const order: string[] = [];
    let strictCalls = 0;
    vi.mocked(repo.listEventDaysForDeletion).mockImplementation(() => {
      strictCalls += 1;
      order.push(strictCalls === 1 ? "candidate" : "remaining");
      return strictCalls === 1
        ? [{ ref: dayA, state: state([onlyA]) }]
        : [];
    });
    const inner = {
      execute: vi.fn(async () => {
        order.push("inner");
      }),
    };
    const offlineCache = cache();
    vi.mocked(offlineCache.remove).mockImplementation(async () => {
      order.push("remove");
    });

    await new DeleteLocalDataWithCatalogCleanup(
      inner,
      repo,
      offlineCache,
    ).execute({ kind: "all-event-days" });

    expect(order).toEqual(["candidate", "inner", "remaining", "remove"]);
  });

  it("fails closed when remaining references cannot be collected", async () => {
    const states = new Map([["event:day1", state([onlyA])]]);
    const repo = repository(states);
    let strictCalls = 0;
    vi.mocked(repo.listEventDaysForDeletion).mockImplementation(() => {
      strictCalls += 1;
      if (strictCalls > 1) throw new Error("duplicate or missing state");
      return [{ ref: dayA, state: state([onlyA]) }];
    });
    const offlineCache = cache();
    const inner = { execute: vi.fn(async () => {}) };

    await expect(
      new DeleteLocalDataWithCatalogCleanup(
        inner,
        repo,
        offlineCache,
      ).execute({ kind: "event-day", eventDay: dayA }),
    ).resolves.toBeUndefined();
    expect(inner.execute).toHaveBeenCalledOnce();
    expect(offlineCache.remove).not.toHaveBeenCalled();
  });

  it("does not cleanup when deletion fails and does not fail successful deletion on cleanup errors", async () => {
    const states = new Map([["event:day1", state([onlyA])]]);
    const offlineCache = cache();
    vi.mocked(offlineCache.remove).mockRejectedValue(new Error("cache failure"));
    const inner = { execute: vi.fn(async () => {}) };
    const operation = new DeleteLocalDataWithCatalogCleanup(
      inner,
      repository(states),
      offlineCache,
    );

    await expect(
      operation.execute({ kind: "all-event-days" }),
    ).resolves.toBeUndefined();

    const failedInner = { execute: vi.fn(async () => { throw new Error("delete failure"); }) };
    const failedCache = cache();
    const failed = new DeleteLocalDataWithCatalogCleanup(
      failedInner,
      repository(new Map([["event:day1", state([onlyA])]])),
      failedCache,
    );
    await expect(failed.execute({ kind: "event-day", eventDay: dayA })).rejects.toThrow("delete failure");
    expect(failedInner.execute).toHaveBeenCalledOnce();
    expect(failedCache.remove).not.toHaveBeenCalled();
  });
});
