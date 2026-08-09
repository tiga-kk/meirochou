// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { StoredDistanceMatrix } from "../apps/webapp/js/features/route-guidance/domain/routing/distance-matrix";
import { LocalStorageDistanceMatrixRepository } from "../apps/webapp/js/features/route-guidance/infrastructure/local-storage-distance-matrix-repository";

/** 最小限のStoredDistanceMatrix fixture */
function makeMatrix(cacheKey: string, areaId: string): StoredDistanceMatrix {
  return {
    schemaVersion: 1,
    cacheKey,
    areaId,
    spaces: ["A-01", "A-02"],
    size: 2,
    distances: [0, 10, 10, 0],
    createdAt: "2026-07-26T00:00:00Z",
  };
}

/** テスト用のシンプルなin-memoryストレージ（LocalStorage代替） */
class FakeStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  keys(): string[] {
    return Object.keys(this.store);
  }
}

describe("Phase 5C Task 5: LocalStorageDistanceMatrixRepository", () => {
  test("save and load round-trip returns identical matrix", () => {
    const storage = new FakeStorage();
    const repo = new LocalStorageDistanceMatrixRepository(storage);
    const matrix = makeMatrix("key-123", "east");

    repo.save(matrix);
    const loaded = repo.load("key-123");

    expect(loaded).not.toBeNull();
    expect(loaded?.cacheKey).toBe("key-123");
    expect(loaded?.spaces).toEqual(["A-01", "A-02"]);
    expect(loaded?.distances).toEqual([0, 10, 10, 0]);
  });

  test("save and load preserves unreachable Infinity distances", () => {
    const storage = new FakeStorage();
    const repo = new LocalStorageDistanceMatrixRepository(storage);
    const matrix = {
      ...makeMatrix("key-infinity", "east"),
      distances: [0, Infinity, Infinity, 0],
    };

    expect(repo.save(matrix)).toBe(true);
    expect(repo.load("key-infinity")?.distances).toEqual([
      0,
      Infinity,
      Infinity,
      0,
    ]);
  });

  test("malformed stored matrix is ignored", () => {
    const storage = new FakeStorage();
    storage.setItem(
      "comipath:matrix:bad",
      JSON.stringify({ schemaVersion: 1, distances: "bad" }),
    );
    const repo = new LocalStorageDistanceMatrixRepository(storage);

    expect(repo.load("bad")).toBeNull();
  });

  test("load with unknown key returns null", () => {
    const storage = new FakeStorage();
    const repo = new LocalStorageDistanceMatrixRepository(storage);

    expect(repo.load("nonexistent-key")).toBeNull();
  });

  test("deleteByEventDay removes matrices associated with that event+day", () => {
    const storage = new FakeStorage();
    const repo = new LocalStorageDistanceMatrixRepository(storage);

    const m1 = makeMatrix("key-c108-day1-east", "east");
    const m2 = makeMatrix("key-c108-day1-west", "west");
    const m3 = makeMatrix("key-c108-day2-east", "east");

    repo.save(m1);
    repo.save(m2);
    repo.save(m3);

    // Associate key→event/day mapping is stored by the repository
    repo.saveWithRef("c108", "day1", m1);
    repo.saveWithRef("c108", "day1", m2);
    repo.saveWithRef("c108", "day2", m3);

    repo.deleteByEventDay("c108", "day1");

    // day1 matrices should be gone
    expect(repo.load("key-c108-day1-east")).toBeNull();
    expect(repo.load("key-c108-day1-west")).toBeNull();
    // day2 matrix should survive
    expect(repo.load("key-c108-day2-east")).not.toBeNull();
  });

  test("quota error during save returns false without throwing", () => {
    const storage = new FakeStorage();
    // Simulate quota error
    storage.setItem = (_key: string, _value: string) => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    };
    const repo = new LocalStorageDistanceMatrixRepository(storage);
    const matrix = makeMatrix("key-quota", "east");

    // Must not throw; should return false
    const result = repo.save(matrix);
    expect(result).toBe(false);
  });
});
