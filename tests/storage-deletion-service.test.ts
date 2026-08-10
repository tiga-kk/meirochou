import { describe, expect, it, vi } from "vitest";
import { LocalStorageEventDayRepository } from "../apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository";
import type {
  EventDayRef,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import { DeleteLocalDataUseCase } from "../apps/webapp/js/features/local-data-deletion/public-api";
import { StorageService } from "../apps/webapp/js/state/storage-service";

function storage(): StorageService {
  const values = new Map<string, string>();
  return new StorageService({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  });
}

function state(ref: EventDayRef, pending = 0): LocalEventDayState {
  return {
    schemaVersion: 2,
    source: {
      type: "gas",
      gasUrl: "https://script.google.com/test",
      sheetName: ref.dayId,
    },
    sourceGeneration: "generation-1",
    circles: [{ space: "東A01a" }],
    circleStates: { 東A01a: "purchased" },
    gasOutbox: Array.from({ length: pending }, (_, index) => ({
      id: `pending-${index}`,
      eventId: ref.eventId,
      dayId: ref.dayId,
      sourceGeneration: "generation-1",
      gasUrl: "https://script.google.com/test",
      sheetName: ref.dayId,
      space: "東A01a",
      purchased: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      attempts: 0,
      lastError: null,
    })),
    timestamps: {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

describe("DeleteLocalDataUseCase", () => {
  it("keeps the matrix boundary separate for activity deletion", async () => {
    const repo = new LocalStorageEventDayRepository(storage());
    const ref = { eventId: "demo", dayId: "day1" };
    repo.save(ref, state(ref));
    const cleanup = {
      deleteActivitySnapshot: vi.fn(),
      deleteAllRouteData: vi.fn(),
    };
    const useCase = new DeleteLocalDataUseCase(repo, cleanup);
    await useCase.execute({ kind: "activity", eventDay: ref });
    expect(repo.load(ref)?.circles).toHaveLength(1);
    expect(cleanup.deleteActivitySnapshot).toHaveBeenCalledWith(ref);
    expect(cleanup.deleteAllRouteData).not.toHaveBeenCalled();
  });

  it("deletes an event day with pending GAS updates", async () => {
    const repo = new LocalStorageEventDayRepository(storage());
    const ref = { eventId: "demo", dayId: "day1" };
    repo.save(ref, state(ref, 1));
    const cleanup = {
      deleteActivitySnapshot: () => {},
      deleteAllRouteData: () => {},
    };
    const useCase = new DeleteLocalDataUseCase(repo, cleanup);
    await useCase.execute({ kind: "event-day", eventDay: ref });
    expect(repo.load(ref)).toBeNull();
  });
});
