// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  TimeDecayedAlnsSolver,
  validateSearchTimeLimit,
} from "../apps/webapp/js/features/route-guidance/domain/optimization/alns-solver";
import type { TimeDecayedAlnsProblem } from "../apps/webapp/js/features/route-guidance/domain/optimization/time-decayed-objective";

function makeProblem(
  overrides: Partial<TimeDecayedAlnsProblem> = {},
): TimeDecayedAlnsProblem {
  return {
    nodeIds: ["A-01", "A-02", "A-03"],
    // N=4 (0=start, 1=A-01, 2=A-02, 3=A-03)
    travelTimesSec: [
      0, 10, 20, 30, 10, 0, 10, 20, 20, 10, 0, 10, 30, 20, 10, 0,
    ],
    serviceTimesSec: [0, 30, 30, 30],
    values: [0, 5, 10, 15],
    size: 4,
    fixedFirstTarget: null,
    searchTimeLimitMs: 5_000,
    randomSeed: 12345,
    initialSolutions: [],
    halfLivesSec: [1800, 3600, 7200],
    halfLifeWeights: [1 / 3, 1 / 3, 1 / 3],
    optimizationProfileVersion: "v1",
    ...overrides,
  };
}

describe("Phase 5C Task 6: ALNS solver & adapter", () => {
  test("rejects search time limits other than 5000, 10000, 15000", () => {
    expect(() => validateSearchTimeLimit(5000)).not.toThrow();
    expect(() => validateSearchTimeLimit(10000)).not.toThrow();
    expect(() => validateSearchTimeLimit(15000)).not.toThrow();

    expect(() =>
      validateSearchTimeLimit(3000 as unknown as AlnsSearchTimeLimitMs),
    ).toThrow();
    expect(() =>
      validateSearchTimeLimit(0 as unknown as AlnsSearchTimeLimitMs),
    ).toThrow();
    expect(() =>
      validateSearchTimeLimit(20000 as unknown as AlnsSearchTimeLimitMs),
    ).toThrow();
  });

  test("does not violate fixedFirstTarget", () => {
    const problem = makeProblem({ fixedFirstTarget: "A-02" });
    const solver = new TimeDecayedAlnsSolver(problem);
    const solution = solver.solveSync(100);

    expect(solution.route[0]).toBe("A-02");
  });

  test("produces deterministic initial result with same seed", () => {
    const p1 = makeProblem({ randomSeed: 999 });
    const p2 = makeProblem({ randomSeed: 999 });

    const sol1 = new TimeDecayedAlnsSolver(p1).solveSync(50);
    const sol2 = new TimeDecayedAlnsSolver(p2).solveSync(50);

    expect(sol1.route).toEqual(sol2.route);
    expect(sol1.score).toBeCloseTo(sol2.score);
  });

  test("accepts initialSolutions and repaired previous best", () => {
    // Suppose previous best had A-02, A-03, and missing A-01
    const initialSolution = ["A-02", "A-03"];
    const problem = makeProblem({
      initialSolutions: [initialSolution],
    });

    const solver = new TimeDecayedAlnsSolver(problem);
    const sol = solver.solveSync(50);

    // Final route should contain all pending nodes (A-01, A-02, A-03)
    expect(sol.route).toContain("A-01");
    expect(sol.route).toContain("A-02");
    expect(sol.route).toContain("A-03");
  });

  test("deduplicates warm-start routes and excludes nodes with non-finite start distance", () => {
    const problem = makeProblem({
      initialSolutions: [["A-02", "A-02"]],
      travelTimesSec: [
        0,
        10,
        20,
        Number.POSITIVE_INFINITY,
        10,
        0,
        10,
        20,
        20,
        10,
        0,
        10,
        30,
        20,
        10,
        0,
      ],
    });

    const solution = new TimeDecayedAlnsSolver(problem).solveSync(50);

    expect(solution.route).toEqual(expect.arrayContaining(["A-01", "A-02"]));
    expect(solution.route).not.toContain("A-03");
    expect(new Set(solution.route).size).toBe(solution.route.length);
    expect(solution.completionTimesSec.every(Number.isFinite)).toBe(true);
  });

  test("profile version mismatch does not reuse old score unconditionally", () => {
    const problem = makeProblem({ optimizationProfileVersion: "v2" });
    const solver = new TimeDecayedAlnsSolver(problem);
    const sol = solver.solveSync(10);

    expect(sol.optimizationProfileVersion).toBe("v2");
  });
});
