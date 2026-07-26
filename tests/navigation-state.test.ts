import { describe, expect, test } from "vitest";
import {
  type ConfirmedPosition,
  NavigationStateMachine,
} from "../apps/webapp/js/state/navigation-state";

describe("Phase 5C Task 2: Navigation State Machine", () => {
  const startPos: ConfirmedPosition = {
    areaId: "e456",
    gridIndex: 123,
    svgX: 100,
    svgY: 200,
    source: "manual-start",
  };

  const circleAPos: ConfirmedPosition = {
    areaId: "e456",
    gridIndex: 456,
    svgX: 150,
    svgY: 250,
    source: "arrived-circle",
    circleSpace: "A-01",
  };

  test("current position does not change to target before arrive is called", () => {
    const sm = new NavigationStateMachine();
    sm.setStart({
      areaId: "e456",
      position: startPos,
      targetSpace: "A-01",
      order: ["A-01", "A-02"],
    });

    const stateBefore = sm.getState();
    expect(stateBefore.stage).toBe("navigating");
    expect(stateBefore.currentPosition).toEqual(startPos);
    expect(stateBefore.targetSpace).toBe("A-01");

    // Optimizer result updates bestOrder but NEVER changes target or currentPosition
    sm.applyOptimizerResult(["A-01", "A-02"]);
    const stateAfterOpt = sm.getState();
    expect(stateAfterOpt.currentPosition).toEqual(startPos);
    expect(stateAfterOpt.targetSpace).toBe("A-01");
  });

  test("arrive moves current position to target endpoint and sets stage to atTarget", () => {
    const sm = new NavigationStateMachine();
    sm.setStart({
      areaId: "e456",
      position: startPos,
      targetSpace: "A-01",
      order: ["A-01", "A-02"],
    });

    sm.arrive(circleAPos);

    const state = sm.getState();
    expect(state.stage).toBe("atTarget");
    expect(state.currentPosition).toEqual(circleAPos);
    expect(state.targetSpace).toBe("A-01");
  });

  test("optimizer result updates bestOrder only and preserves current target and locked leg", () => {
    const sm = new NavigationStateMachine();
    sm.setStart({
      areaId: "e456",
      position: startPos,
      targetSpace: "A-01",
      order: ["A-01", "A-02", "A-03"],
    });

    const lockedBefore = sm.getState().lockedFirstLeg;

    sm.applyOptimizerResult(["A-01", "A-03", "A-02"]);

    const state = sm.getState();
    expect(state.bestOrder).toEqual(["A-01", "A-03", "A-02"]);
    expect(state.targetSpace).toBe("A-01");
    expect(state.lockedFirstLeg).toEqual(lockedBefore);
  });

  test("manual target change updates target and lockedFirstLeg while old target remains available", () => {
    const sm = new NavigationStateMachine();
    sm.setStart({
      areaId: "e456",
      position: startPos,
      targetSpace: "A-01",
      order: ["A-01", "A-02"],
    });

    sm.changeTarget("A-02");

    const state = sm.getState();
    expect(state.stage).toBe("navigating");
    expect(state.targetSpace).toBe("A-02");
    expect(state.currentPosition).toEqual(startPos);
    expect(state.lockedFirstLeg).toEqual({
      from: { type: "start", areaId: "e456", gridIndex: 123 },
      toSpace: "A-02",
    });
  });

  test("resetStart clears navigation state to idle without mutating external circle states", () => {
    const sm = new NavigationStateMachine();
    sm.setStart({
      areaId: "e456",
      position: startPos,
      targetSpace: "A-01",
      order: ["A-01", "A-02"],
    });

    sm.resetStart();

    const state = sm.getState();
    expect(state.stage).toBe("idle");
    expect(state.areaId).toBeNull();
    expect(state.currentPosition).toBeNull();
    expect(state.targetSpace).toBeNull();
    expect(state.lockedFirstLeg).toBeNull();
    expect(state.provisionalOrder).toEqual([]);
    expect(state.bestOrder).toEqual([]);
  });

  test("rejects invalid events with NavigationStateError", () => {
    const sm = new NavigationStateMachine();
    // Idle stage rejects changeTarget and arrive
    expect(() => sm.changeTarget("A-01")).toThrow();
    expect(() => sm.arrive(circleAPos)).toThrow();
  });

  test("processVisitStateChange updates navigation state when candidates remain or empty out", () => {
    const sm = new NavigationStateMachine();
    sm.setStart({
      areaId: "e456",
      position: startPos,
      targetSpace: "A-01",
      order: ["A-01", "A-02"],
    });

    sm.arrive(circleAPos);
    expect(sm.getState().stage).toBe("atTarget");

    // After circle state change (e.g. purchased A-01), advance to next target A-02
    sm.processVisitStateChange({
      nextTargetSpace: "A-02",
      remainingOrder: ["A-02"],
    });

    const stateNext = sm.getState();
    expect(stateNext.stage).toBe("navigating");
    expect(stateNext.targetSpace).toBe("A-02");
    expect(stateNext.currentPosition).toEqual(circleAPos); // Position stays at A-01 until next arrive
    expect(stateNext.lockedFirstLeg).toEqual({
      from: { type: "circle", space: "A-01" },
      toSpace: "A-02",
    });

    // When no candidates remain, transition to idle
    sm.processVisitStateChange({
      nextTargetSpace: null,
      remainingOrder: [],
    });

    expect(sm.getState().stage).toBe("idle");
  });
});
