// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { CircleRecord } from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import {
  buildOptimizationProblem,
  resolveServiceTimeSec,
} from "../apps/webapp/js/navigation/optimization-input-adapter";
import { DEFAULT_TIMING_PROFILE } from "../apps/webapp/js/routing/time-decayed-objective";

describe("Phase 5C Task 7: optimization-input-adapter", () => {
  test("resolves service times: normal 30s, wall 200s, unknown default 30s", () => {
    const normalCircle: CircleRecord = { space: "A-01", priority: 3 };
    const wallCircle: CircleRecord = {
      space: "A-02",
      priority: 5,
      queueClass: "wall",
    };
    const unknownCircle: CircleRecord = {
      space: "A-03",
      priority: 1,
      queueClass: undefined,
    };

    expect(resolveServiceTimeSec(normalCircle, DEFAULT_TIMING_PROFILE)).toBe(
      30,
    );
    expect(resolveServiceTimeSec(wallCircle, DEFAULT_TIMING_PROFILE)).toBe(200);
    expect(resolveServiceTimeSec(unknownCircle, DEFAULT_TIMING_PROFILE)).toBe(
      30,
    );
  });

  test("converts priority to non-negative value (max(0, priority ?? 0))", () => {
    const circles: CircleRecord[] = [
      { space: "A-01", priority: 5 },
      { space: "A-02", priority: -3 },
      { space: "A-03" }, // priority undefined
    ];

    const distances = [0, 100, 200, 100, 0, 50, 200, 50, 0];

    const problem = buildOptimizationProblem({
      areaId: "e456",
      startDistanceToCircles: [100, 200, 300],
      pendingCircles: circles,
      distanceMatrix: distances,
      fixedFirstTarget: null,
      searchTimeLimitMs: 10000,
      randomSeed: 42,
      timingProfile: DEFAULT_TIMING_PROFILE,
    });

    // values: index 0 is start (0), then A-01 (5), A-02 (0), A-03 (0)
    expect(problem.values).toEqual([0, 5, 0, 0]);
  });

  test("converts weighted distance to travel time using timing profile", () => {
    // e456 coeff: 0.13184
    const problem = buildOptimizationProblem({
      areaId: "e456",
      startDistanceToCircles: [100],
      pendingCircles: [{ space: "A-01", priority: 3 }],
      distanceMatrix: [0],
      fixedFirstTarget: null,
      searchTimeLimitMs: 5000,
      randomSeed: 42,
      timingProfile: DEFAULT_TIMING_PROFILE,
    });

    // start to A-01: 100 * 0.13184 = 13.184
    expect(problem.travelTimesSec[1]).toBeCloseTo(13.184);
  });

  test("rejects an unknown area instead of silently using a fallback coefficient", () => {
    expect(() =>
      buildOptimizationProblem({
        areaId: "unknown",
        startDistanceToCircles: [100, 100],
        pendingCircles: [{ space: "A-01" }],
        distanceMatrix: [0],
        fixedFirstTarget: null,
        searchTimeLimitMs: 5000,
        randomSeed: 42,
      }),
    ).toThrow("Unknown timing profile area: unknown");
  });

  test("rejects incomplete or invalid Task 5 matrix inputs", () => {
    expect(() =>
      buildOptimizationProblem({
        areaId: "e456",
        startDistanceToCircles: [],
        pendingCircles: [{ space: "A-01" }],
        distanceMatrix: [0],
        fixedFirstTarget: null,
        searchTimeLimitMs: 5000,
        randomSeed: 42,
      }),
    ).toThrow("startDistanceToCircles");

    expect(() =>
      buildOptimizationProblem({
        areaId: "e456",
        startDistanceToCircles: [100, 100],
        pendingCircles: [{ space: "A-01" }, { space: "A-02" }],
        distanceMatrix: [0, -1, 1, 0],
        fixedFirstTarget: null,
        searchTimeLimitMs: 5000,
        randomSeed: 42,
      }),
    ).toThrow("distanceMatrix");
  });
});
