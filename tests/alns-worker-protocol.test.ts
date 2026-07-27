// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  parseTimeDecayedAlnsWorkerRequest,
  parseTimeDecayedAlnsWorkerResponse,
} from "../apps/webapp/js/routing/alns-worker-protocol";

const problem = {
  nodeIds: ["A-01"],
  travelTimesSec: [0, 10, 10, 0],
  serviceTimesSec: [0, 30],
  values: [0, 5],
  size: 2,
  fixedFirstTarget: null,
  searchTimeLimitMs: 10_000,
  randomSeed: 1,
  initialSolutions: [],
  halfLivesSec: [1800, 3600, 7200],
  halfLifeWeights: [1 / 3, 1 / 3, 1 / 3],
  optimizationProfileVersion: "v1",
} as const;

describe("time-decayed ALNS Worker protocol", () => {
  test("parses only valid start/cancel requests", () => {
    expect(
      parseTimeDecayedAlnsWorkerRequest({
        type: "start",
        jobId: "job-1",
        problem,
      }),
    ).toMatchObject({ type: "start", jobId: "job-1" });
    expect(
      parseTimeDecayedAlnsWorkerRequest({
        type: "start",
        jobId: "job-1",
        problem: { ...problem, size: 0 },
      }),
    ).toBeNull();
    expect(
      parseTimeDecayedAlnsWorkerRequest({ type: "cancel", jobId: "job-1" }),
    ).toEqual({
      type: "cancel",
      jobId: "job-1",
    });
  });

  test("rejects responses from another Worker stage", () => {
    expect(
      parseTimeDecayedAlnsWorkerResponse({
        type: "error",
        stage: "top-tw",
        jobId: "job-1",
        code: "bad",
      }),
    ).toBeNull();
  });
});
