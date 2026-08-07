// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import type {
  CircleRecord,
  CircleStateOverrides,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import { CircleStateUndoService } from "../apps/webapp/js/state/circle-state-undo-service";
import {
  buildAllCircleList,
  buildUnpurchasedCircleList,
  getAvailableActionsForCircle,
} from "../apps/webapp/js/ui/circle-list-view-model";

describe("Phase 5C Task 3: Circle List View Model", () => {
  const sampleCircles: CircleRecord[] = [
    { space: "A-01", priority: 1 },
    { space: "A-02", priority: 2 },
    { space: "A-03", priority: 3 },
    { space: "A-04", priority: 4 },
  ];

  const circleStates: CircleStateOverrides = {
    "A-01": "purchased",
    "A-02": "held",
    "A-04": "excluded",
    // "A-03" is implicitly "pending"
  };

  test("buildUnpurchasedCircleList splits circles into pending and held sections, omitting purchased and excluded", () => {
    const list = buildUnpurchasedCircleList(sampleCircles, circleStates);

    expect(list.pendingSection.map((c) => c.space)).toEqual(["A-03"]);
    expect(list.heldSection.map((c) => c.space)).toEqual(["A-02"]);
  });

  test("buildAllCircleList includes all circles with status badges for all 4 states", () => {
    const list = buildAllCircleList(sampleCircles, circleStates);

    expect(list).toHaveLength(4);
    expect(list.find((item) => item.circle.space === "A-01")?.badge).toBe(
      "purchased",
    );
    expect(list.find((item) => item.circle.space === "A-02")?.badge).toBe(
      "held",
    );
    expect(list.find((item) => item.circle.space === "A-03")?.badge).toBe(
      "pending",
    );
    expect(list.find((item) => item.circle.space === "A-04")?.badge).toBe(
      "excluded",
    );
  });

  test("getAvailableActionsForCircle returns state-specific valid actions only", () => {
    const pendingActions = getAvailableActionsForCircle("A-03", "pending");
    expect(pendingActions.primary).toBe("set-target");
    expect(pendingActions.secondary).toContain("hold");
    expect(pendingActions.menu).toContain("mark-purchased");
    expect(pendingActions.menu).toContain("exclude");

    const heldActions = getAvailableActionsForCircle("A-02", "held");
    expect(heldActions.primary).toBe("set-target");
    expect(heldActions.secondary).toContain("unhold");
    expect(heldActions.menu).toContain("mark-purchased");
    expect(heldActions.menu).toContain("exclude");

    const purchasedActions = getAvailableActionsForCircle("A-01", "purchased");
    expect(purchasedActions.primary).toBe("unmark-purchased");
    expect(purchasedActions.secondary).toBeUndefined();

    const excludedActions = getAvailableActionsForCircle("A-04", "excluded");
    expect(excludedActions.primary).toBe("restore");
    expect(excludedActions.secondary).toBeUndefined();
  });
});

describe("Phase 5C Task 3: CircleStateUndoService", () => {
  test("issues a token that can be retrieved before TTL expires", () => {
    const svc = new CircleStateUndoService(5000);
    const nowMs = Date.now();

    const token = svc.issue("A-01", "pending", "held", nowMs);
    expect(token.space).toBe("A-01");
    expect(token.before).toBe("pending");
    expect(token.after).toBe("held");
    expect(token.createdAtMs).toBe(nowMs);

    expect(svc.getCurrentToken()).toEqual(token);
  });

  test("consume returns the token and clears it", () => {
    const svc = new CircleStateUndoService(5000);
    svc.issue("A-01", "pending", "held", Date.now());

    const consumed = svc.consume();
    expect(consumed?.space).toBe("A-01");
    expect(svc.getCurrentToken()).toBeNull();
  });

  test("issuing a new token replaces the previous one", () => {
    const svc = new CircleStateUndoService(5000);
    svc.issue("A-01", "pending", "held", Date.now());
    svc.issue("A-02", "pending", "excluded", Date.now());

    const token = svc.getCurrentToken();
    expect(token?.space).toBe("A-02");
  });

  test("clearPending removes the token", () => {
    const svc = new CircleStateUndoService(5000);
    svc.issue("A-01", "pending", "held", Date.now());
    svc.clearPending();

    expect(svc.getCurrentToken()).toBeNull();
  });

  test("token expires after TTL and returns null", async () => {
    const svc = new CircleStateUndoService(50); // 50ms TTL for test speed
    svc.issue("A-01", "pending", "held", Date.now());

    await new Promise((r) => setTimeout(r, 80));
    expect(svc.getCurrentToken()).toBeNull();
  });
});
