import { describe, expect, test, vi } from "vitest";
import { completeCircleVisit } from "../apps/webapp/js/app/complete-circle-visit";

const eventDay = { eventId: "C108", dayId: "day1" };

describe("completeCircleVisit", () => {
  test.each([
    ["purchase", "purchased"],
    ["hold", "held"],
  ] as const)("forwards %s status mutation arguments", (_action, nextStatus) => {
    const result = { state: {}, currentStatus: nextStatus };
    const changeStatus = vi.fn(() => result);

    expect(
      completeCircleVisit(
        { changeStatus },
        {
          eventDay,
          circleSpace: "A-01",
          nextStatus,
          expectedSourceGeneration: "generation-1",
        },
      ),
    ).toBe(result);
    expect(changeStatus).toHaveBeenCalledWith({
      eventDay,
      circleSpace: "A-01",
      nextStatus,
      expectedSourceGeneration: "generation-1",
    });
  });

  test("propagates a status mutation failure", () => {
    const failure = new Error("local save failed");

    expect(() =>
      completeCircleVisit(
        { changeStatus: () => { throw failure; } },
        {
          eventDay,
          circleSpace: "A-01",
          nextStatus: "purchased",
          expectedSourceGeneration: "generation-1",
        },
      ),
    ).toThrow(failure);
  });
});
