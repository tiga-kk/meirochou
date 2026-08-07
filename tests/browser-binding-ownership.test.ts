import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { completeCircleVisit } from "../apps/webapp/js/app/complete-circle-visit";

const bindingSource = readFileSync(
  new URL(
    "../apps/webapp/js/app/bind-browser-events.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("browser binding ownership", () => {
  it("keeps infrastructure and feature state outside the browser binder", () => {
    expect(bindingSource).not.toContain("@ts-nocheck");
    expect(bindingSource).not.toMatch(
      /from ["']\.\.\/features\/[^"']+\/infrastructure\//,
    );
    expect(bindingSource).not.toMatch(/new (StorageService|Worker)\b/);
    expect(bindingSource).not.toContain("Object.defineProperties");
  });

  it("keeps the unconnected cross-feature visit contract in public-operation order", async () => {
    const calls: string[] = [];
    const circleStatus = {
      changeStatus: () => {
        calls.push("circle-status");
        return { undoToken: null };
      },
      undo: () => true,
    };
    const routeGuidance = {
      finishCurrentCircle: async () => {
        calls.push("route-guidance");
      },
    };

    await completeCircleVisit(
      circleStatus,
      routeGuidance,
      {
        eventDay: { eventId: "event", dayId: "day" },
        circleSpace: "A-01",
        nextStatus: "purchased",
        expectedSourceGeneration: "generation",
      },
      ["A-01", []],
    );

    expect(calls).toEqual(["circle-status", "route-guidance"]);
  });

  it("does not invoke route guidance when the circle status operation fails", async () => {
    const routeGuidance = { finishCurrentCircle: async () => {} };
    let routeCalled = false;
    routeGuidance.finishCurrentCircle = async () => {
      routeCalled = true;
    };

    await expect(
      completeCircleVisit(
        {
          changeStatus: () => {
            throw new Error("status failed");
          },
          undo: () => false,
        },
        routeGuidance,
        {
          eventDay: { eventId: "event", dayId: "day" },
          circleSpace: "A-01",
          nextStatus: "held",
          expectedSourceGeneration: "generation",
        },
        ["A-01", []],
      ),
    ).rejects.toThrow("status failed");
    expect(routeCalled).toBe(false);
  });
});
