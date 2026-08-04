import { describe, expect, it, vi } from "vitest";
import type {
  LocalEventDayState,
  ProtectedSourceOperation,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import { LocalStorageEventDayRepository as EventDayRepository } from "../apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository";
import {
  PendingOutboxError,
  SourceSettingsService,
  StaleSourceStateError,
} from "../apps/webapp/js/state/source-settings-service";
import { StorageService } from "../apps/webapp/js/state/storage-service";

function createMockStorageService(): StorageService {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  return new StorageService(mockStorage);
}

function createToggleStorageService(): {
  service: StorageService;
  setFailWrites: (value: boolean) => void;
} {
  const store = new Map<string, string>();
  let failWrites = false;
  const mockStorage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error("quota exceeded");
      store.set(key, value);
    },
    removeItem: (key: string) => {
      if (failWrites) throw new Error("quota exceeded");
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  return {
    service: new StorageService(mockStorage),
    setFailWrites: (value: boolean) => {
      failWrites = value;
    },
  };
}

function createSampleState(
  sourceGen = "gen1",
  outboxEntries: LocalEventDayState["gasOutbox"] = [],
): LocalEventDayState {
  return {
    schemaVersion: 2,
    source: {
      type: "gas",
      gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
      sheetName: "Day1",
    },
    sourceGeneration: sourceGen,
    circles: [{ space: "東A01a" }],
    circleStates: {
      東A01a: "purchased",
    },
    gasOutbox: outboxEntries,
    timestamps: {
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-23T00:00:00.000Z",
    },
  };
}

describe("SourceSettingsService pending outbox lock", () => {
  const allProtectedOperations: ProtectedSourceOperation[] = [
    "csv-replacement",
    "gas-initial-import",
    "gas-refresh-apply",
    "gas-url-change",
    "sheet-name-change",
    "source-type-change",
    "circles-delete",
    "activity-delete",
    "event-day-delete",
  ];

  it.each(allProtectedOperations)(
    "blocks operation %s when pending outbox exists",
    (op) => {
      const storage = createMockStorageService();
      const repo = new EventDayRepository(storage);
      const ref = { eventId: "c104", dayId: "day1" };

      const state = createSampleState("gen1", [
        {
          id: "entry-1",
          eventId: "c104",
          dayId: "day1",
          sourceGeneration: "gen1",
          gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
          sheetName: "Day1",
          space: "東A01a",
          purchased: true,
          createdAt: "2026-07-23T00:00:00.000Z",
          attempts: 0,
          lastError: null,
        },
      ]);
      repo.save(ref, state);

      const service = new SourceSettingsService(repo);

      expect(() => service.assertCanMutate(ref, op)).toThrow(
        PendingOutboxError,
      );

      try {
        service.assertCanMutate(ref, op);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(PendingOutboxError);
        const pendingError = error as PendingOutboxError;
        expect(pendingError.pendingCount).toBe(1);
        expect(pendingError.entryIds).toEqual(["entry-1"]);
        expect(pendingError.message).not.toContain("script.google.com");
        expect(pendingError.message).not.toContain("Day1");
      }

      if (op === "event-day-delete") {
        expect(() => service.deleteEventDay(ref, "gen1")).toThrow(
          PendingOutboxError,
        );
      } else {
        const nextState: LocalEventDayState = {
          ...state,
          sourceGeneration: op === "gas-refresh-apply" ? "gen1" : "gen2",
          gasOutbox: [],
        };
        expect(() =>
          service.saveGuarded({
            ref,
            operation: op,
            expectedSourceGeneration: "gen1",
            nextState,
          }),
        ).toThrow(PendingOutboxError);
      }
    },
  );
});

describe("SourceSettingsService generation & guarded save invariants", () => {
  it("rejects save if current generation differs from expectedSourceGeneration", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);

    const service = new SourceSettingsService(repo);

    const nextState: LocalEventDayState = {
      ...state,
      sourceGeneration: "gen2",
    };

    expect(() =>
      service.saveGuarded({
        ref,
        operation: "csv-replacement",
        expectedSourceGeneration: "stale-gen",
        nextState,
      }),
    ).toThrow(StaleSourceStateError);
  });

  it("requires a new generation for replacement operations and same generation for refresh", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);

    const service = new SourceSettingsService(repo);

    // Replacement with same generation => throw
    const sameGenState: LocalEventDayState = {
      ...state,
      sourceGeneration: "gen1",
    };
    expect(() =>
      service.saveGuarded({
        ref,
        operation: "csv-replacement",
        expectedSourceGeneration: "gen1",
        nextState: sameGenState,
      }),
    ).toThrow();

    // circles-delete with same generation => throw
    expect(() =>
      service.saveGuarded({
        ref,
        operation: "circles-delete",
        expectedSourceGeneration: "gen1",
        nextState: sameGenState,
      }),
    ).toThrow();

    // Refresh with changed generation => throw
    const newGenState: LocalEventDayState = {
      ...state,
      sourceGeneration: "gen2",
    };
    expect(() =>
      service.saveGuarded({
        ref,
        operation: "gas-refresh-apply",
        expectedSourceGeneration: "gen1",
        nextState: newGenState,
      }),
    ).toThrow();
  });

  it("requires source apply timestamps to be new", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);

    const service = new SourceSettingsService(repo);
    const nextState: LocalEventDayState = {
      ...state,
      source: { type: "csv", fileName: "import.csv" },
      sourceGeneration: "gen2",
    };

    expect(() =>
      service.saveGuarded({
        ref,
        operation: "csv-replacement",
        expectedSourceGeneration: "gen1",
        nextState,
      }),
    ).toThrow(/timestamps.*new/i);
  });

  it("rejects GAS refresh for a non-GAS source", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state: LocalEventDayState = {
      ...createSampleState("gen1"),
      source: { type: "csv", fileName: "existing.csv" },
    };
    repo.save(ref, state);

    const service = new SourceSettingsService(repo);
    const nextState: LocalEventDayState = {
      ...state,
      circles: [{ space: "東A01a" }, { space: "東A02b" }],
      timestamps: {
        ...state.timestamps,
        updatedAt: "2026-07-23T02:00:00.000Z",
        sourceUpdatedAt: "2026-07-23T02:00:00.000Z",
      },
    };

    expect(() =>
      service.saveGuarded({
        ref,
        operation: "gas-refresh-apply",
        expectedSourceGeneration: "gen1",
        nextState,
      }),
    ).toThrow(/GAS source/i);
  });

  it("does not allow non-source operations to change the source", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);

    const service = new SourceSettingsService(repo);
    const nextState: LocalEventDayState = {
      ...state,
      source: { type: "csv", fileName: "unexpected.csv" },
    };

    expect(() =>
      service.saveGuarded({
        ref,
        operation: "activity-delete",
        expectedSourceGeneration: "gen1",
        nextState,
      }),
    ).toThrow(/source/i);
  });

  it("rechecks pending outbox immediately before saving", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);

    const pendingState = createSampleState("gen1", [
      {
        id: "late-entry",
        eventId: "c104",
        dayId: "day1",
        sourceGeneration: "gen1",
        gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
        sheetName: "Day1",
        space: "東A01a",
        purchased: true,
        createdAt: "2026-07-23T00:00:00.000Z",
        attempts: 0,
        lastError: null,
      },
    ]);
    const loadSpy = vi
      .spyOn(repo, "load")
      .mockReturnValueOnce(state)
      .mockReturnValueOnce(pendingState);

    const service = new SourceSettingsService(repo);
    const nextState: LocalEventDayState = {
      ...state,
      source: { type: "csv", fileName: "import.csv" },
      sourceGeneration: "gen2",
      timestamps: {
        ...state.timestamps,
        updatedAt: "2026-07-23T02:00:00.000Z",
        sourceUpdatedAt: "2026-07-23T02:00:00.000Z",
      },
    };

    expect(() =>
      service.saveGuarded({
        ref,
        operation: "csv-replacement",
        expectedSourceGeneration: "gen1",
        nextState,
      }),
    ).toThrow(PendingOutboxError);
    expect(loadSpy).toHaveBeenCalledTimes(2);
  });

  it("preserves state and index when the guarded save fails", () => {
    const { service: storage, setFailWrites } = createToggleStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);

    const service = new SourceSettingsService(repo);
    const nextState: LocalEventDayState = {
      ...state,
      source: { type: "csv", fileName: "import.csv" },
      sourceGeneration: "gen2",
      timestamps: {
        ...state.timestamps,
        updatedAt: "2026-07-23T02:00:00.000Z",
        sourceUpdatedAt: "2026-07-23T02:00:00.000Z",
      },
    };

    setFailWrites(true);
    expect(() =>
      service.saveGuarded({
        ref,
        operation: "csv-replacement",
        expectedSourceGeneration: "gen1",
        nextState,
      }),
    ).toThrow();

    setFailWrites(false);
    expect(repo.load(ref)).toEqual(state);
    expect(repo.listEventDays()).toEqual([ref]);
  });

  it("successfully performs guarded save for valid CSV replacement", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);

    const service = new SourceSettingsService(repo);

    const nextState: LocalEventDayState = {
      ...state,
      source: { type: "csv", fileName: "import.csv" },
      sourceGeneration: "gen2",
      circles: [{ space: "東A01a" }, { space: "東A02b" }],
      timestamps: {
        ...state.timestamps,
        updatedAt: "2026-07-23T02:00:00.000Z",
        sourceUpdatedAt: "2026-07-23T02:00:00.000Z",
      },
    };

    const saved = service.saveGuarded({
      ref,
      operation: "csv-replacement",
      expectedSourceGeneration: "gen1",
      nextState,
    });

    expect(saved.circleStates.東A01a).toBe("purchased"); // Local activity preserved
  });
});

