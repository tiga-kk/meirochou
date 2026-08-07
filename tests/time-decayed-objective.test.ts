// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  calculateDecay,
  convertDistanceToTravelTime,
  DEFAULT_TIMING_PROFILE,
  evaluateRouteScore,
  type TimeDecayedAlnsProblem,
} from "../apps/webapp/js/features/route-guidance/domain/optimization/time-decayed-objective";

describe("Phase 5C Task 6: time-decayed-objective", () => {
  test("converts weighted distance to travel time using area-specific coefficient", () => {
    // e456 coefficient is 0.13184
    const travelTime = convertDistanceToTravelTime(
      100,
      "e456",
      DEFAULT_TIMING_PROFILE,
    );
    expect(travelTime).toBeCloseTo(13.184);
  });

  test("crowded weight is NOT double-counted in Task 6 adapter", () => {
    // Input is already weighted distance from Task 5 (e.g. 100).
    // Task 6 only applies secondsPerWeightedDistance.
    const dist = 100;
    const timeA = convertDistanceToTravelTime(
      dist,
      "e7",
      DEFAULT_TIMING_PROFILE,
    ); // 0.11288
    expect(timeA).toBeCloseTo(11.288);
  });

  test("rejects unknown timing profiles instead of silently using a fallback", () => {
    expect(() =>
      convertDistanceToTravelTime(100, "unknown-area", DEFAULT_TIMING_PROFILE),
    ).toThrow(/unknown-area/);
  });

  test("rejects decay weights that do not sum to one", () => {
    expect(() =>
      calculateDecay(30, [1800, 3600, 7200], [0.5, 0.5, 0]),
    ).not.toThrow();
    expect(() =>
      calculateDecay(30, [1800, 3600, 7200], [0.5, 0.5, 0.1]),
    ).toThrow(/sum to 1/);
  });

  test("calculates completion times incorporating 30s/200s service times", () => {
    // Problem with 3 nodes:
    // start -> node0 (travel=10, service=30) -> node1 (travel=15, service=200)
    // node0 completion = 10 + 30 = 40
    // node1 completion = 40 + 15 + 200 = 255
    const problem: TimeDecayedAlnsProblem = {
      nodeIds: ["A-01", "A-02"],
      // flat NxN travel times for [start, A-01, A-02] -> N=3 (0=start, 1=A-01, 2=A-02)
      // start->A-01=10, start->A-02=50, A-01->A-02=15, A-02->A-01=15
      travelTimesSec: [0, 10, 50, 10, 0, 15, 50, 15, 0],
      serviceTimesSec: [0, 30, 200], // 0 for start, 30 for A-01, 200 for A-02
      values: [0, 5, 10], // 0 for start
      size: 3,
      fixedFirstTarget: null,
      searchTimeLimitMs: 10_000,
      randomSeed: 42,
      initialSolutions: [],
      halfLivesSec: [1800, 3600, 7200],
      halfLifeWeights: [1 / 3, 1 / 3, 1 / 3],
      optimizationProfileVersion: "v1",
    };

    const route = ["A-01", "A-02"]; // node indices 1, 2
    const result = evaluateRouteScore(route, problem);
    expect(result.completionTimesSec[0]).toBe(40);
    expect(result.completionTimesSec[1]).toBe(255);
  });

  test("computes equal-weighted decay score matching hand calculation", () => {
    // Hand calculation fixture:
    // t = 1800s.
    // decay(1800) = (2^(-1) + 2^(-0.5) + 2^(-0.25)) / 3
    // 2^(-1) = 0.5
    // 2^(-0.5) ≈ 0.70710678
    // 2^(-0.25) ≈ 0.840896415
    // sum = 2.0479988
    // decay(1800) = 2.0479988 / 3 ≈ 0.68266627
    // If value = 10, score = 6.8266627
    const problem: TimeDecayedAlnsProblem = {
      nodeIds: ["A-01"],
      travelTimesSec: [0, 1770, 1770, 0],
      serviceTimesSec: [0, 30], // completion = 1770 + 30 = 1800
      values: [0, 10],
      size: 2,
      fixedFirstTarget: null,
      searchTimeLimitMs: 10_000,
      randomSeed: 42,
      initialSolutions: [],
      halfLivesSec: [1800, 3600, 7200],
      halfLifeWeights: [1 / 3, 1 / 3, 1 / 3],
      optimizationProfileVersion: "v1",
    };

    const result = evaluateRouteScore(["A-01"], problem);
    const expectedDecay = (0.5 + 2 ** -0.5 + 2 ** -0.25) / 3;
    expect(result.score).toBeCloseTo(10 * expectedDecay, 5);
  });

  test("normalizes unassigned priority and negative values to 0", () => {
    const problem: TimeDecayedAlnsProblem = {
      nodeIds: ["A-01", "A-02"],
      travelTimesSec: [0, 10, 20, 10, 0, 10, 20, 10, 0],
      serviceTimesSec: [0, 30, 30],
      values: [0, -5, NaN], // negative and NaN
      size: 3,
      fixedFirstTarget: null,
      searchTimeLimitMs: 10_000,
      randomSeed: 42,
      initialSolutions: [],
      halfLivesSec: [1800, 3600, 7200],
      halfLifeWeights: [1 / 3, 1 / 3, 1 / 3],
      optimizationProfileVersion: "v1",
    };

    const result = evaluateRouteScore(["A-01", "A-02"], problem);
    expect(result.score).toBe(0);
    expect(Number.isNaN(result.score)).toBe(false);
  });
});
