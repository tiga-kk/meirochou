import { describe, expect, test } from "vitest";
import type { RouteOptimizationPreview } from "../apps/webapp/js/features/route-guidance/use-cases/route-optimization-preview";

describe("RouteOptimizationPreview contract", () => {
  test("contains only ephemeral job metadata and the candidate order", () => {
    const preview: RouteOptimizationPreview = {
      jobId: "job-1",
      generation: 2,
      elapsedMs: 250,
      searchTimeLimitMs: 5000,
      bestOrder: ["東A01a", "東A02b"],
      score: 12.5,
    };

    expect(preview).toEqual({
      jobId: "job-1",
      generation: 2,
      elapsedMs: 250,
      searchTimeLimitMs: 5000,
      bestOrder: ["東A01a", "東A02b"],
      score: 12.5,
    });
  });
});