describe("SourceSettingsService deleteEventDay", () => {
  it("deletes event day when generation matches and no pending outbox exists", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);

    const service = new SourceSettingsService(repo);

    service.deleteEventDay(ref, "gen1");

    expect(repo.load(ref)).toBeNull();
  });

  it("rejects deletion with StaleSourceStateError if generation mismatches", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);

    const service = new SourceSettingsService(repo);

    expect(() => service.deleteEventDay(ref, "stale-gen")).toThrow(
      StaleSourceStateError,
    );
  });

  it("rechecks pending outbox immediately before deleting", () => {
    const storage = createMockStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);
    const pendingState = createSampleState("gen1", [
      {
        id: "late-entry",
        eventId: "c104",
        dayId: "day1",
        sourceGeneration: "gen1",
        gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
        sheetName: "Day1",
        space: "東A01a",
        purchased: true,
        createdAt: "2026-07-23T00:00:00.000Z",
        attempts: 0,
        lastError: null,
      },
    ]);
    const loadSpy = vi
      .spyOn(repo, "load")
      .mockReturnValueOnce(state)
      .mockReturnValueOnce(pendingState);

    const service = new SourceSettingsService(repo);

    expect(() => service.deleteEventDay(ref, "gen1")).toThrow(
      PendingOutboxError,
    );
    expect(loadSpy).toHaveBeenCalledTimes(2);
  });

  it("preserves state and index when deletion fails", () => {
    const { service: storage, setFailWrites } = createToggleStorageService();
    const repo = new EventDayRepository(storage);
    const ref = { eventId: "c104", dayId: "day1" };
    const state = createSampleState("gen1");
    repo.save(ref, state);

    const service = new SourceSettingsService(repo);
    setFailWrites(true);
    expect(() => service.deleteEventDay(ref, "gen1")).toThrow();

    setFailWrites(false);
    expect(repo.load(ref)).toEqual(state);
    expect(repo.listEventDays()).toEqual([ref]);
  });
});
