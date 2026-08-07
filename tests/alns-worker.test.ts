// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  TimeDecayedAlnsWorkerKernel,
  type TimeDecayedAlnsWorkerMessage,
} from "../apps/webapp/js/features/route-guidance/domain/optimization/alns-worker-kernel";
import type { TimeDecayedAlnsProblem } from "../apps/webapp/js/features/route-guidance/domain/optimization/time-decayed-objective";

function makeProblem(): TimeDecayedAlnsProblem {
  return {
    nodeIds: ["A-01", "A-02"],
    travelTimesSec: [0, 10, 20, 10, 0, 10, 20, 10, 0],
    serviceTimesSec: [0, 30, 30],
    values: [0, 5, 10],
    size: 3,
    fixedFirstTarget: null,
    searchTimeLimitMs: 5_000,
    randomSeed: 42,
    initialSolutions: [],
    halfLivesSec: [1800, 3600, 7200],
    halfLifeWeights: [1 / 3, 1 / 3, 1 / 3],
    optimizationProfileVersion: "v1",
  };
}

describe("Phase 5C Task 6: TimeDecayedAlnsWorkerKernel", () => {
  test("returns latest best solution on cancel", async () => {
    const messages: TimeDecayedAlnsWorkerMessage[] = [];
    const kernel = new TimeDecayedAlnsWorkerKernel((msg) => messages.push(msg));

    const problem = makeProblem();
    const jobId = "job-alns-1";

    // Run async / stepped
    const promise = kernel.start(jobId, problem, 1000);
    // Cancel mid-run (after start starts executing)
    kernel.cancel(jobId);
    await promise;

    const cancelled = messages.find((m) => m.type === "cancelled");
    expect(cancelled).toBeDefined();
    if (cancelled && cancelled.type === "cancelled") {
      expect(cancelled.best).toBeDefined();
    }
  });

  test("emits progress updates during execution", async () => {
    const messages: TimeDecayedAlnsWorkerMessage[] = [];
    const kernel = new TimeDecayedAlnsWorkerKernel((msg) => messages.push(msg));

    const problem = makeProblem();
    await kernel.start("job-alns-2", problem, 100); // 100 max iterations for fast test

    const progressMsgs = messages.filter((m) => m.type === "progress");
    const completeMsg = messages.find((m) => m.type === "complete");

    expect(progressMsgs.length).toBeGreaterThan(0);
    expect(completeMsg).toBeDefined();
  });

  test("reports solver validation failures through the worker error protocol", async () => {
    const messages: TimeDecayedAlnsWorkerMessage[] = [];
    const kernel = new TimeDecayedAlnsWorkerKernel((msg) => messages.push(msg));

    await kernel.start("job-alns-invalid", {
      ...makeProblem(),
      searchTimeLimitMs: 3_000 as never,
    });

    expect(messages).toContainEqual({
      type: "error",
      stage: "time-decayed-alns",
      jobId: "job-alns-invalid",
      code: "invalid-search-time-limit",
    });
  });

  test("runs until the configured search-time limit when no test iteration cap is given", async () => {
    let now = 0;
    const messages: TimeDecayedAlnsWorkerMessage[] = [];
    const kernel = new TimeDecayedAlnsWorkerKernel(
      (msg) => messages.push(msg),
      {
        now: () => {
          now += 1_000;
          return now;
        },
        yieldControl: async () => undefined,
        batchIterations: 1,
      },
    );

    await kernel.start("job-alns-time-box", makeProblem());

    expect(now).toBeGreaterThanOrEqual(5_000);
    expect(messages.at(-1)).toMatchObject({
      type: "complete",
      stage: "time-decayed-alns",
    });
  });
});
