import { describe, expect, it } from "vitest";
import type { StoredDistanceMatrix } from "../apps/webapp/js/routing/distance-matrix";
import { LocalStorageDistanceMatrixRepository } from "../apps/webapp/js/routing/distance-matrix-repository";
import { EventDayRepository } from "../apps/webapp/js/state/event-day-repository";
import { LocalStorageNavigationSnapshotRepository } from "../apps/webapp/js/state/navigation-snapshot-repository";
import {
  PendingOutboxError,
  SourceSettingsService,
} from "../apps/webapp/js/state/source-settings-service";
import { StorageDeletionService } from "../apps/webapp/js/state/storage-deletion-service";
import { StorageService } from "../apps/webapp/js/state/storage-service";
import type {
  EventDayRef,
  LocalEventDayState,
} from "../apps/webapp/js/types/domain";

function createMockStorage(): StorageService {
  const store = new Map<string, string>();
  return new StorageService({
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
}

class RawStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  keys(): string[] {
    return [...this.store.keys()];
  }
}

function createSampleState(
  ref: EventDayRef,
  pendingOutboxCount = 0,
): LocalEventDayState {
  return {
    schemaVersion: 2,
    source: {
      type: "gas",
      gasUrl: `https://script.google.com/macros/s/test_${ref.eventId}_${ref.dayId}/exec`,
      sheetName: ref.dayId,
    },
    sourceGeneration: "gen-1",
    circles: [{ space: "東A01a" }, { space: "東A02b" }],
    circleStates: {
      東A01a: "purchased",
      東A02b: "held",
    },
    gasOutbox: Array.from({ length: pendingOutboxCount }, (_, i) => ({
      id: `outbox-${i}`,
      eventId: ref.eventId,
      dayId: ref.dayId,
      sourceGeneration: "gen-1",
      gasUrl: `https://script.google.com/macros/s/test_${ref.eventId}_${ref.dayId}/exec`,
      sheetName: ref.dayId,
      space: "東A01a",
      purchased: true,
      createdAt: "2026-07-25T00:00:00.000Z",
      attempts: 0,
      lastError: null,
    })),
    timestamps: {
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
    },
  };
}

function createMatrix(): StoredDistanceMatrix {
  return {
    schemaVersion: 1,
    cacheKey: "matrix-c108-east-v1",
    areaId: "east",
    spaces: ["A-01"],
    size: 1,
    distances: [0],
    createdAt: "2026-07-26T20:00:00.000Z",
  };
}

function createSnapshot(ref: EventDayRef) {
  return {
    schemaVersion: 1 as const,
    eventId: ref.eventId,
    dayId: ref.dayId,
    areaId: "east",
    bundleVersion: "v1",
    matrixRef: "matrix-c108-east-v1",
    navState: {
      stage: "navigating" as const,
      areaId: "east",
      currentPosition: null,
      targetSpace: "A-01",
      lockedFirstLeg: {
        from: { type: "start" as const, areaId: "east", gridIndex: 0 },
        toSpace: "A-01",
      },
      provisionalOrder: ["A-01"],
      bestOrder: ["A-01"],
    },
    optimizationTimeLimitMs: 10000 as const,
    savedAt: "2026-07-26T20:00:00.000Z",
  };
}

describe("StorageDeletionService", () => {
  it("deletes circles scope while preserving activity and setting empty.csv sentinel", () => {
    const storage = createMockStorage();
    const repo = new EventDayRepository(storage);
    const sourceSettings = new SourceSettingsService(repo);
    let genSeq = 0;
    const service = new StorageDeletionService(
      repo,
      sourceSettings,
      () => `gen-new-${++genSeq}`,
    );

    const ref = { eventId: "c104", dayId: "day1" };
    repo.save(ref, createSampleState(ref, 0));

    const result = service.delete(
      { type: "circles", ref },
      "2026-07-25T01:00:00.000Z",
    );

    expect(result.deletedRefs).toEqual([]);
    expect(result.activeRefDeleted).toBe(false);

    const updated = repo.load(ref);
    expect(updated?.circles).toHaveLength(0);
    expect(updated?.source).toEqual({ type: "csv", fileName: "empty.csv" });
    expect(updated?.sourceGeneration).toBe("gen-new-1");
    expect(updated?.circleStates).toEqual({
      東A01a: "purchased",
      東A02b: "held",
    });
    expect(updated?.timestamps.sourceUpdatedAt).toBe(
      "2026-07-25T01:00:00.000Z",
    );
  });

  it("deletes activity scope while preserving source, generation, and circles", () => {
    const storage = createMockStorage();
    const repo = new EventDayRepository(storage);
    const sourceSettings = new SourceSettingsService(repo);
    const service = new StorageDeletionService(
      repo,
      sourceSettings,
      () => "gen-new",
    );

    const ref = { eventId: "c104", dayId: "day1" };
    repo.save(ref, createSampleState(ref, 0));

    const result = service.delete(
      { type: "activity", ref },
      "2026-07-25T01:00:00.000Z",
    );

    expect(result.deletedRefs).toEqual([]);
    expect(result.activeRefDeleted).toBe(false);

    const updated = repo.load(ref);
    expect(updated?.circleStates).toEqual({});
    expect(updated?.circles).toHaveLength(2);
    expect(updated?.sourceGeneration).toBe("gen-1");
  });

  it("deletes route cache when the circle source itself is cleared", () => {
    const storage = createMockStorage();
    const routeStorage = new RawStorage();
    const repo = new EventDayRepository(storage);
    const sourceSettings = new SourceSettingsService(repo);
    const matrixRepository = new LocalStorageDistanceMatrixRepository(
      routeStorage,
    );
    const snapshotRepository = new LocalStorageNavigationSnapshotRepository(
      routeStorage,
    );
    const service = new StorageDeletionService(
      repo,
      sourceSettings,
      () => "gen-new",
      matrixRepository,
      snapshotRepository,
    );
    const ref = { eventId: "c108", dayId: "day1" };
    repo.save(ref, createSampleState(ref));
    matrixRepository.saveWithRef(ref.eventId, ref.dayId, createMatrix());
    snapshotRepository.save(ref.eventId, ref.dayId, createSnapshot(ref));

    service.delete({ type: "circles", ref }, "2026-07-26T20:00:00.000Z");

    expect(matrixRepository.load("matrix-c108-east-v1")).toBeNull();
    expect(snapshotRepository.load(ref.eventId, ref.dayId)).toBeNull();
  });

  it("blocks circles and activity deletion when pending outbox exists for selected ref", () => {
    const storage = createMockStorage();
    const repo = new EventDayRepository(storage);
    const sourceSettings = new SourceSettingsService(repo);
    const service = new StorageDeletionService(
      repo,
      sourceSettings,
      () => "gen-new",
    );

    const ref = { eventId: "c104", dayId: "day1" };
    repo.save(ref, createSampleState(ref, 1));

    expect(() =>
      service.delete({ type: "circles", ref }, "2026-07-25T01:00:00.000Z"),
    ).toThrow(PendingOutboxError);
    expect(() =>
      service.delete({ type: "activity", ref }, "2026-07-25T01:00:00.000Z"),
    ).toThrow(PendingOutboxError);
  });

  it("deletes single event-day scope and clears last-opened if matching", () => {
    const storage = createMockStorage();
    const repo = new EventDayRepository(storage);
    const sourceSettings = new SourceSettingsService(repo);
    const service = new StorageDeletionService(
      repo,
      sourceSettings,
      () => "gen-new",
    );

    const ref = { eventId: "c104", dayId: "day1" };
    repo.saveWithLastOpened(ref, createSampleState(ref, 0));

    expect(repo.getLastOpened()).toEqual(ref);

    const result = service.delete(
      { type: "event-day", ref },
      "2026-07-25T01:00:00.000Z",
    );

    expect(result.deletedRefs).toEqual([ref]);
    expect(repo.load(ref)).toBeNull();
    expect(repo.getLastOpened()).toBeNull();
  });

  it("preflights all indexed refs for all-events scope and aborts completely if any ref has pending outbox", () => {
    const storage = createMockStorage();
    const repo = new EventDayRepository(storage);
    const sourceSettings = new SourceSettingsService(repo);
    const service = new StorageDeletionService(
      repo,
      sourceSettings,
      () => "gen-new",
    );

    const ref1 = { eventId: "c104", dayId: "day1" };
    const ref2 = { eventId: "c104", dayId: "day2" };

    repo.save(ref1, createSampleState(ref1, 0));
    repo.save(ref2, createSampleState(ref2, 1));

    expect(() =>
      service.delete({ type: "all-events" }, "2026-07-25T01:00:00.000Z"),
    ).toThrow(PendingOutboxError);

    expect(repo.load(ref1)).not.toBeNull();
    expect(repo.load(ref2)).not.toBeNull();
  });

  it("deletes all events safely when preflight passes for all-events scope", () => {
    const storage = createMockStorage();
    const repo = new EventDayRepository(storage);
    const sourceSettings = new SourceSettingsService(repo);
    const service = new StorageDeletionService(
      repo,
      sourceSettings,
      () => "gen-new",
    );

    const ref1 = { eventId: "c104", dayId: "day1" };
    const ref2 = { eventId: "c104", dayId: "day2" };

    repo.saveWithLastOpened(ref1, createSampleState(ref1, 0));
    repo.save(ref2, createSampleState(ref2, 0));

    const result = service.delete(
      { type: "all-events" },
      "2026-07-25T01:00:00.000Z",
    );

    expect(result.deletedRefs).toHaveLength(2);
    expect(result.activeRefDeleted).toBe(true);
    expect(repo.list()).toHaveLength(0);
    expect(repo.getLastOpened()).toBeNull();
  });

  it("clears only the navigation snapshot during activity reset", () => {
    const storage = createMockStorage();
    const routeStorage = new RawStorage();
    const repo = new EventDayRepository(storage);
    const sourceSettings = new SourceSettingsService(repo);
    const matrixRepository = new LocalStorageDistanceMatrixRepository(
      routeStorage,
    );
    const snapshotRepository = new LocalStorageNavigationSnapshotRepository(
      routeStorage,
    );
    const service = new StorageDeletionService(
      repo,
      sourceSettings,
      () => "gen-new",
      matrixRepository,
      snapshotRepository,
    );
    const ref = { eventId: "c108", dayId: "day1" };
    repo.save(ref, createSampleState(ref));
    matrixRepository.saveWithRef(ref.eventId, ref.dayId, createMatrix());
    snapshotRepository.save(ref.eventId, ref.dayId, createSnapshot(ref));

    service.delete({ type: "activity", ref }, "2026-07-26T20:00:00.000Z");

    expect(matrixRepository.load("matrix-c108-east-v1")).not.toBeNull();
    expect(snapshotRepository.load(ref.eventId, ref.dayId)).toBeNull();
  });

  it("deletes distance matrix and navigation snapshot with event-day data", () => {
    const storage = createMockStorage();
    const routeStorage = new RawStorage();
    const repo = new EventDayRepository(storage);
    const sourceSettings = new SourceSettingsService(repo);
    const matrixRepository = new LocalStorageDistanceMatrixRepository(
      routeStorage,
    );
    const snapshotRepository = new LocalStorageNavigationSnapshotRepository(
      routeStorage,
    );
    const service = new StorageDeletionService(
      repo,
      sourceSettings,
      () => "gen-new",
      matrixRepository,
      snapshotRepository,
    );
    const ref = { eventId: "c108", dayId: "day1" };
    repo.save(ref, createSampleState(ref));
    matrixRepository.saveWithRef(ref.eventId, ref.dayId, createMatrix());
    snapshotRepository.save(ref.eventId, ref.dayId, createSnapshot(ref));

    service.delete({ type: "event-day", ref }, "2026-07-26T20:00:00.000Z");

    expect(matrixRepository.load("matrix-c108-east-v1")).toBeNull();
    expect(snapshotRepository.load(ref.eventId, ref.dayId)).toBeNull();
  });
});
