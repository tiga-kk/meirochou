import { describe, expect, it, vi } from "vitest";
import { RouteGuidanceController } from "../apps/webapp/js/features/route-guidance/ui/route-guidance-controller";

describe("RouteGuidanceController", () => {
  it("coordinates start, destination selection, and resume operations", async () => {
    const startGuidance = { execute: vi.fn(async () => {}) };
    const resumeGuidance = { execute: vi.fn(async () => true) };
    const changeDestination = { execute: vi.fn(async () => {}) };
    const finishCircle = { execute: vi.fn(async () => {}) };

    const controller = new RouteGuidanceController({
      startGuidance: startGuidance as any,
      resumeGuidance: resumeGuidance as any,
      changeDestination: changeDestination as any,
      finishCircle: finishCircle as any,
    });

    await controller.resumeSavedGuidance(
      { eventId: "c108", dayId: "day1" },
      [],
    );
    expect(resumeGuidance.execute).toHaveBeenCalledOnce();
  });

  it("delegates the finish input and result without rebuilding guidance", async () => {
    const finishCircle = {
      execute: vi.fn(async () => ({ kind: "advanced" as const })),
    };
    const controller = new RouteGuidanceController({
      startGuidance: {} as any,
      resumeGuidance: {} as any,
      changeDestination: {} as any,
      finishCircle: finishCircle as any,
    });
    const input = {
      action: "purchase" as const,
      completedSpace: "東A01a",
      remainingCircles: [{ space: "東A02b" }],
    };

    await expect(controller.finishCurrentCircle(input)).resolves.toEqual({
      kind: "advanced",
    });
    expect(finishCircle.execute).toHaveBeenCalledWith(input);
  });
});
