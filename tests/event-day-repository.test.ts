import { describe, expect, test } from "vitest";
import {
  EventDayRepository,
  StorageWriteError,
} from "../apps/webapp/js/state/event-day-repository";
import {
  createEmptyEventDayState,
  StorageSchemaError,
} from "../apps/webapp/js/state/storage-schema";
import type { StorageAdapter } from "../apps/webapp/js/state/storage-service";
import { StorageService } from "../apps/webapp/js/state/storage-service";
import type {
  EventDayRef,
  LocalEventDayState,
} from "../apps/webapp/js/types/domain";

class MockStorageAdapter implements StorageAdapter {
  public map = new Map<string, string>();
  public shouldFail = false;
  public onSetItem?: (key: string, value: string) => void;
  public onRemoveItem?: (key: string) => void;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.shouldFail) {
      throw new Error("QuotaExceededError: Web storage quota exceeded");
    }
    if (this.onSetItem) {
      this.onSetItem(key, value);
    }
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    if (this.shouldFail) {
      throw new Error("QuotaExceededError: Web storage quota exceeded");
    }
    if (this.onRemoveItem) {
      this.onRemoveItem(key);
    }
    this.map.delete(key);
  }
}

describe("EventDayRepository", () => {
  const INDEX_KEY = "comipath:v1:index:event-days";
  const validCsvSource = {
    type: "csv" as const,
    fileName: "circles.csv",
  };

  const validNow = "2026-07-21T04:36:34.000Z";

  test("loads and saves state with namespace isolation", () => {
    const adapter = new MockStorageAdapter();
    const storageService = new StorageService(adapter);
    const repository = new EventDayRepository(storageService);

    const ref1: EventDayRef = { eventId: "C108", dayId: "day1" };
    const ref2: EventDayRef = { eventId: "C108", dayId: "day2" };

    const state1 = createEmptyEventDayState(validCsvSource, "g-001", validNow);
    // make state2 slightly different
    const state2 = {
      ...createEmptyEventDayState(validCsvSource, "g-002", validNow),
      sourceGeneration: "g-002",
    };

    // initially load returns null
    expect(repository.load(ref1)).toBeNull();

    // save state1
    repository.save(ref1, state1);
    expect(repository.load(ref1)).toEqual(state1);
    expect(repository.load(ref2)).toBeNull();

    // save state2
    repository.save(ref2, state2);
    expect(repository.load(ref2)).toEqual(state2);

    // list contains both
    expect(repository.list()).toEqual([ref1, ref2]);

    // namespace checks in adapter
    expect(adapter.map.has("comipath:v1:C108:day1:state")).toBe(true);
    expect(adapter.map.has("comipath:v1:C108:day2:state")).toBe(true);
  });

  test("tracks and retrieves last opened event/day", () => {
    const adapter = new MockStorageAdapter();
    const storageService = new StorageService(adapter);
    const repository = new EventDayRepository(storageService);

    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };

    expect(repository.getLastOpened()).toBeNull();

    repository.setLastOpened(ref);
    expect(repository.getLastOpened()).toEqual(ref);
  });

  test("deletes event/day state and updates list index", () => {
    const adapter = new MockStorageAdapter();
    const storageService = new StorageService(adapter);
    const repository = new EventDayRepository(storageService);

    const ref1: EventDayRef = { eventId: "C108", dayId: "day1" };
    const ref2: EventDayRef = { eventId: "C108", dayId: "day2" };

    const state1 = createEmptyEventDayState(validCsvSource, "g-001", validNow);
    const state2 = createEmptyEventDayState(validCsvSource, "g-002", validNow);

    repository.save(ref1, state1);
    repository.save(ref2, state2);

    expect(repository.list()).toEqual([ref1, ref2]);

    repository.deleteState(ref1);
    expect(repository.load(ref1)).toBeNull();
    expect(repository.load(ref2)).toEqual(state2);
    expect(repository.list()).toEqual([ref2]);
    expect(adapter.map.has("comipath:v1:C108:day1:state")).toBe(false);
  });

  test("validates state on load and throws diagnostic error on malformed JSON or schema violation", () => {
    const adapter = new MockStorageAdapter();
    const storageService = new StorageService(adapter);
    const repository = new EventDayRepository(storageService);

    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };

    // 1. Corrupted JSON
    adapter.setItem("comipath:v1:C108:day1:state", "invalid json");
    expect(() => repository.load(ref)).toThrow();

    // 2. Valid JSON but missing required properties (schema violation)
    adapter.setItem(
      "comipath:v1:C108:day1:state",
      JSON.stringify({ schemaVersion: 2 }),
    );
    expect(() => repository.load(ref)).toThrow();
  });

  test("wraps save error in StorageWriteError and ensures transactional rollback on failure", () => {
    const adapter = new MockStorageAdapter();
    const storageService = new StorageService(adapter);
    const repository = new EventDayRepository(storageService);

    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    const state = createEmptyEventDayState(validCsvSource, "g-001", validNow);

    // Save initially works
    repository.save(ref, state);
    expect(repository.load(ref)).toEqual(state);
    expect(repository.list()).toEqual([ref]);

    // Make setItem throw on subsequent save
    adapter.shouldFail = true;
    const updatedState = {
      ...state,
      sourceGeneration: "g-002",
    };

    expect(() => repository.save(ref, updatedState)).toThrow(StorageWriteError);

    // Rollback validation:
    // 1. Data in storage must remain as the previous state
    adapter.shouldFail = false;
    expect(repository.load(ref)).toEqual(state);

    // 2. Index should still contain the ref (and not be corrupted or cleared)
    expect(repository.list()).toEqual([ref]);
  });

  test("transactional rollback: does not add new ref to index if save fails on initial save", () => {
    const adapter = new MockStorageAdapter();
    const storageService = new StorageService(adapter);
    const repository = new EventDayRepository(storageService);

    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    const state = createEmptyEventDayState(validCsvSource, "g-001", validNow);

    adapter.shouldFail = true;
    expect(() => repository.save(ref, state)).toThrow(StorageWriteError);

    // Verify ref was not added to the index
    adapter.shouldFail = false;
    expect(repository.list()).toEqual([]);
    expect(repository.load(ref)).toBeNull();
  });

  test("save throws StorageSchemaError directly without wrapping in StorageWriteError and without running rollback code when validation fails", () => {
    const adapter = new MockStorageAdapter();
    const storageService = new StorageService(adapter);
    const repository = new EventDayRepository(storageService);

    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };

    // Save a valid state first to test rollback doesn't trigger
    const validState = createEmptyEventDayState(
      validCsvSource,
      "g-001",
      validNow,
    );
    repository.save(ref, validState);
    expect(repository.load(ref)).toEqual(validState);

    // Now attempt to save an invalid state (missing properties)
    const invalidState = { schemaVersion: 2 } as unknown as LocalEventDayState;

    // It should throw StorageSchemaError directly, NOT StorageWriteError
    expect(() => repository.save(ref, invalidState)).toThrow(
      StorageSchemaError,
    );
    expect(() => repository.save(ref, invalidState)).not.toThrow(
      StorageWriteError,
    );

    // Verify that rollback code was not executed (the valid state in storage remains intact)
    expect(repository.load(ref)).toEqual(validState);
  });

  test("getLastOpened returns null safely if stored JSON is malformed", () => {
    const adapter = new MockStorageAdapter();
    const storageService = new StorageService(adapter);
    const repository = new EventDayRepository(storageService);

    // Set a malformed JSON string directly in the adapter
    adapter.setItem("comipath:v1:last-opened", "{invalid json");

    // getLastOpened should return null instead of throwing
    expect(repository.getLastOpened()).toBeNull();
  });

  test("save() rollback: attempts to restore index key even if state key rollback throws an error", () => {
    const adapter = new MockStorageAdapter();
    const storageService = new StorageService(adapter);
    const repository = new EventDayRepository(storageService);

    const ref1: EventDayRef = { eventId: "C108", dayId: "day1" };
    const ref2: EventDayRef = { eventId: "C108", dayId: "day2" };
    const state1 = createEmptyEventDayState(validCsvSource, "g-001", validNow);
    const state2 = createEmptyEventDayState(validCsvSource, "g-002", validNow);

    // Save ref1 first
    repository.save(ref1, state1);
    expect(repository.list()).toEqual([ref1]);

    const calls: string[] = [];
    adapter.onSetItem = (key, value) => {
      calls.push(`set:${key}`);
      // Throw on INDEX_KEY write to trigger rollback
      if (key === INDEX_KEY && value.includes("day2")) {
        throw new Error("Trigger rollback");
      }
    };
    adapter.onRemoveItem = (key) => {
      calls.push(`remove:${key}`);
      // Throw during rollback of stateKey
      if (key === "comipath:v1:C108:day2:state") {
        throw new Error("Fail stateKey rollback");
      }
    };

    // Attempt to save ref2, which should trigger the error during index update, then rollback
    expect(() => repository.save(ref2, state2)).toThrow(StorageWriteError);

    // Verify index rollback was still executed
    // It should have tried to set INDEX_KEY back to "[ref1]" representation
    expect(calls).toContain(`set:${INDEX_KEY}`);
    const lastSetCallIndex = calls.lastIndexOf(`set:${INDEX_KEY}`);
    // The first set call for INDEX_KEY failed, but the second one during rollback should be in calls.
    const firstSetCallIndex = calls.indexOf(`set:${INDEX_KEY}`);
    expect(firstSetCallIndex).not.toBe(lastSetCallIndex);
  });

  test("deleteState() rollback: attempts to restore index key even if state key rollback throws an error", () => {
    const adapter = new MockStorageAdapter();
    const storageService = new StorageService(adapter);
    const repository = new EventDayRepository(storageService);

    const ref1: EventDayRef = { eventId: "C108", dayId: "day1" };
    const state1 = createEmptyEventDayState(validCsvSource, "g-001", validNow);

    repository.save(ref1, state1);
    expect(repository.list()).toEqual([ref1]);

    const calls: string[] = [];
    adapter.onSetItem = (key, value) => {
      calls.push(`set:${key}`);
      // Throw during rollback of stateKey (which is a setItem call since previousStateRaw was not empty)
      if (key === "comipath:v1:C108:day1:state") {
        throw new Error("Fail stateKey rollback");
      }
      // Throw on INDEX_KEY write to trigger rollback in deleteState
      if (key === INDEX_KEY && value === "[]") {
        throw new Error("Trigger rollback");
      }
    };
    adapter.onRemoveItem = (key) => {
      calls.push(`remove:${key}`);
    };

    // Attempt to delete ref1, which should trigger the error on INDEX_KEY update, then rollback
    expect(() => repository.deleteState(ref1)).toThrow(StorageWriteError);

    // Verify index rollback was still executed
    // It should have tried to set INDEX_KEY back to original index representation
    expect(calls).toContain(`set:${INDEX_KEY}`);
    const lastSetCallIndex = calls.lastIndexOf(`set:${INDEX_KEY}`);
    const firstSetCallIndex = calls.indexOf(`set:${INDEX_KEY}`);
    expect(firstSetCallIndex).not.toBe(lastSetCallIndex);
  });
});
