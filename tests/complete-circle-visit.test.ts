import { describe, expect, test, vi } from "vitest";
import { completeCircleVisit } from "../apps/webapp/js/app/complete-circle-visit";

const eventDay = { eventId: "C108", dayId: "day1" };

function statusResult(currentStatus: "purchased" | "held") {
  return {
    state: {
      schemaVersion: 2 as const,
      source: { type: "csv" as const, fileName: "day1.csv" },
      sourceGeneration: "generation-1",
      circles: [{ space: "A-01" }, { space: "A-02" }],
      circleStates: { "A-01": currentStatus },
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-08-07T00:00:00.000Z",
        updatedAt: "2026-08-07T00:00:00.000Z",
        sourceUpdatedAt: "2026-08-07T00:00:00.000Z",
      },
    },
    previousStatus: "pending" as const,
    currentStatus,
    undoToken: null,
    pendingGasUpdateId: null,
  };
}

describe("completeCircleVisit", () => {
  test.each([
    ["purchased", "purchase"],
    ["held", "hold"],
  ] as const)(
    "runs status, pending query, and %s Route Guidance in order",
    async (nextStatus, action) => {
      const calls: string[] = [];
      const status = statusResult(nextStatus);
      const remainingCircles = [{ space: "A-02" }];
      const changeStatus = vi.fn(() => {
        calls.push("status");
        return status;
      });
      const getPendingCircles = vi.fn(() => {
        calls.push("pending");
        return remainingCircles;
      });
      const finishCurrentCircle = vi.fn(async () => {
        calls.push("route");
        return { kind: "advanced" as const };
      });

      await expect(
        completeCircleVisit(
          { changeStatus },
          getPendingCircles,
          finishCurrentCircle,
          {
            eventDay,
            circleSpace: "A-01",
            nextStatus,
            expectedSourceGeneration: "generation-1",
          },
        ),
      ).resolves.toEqual({
        statusResult: status,
        routeGuidanceResult: { kind: "advanced" },
      });
      expect(calls).toEqual(["status", "pending", "route"]);
      expect(finishCurrentCircle).toHaveBeenCalledWith({
        action,
        completedSpace: "A-01",
        remainingCircles,
      });
    },
  );

  test("does not query pending circles or Route Guidance when status throws", async () => {
    const failure = new Error("local save failed");
    const getPendingCircles = vi.fn(() => []);
    const finishCurrentCircle = vi.fn();

    await expect(
      completeCircleVisit(
        {
          changeStatus: () => {
            throw failure;
          },
        },
        getPendingCircles,
        finishCurrentCircle,
        {
          eventDay,
          circleSpace: "A-01",
          nextStatus: "purchased",
          expectedSourceGeneration: "generation-1",
        },
      ),
    ).rejects.toBe(failure);
    expect(getPendingCircles).not.toHaveBeenCalled();
    expect(finishCurrentCircle).not.toHaveBeenCalled();
  });

  test("retains the successful status result when Route Guidance fails", async () => {
    const status = statusResult("purchased");

    await expect(
      completeCircleVisit(
        { changeStatus: () => status },
        () => [{ space: "A-02" }],
        async () => ({ kind: "failed", reason: "route-unavailable" }),
        {
          eventDay,
          circleSpace: "A-01",
          nextStatus: "purchased",
          expectedSourceGeneration: "generation-1",
        },
      ),
    ).resolves.toEqual({
      statusResult: status,
      routeGuidanceResult: {
        kind: "failed",
        reason: "route-unavailable",
      },
    });
  });
});
