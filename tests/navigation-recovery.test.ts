// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import type {
  ConfirmedPosition,
  NavigationState,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import {
  LocalStorageNavigationSnapshotRepository,
  type NavigationSnapshot,
  validateSnapshotForResume,
} from "../apps/webapp/js/features/route-guidance/infrastructure/local-storage-route-guidance-snapshot-repository";

const samplePosition: ConfirmedPosition = {
  areaId: "east",
  gridIndex: 10,
  svgX: 100,
  svgY: 100,
  source: "manual-start",
};

const sampleNavState: NavigationState = {
  stage: "navigating",
  areaId: "east",
  currentPosition: samplePosition,
  targetSpace: "A-01",
  lockedFirstLeg: {
    from: { type: "start", areaId: "east", gridIndex: 10 },
    toSpace: "A-01",
  },
  provisionalOrder: ["A-01", "A-02"],
  bestOrder: ["A-01", "A-02"],
};

function makeSnapshot(
  overrides: Partial<NavigationSnapshot> = {},
): NavigationSnapshot {
  return {
    schemaVersion: 1,
    eventId: "c108",
    dayId: "day1",
    areaId: "east",
    bundleVersion: "v1",
    matrixRef: "matrix-c108-day1-east",
    navState: sampleNavState,
    optimizationTimeLimitMs: 10000,
    savedAt: "2026-07-26T20:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 5C Task 8: NavigationSnapshotRepository & Recovery Rules", () => {
  test("valid snapshot round-trip via LocalStorage", () => {
    const repository = new LocalStorageNavigationSnapshotRepository(
      localStorage,
    );
    const snapshot = makeSnapshot();

    repository.save("c108", "day1", snapshot);
    const loaded = repository.load("c108", "day1");

    expect(loaded).toEqual(snapshot);

    repository.clear("c108", "day1");
    expect(repository.load("c108", "day1")).toBeNull();
  });

  test("does not persist runtime-only Worker process fields", () => {
    const snapshot = makeSnapshot();
    // Worker / Promise / Undo tokens are not part of NavigationSnapshot
    expect(
      (snapshot as unknown as Record<string, unknown>).workerProcess,
    ).toBeUndefined();
    expect(
      (snapshot as unknown as Record<string, unknown>).pendingPromise,
    ).toBeUndefined();
    expect(
      (snapshot as unknown as Record<string, unknown>).undoToken,
    ).toBeUndefined();
  });

  test("valid resume succeeds when bundle, target state, and endpoints match", () => {
    const snapshot = makeSnapshot();
    const activeCircleStates = {
      "A-01": "pending" as const,
      "A-02": "pending" as const,
    };
    const pendingCircleSpaces = ["A-01", "A-02"];

    const isValid = validateSnapshotForResume({
      snapshot,
      currentBundleVersion: "v1",
      circleStates: activeCircleStates,
      pendingCircleSpaces,
    });

    expect(isValid).toBe(true);
  });

  test("resume rejected when target is already purchased or excluded", () => {
    const snapshot = makeSnapshot();
    const activeCircleStates = { "A-01": "purchased" as const };
    const pendingCircleSpaces = ["A-02"];

    const isValid = validateSnapshotForResume({
      snapshot,
      currentBundleVersion: "v1",
      circleStates: activeCircleStates,
      pendingCircleSpaces,
    });

    expect(isValid).toBe(false);
  });

  test("resume rejected when bundle version mismatches", () => {
    const snapshot = makeSnapshot({ bundleVersion: "v1" });
    const activeCircleStates = {};
    const pendingCircleSpaces = ["A-01"];

    const isValid = validateSnapshotForResume({
      snapshot,
      currentBundleVersion: "v2", // mismatched
      circleStates: activeCircleStates,
      pendingCircleSpaces,
    });

    expect(isValid).toBe(false);
  });

  test("load rejects a snapshot with missing runtime fields instead of returning partial data", () => {
    localStorage.setItem(
      "comipath:nav-snapshot:c108:day1",
      JSON.stringify({ schemaVersion: 1, eventId: "c108", dayId: "day1" }),
    );

    const repository = new LocalStorageNavigationSnapshotRepository(
      localStorage,
    );

    expect(repository.load("c108", "day1")).toBeNull();
  });

  test("load rejects a snapshot stored under a different event/day identity", () => {
    const repository = new LocalStorageNavigationSnapshotRepository(
      localStorage,
    );
    repository.save(
      "c108",
      "day1",
      makeSnapshot({ eventId: "other-event", dayId: "other-day" }),
    );

    expect(repository.load("c108", "day1")).toBeNull();
  });

  test("resume rejects a target that is not in the current pending candidate set", () => {
    const snapshot = makeSnapshot();

    expect(
      validateSnapshotForResume({
        snapshot,
        currentBundleVersion: "v1",
        circleStates: {},
        pendingCircleSpaces: ["A-02"],
      }),
    ).toBe(false);
  });

  test("resume rejects a snapshot whose locked leg does not point at the target", () => {
    const snapshot = makeSnapshot({
      navState: {
        ...sampleNavState,
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 10 },
          toSpace: "A-02",
        },
      },
    });

    expect(
      validateSnapshotForResume({
        snapshot,
        currentBundleVersion: "v1",
        circleStates: {},
        pendingCircleSpaces: ["A-01", "A-02"],
      }),
    ).toBe(false);
  });
});
