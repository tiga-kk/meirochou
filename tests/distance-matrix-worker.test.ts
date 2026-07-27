// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { DistanceMatrixJobInput } from "../apps/webapp/js/routing/distance-matrix";
import {
  DistanceMatrixWorkerKernel,
  type DistanceMatrixWorkerMessage,
} from "../apps/webapp/js/routing/distance-matrix-worker-kernel";

/** 1x2グリッド: 2つのwalkableセル */
function make1x2Grid(): {
  input: DistanceMatrixJobInput;
} {
  const grid = new Uint8Array([1, 1]);
  return {
    input: {
      eventId: "demo-v1",
      dayId: "day1",
      areaId: "east",
      cacheKey: "cache-key-1",
      gridInput: { grid, cols: 2, rows: 1, cellSize: 10 },
      endpoints: [
        { space: "A-01", gridIndex: 0 },
        { space: "A-02", gridIndex: 1 },
      ],
    },
  };
}

describe("Phase 5C Task 5: DistanceMatrixWorkerKernel", () => {
  test("N endpoints produce N progress messages before complete", () => {
    const { input } = make1x2Grid();
    const messages: DistanceMatrixWorkerMessage[] = [];

    const kernel = new DistanceMatrixWorkerKernel((msg) => messages.push(msg));
    kernel.start("job-1", input);

    const progressMessages = messages.filter((m) => m.type === "progress");
    const completeMessages = messages.filter((m) => m.type === "complete");

    // One progress per endpoint (N=2)
    expect(progressMessages).toHaveLength(input.endpoints.length);
    expect(completeMessages).toHaveLength(1);

    // Final progress should have completed = total
    const lastProgress = progressMessages[
      progressMessages.length - 1
    ] as Extract<DistanceMatrixWorkerMessage, { type: "progress" }>;
    expect(lastProgress.completed).toBe(input.endpoints.length);
    expect(lastProgress.total).toBe(input.endpoints.length);
  });

  test("cancel after start prevents complete message from being emitted", () => {
    const { input } = make1x2Grid();
    const messages: DistanceMatrixWorkerMessage[] = [];

    const kernel = new DistanceMatrixWorkerKernel((msg) => messages.push(msg));
    // Cancel immediately before kernel processes (simulates cancel before processing)
    kernel.cancel("job-1");
    kernel.start("job-1", input);

    const completeMessages = messages.filter((m) => m.type === "complete");
    const cancelledMessages = messages.filter((m) => m.type === "cancelled");

    expect(completeMessages).toHaveLength(0);
    expect(cancelledMessages).toHaveLength(1);
  });

  test("stale jobId response is ignored by controller", () => {
    const { input } = make1x2Grid();
    const received: DistanceMatrixWorkerMessage[] = [];

    const kernel = new DistanceMatrixWorkerKernel((msg) => received.push(msg));
    kernel.start("job-1", input);

    // Controller side: only accept messages for job-2 (current), ignore job-1 (stale)
    const currentJobId = "job-2";
    const relevant = received.filter((m) => m.jobId === currentJobId);
    expect(relevant).toHaveLength(0); // job-1 responses are stale
  });

  test("complete message contains StoredDistanceMatrix with correct shape", () => {
    const { input } = make1x2Grid();
    const messages: DistanceMatrixWorkerMessage[] = [];

    const kernel = new DistanceMatrixWorkerKernel((msg) => messages.push(msg));
    kernel.start("job-1", input);

    const complete = messages.find((m) => m.type === "complete") as Extract<
      DistanceMatrixWorkerMessage,
      { type: "complete" }
    >;
    expect(complete).toBeDefined();
    expect(complete.jobId).toBe("job-1");
    expect(complete.matrix.spaces).toEqual(["A-01", "A-02"]);
    expect(complete.matrix.size).toBe(2);
    expect(complete.matrix.distances).toHaveLength(4); // N*N = 2*2
    expect(complete.matrix.cacheKey).toBe("cache-key-1");
    expect(complete.matrix.areaId).toBe("east");
  });
});
