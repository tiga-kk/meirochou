// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import type {
  CircleRecord,
  CircleStateOverrides,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import { ChangeCircleStatusUseCase } from "../apps/webapp/js/features/circle-status/use-cases/change-circle-status";
import { UndoCircleStatusChangeUseCase } from "../apps/webapp/js/features/circle-status/use-cases/undo-circle-status-change";
import { CircleStatusController } from "../apps/webapp/js/features/circle-status/ui/circle-status-controller";
import type {
  ActiveEventDaySession,
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import { createEmptyEventDayState } from "../apps/webapp/js/state/storage-schema";
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

describe("Phase 5C Task 3: Circle status undo lifecycle", () => {
  const eventDay: EventDayRef = { eventId: "c108", dayId: "day1" };
  const createdAt = "2026-08-04T00:00:00.000Z";

  function createUndoFixture() {
    let state: LocalEventDayState = {
      ...createEmptyEventDayState(
        { type: "csv", fileName: "demo.csv" },
        "gen-1",
        createdAt,
      ),
      circles: [{ space: "A01" }],
    };
    const repository: EventDayRepository = {
      load: () => state,
      save: (_ref, nextState) => {
        state = nextState;
      },
    };
    const session: ActiveEventDaySession = {
      getActiveEventDay: () => null,
      replaceActiveEventDayState: () => {},
      setActiveEventDay: () => {},
      clearActiveEventDay: () => {},
      subscribe: () => () => {},
    };
    return { repository, session, getState: () => state };
  }

  function issueToken(fixture: ReturnType<typeof createUndoFixture>) {
    return new ChangeCircleStatusUseCase(
      fixture.repository,
      fixture.session,
      undefined,
      { createUndoId: () => "undo-1" },
    ).execute({
      eventDay,
      circleSpace: "A01",
      nextStatus: "held",
      expectedSourceGeneration: "gen-1",
      changedAt: createdAt,
    }).undoToken;
  }

  test("issues a token that can be retrieved before TTL expires", () => {
    const fixture = createUndoFixture();
    const token = issueToken(fixture);

    expect(token).toMatchObject({
      undoId: "undo-1",
      circleSpace: "A01",
      previousStatus: "pending",
      currentStatus: "held",
      createdAt,
    });
  });

  test("undo consumes the token and clears the controller state", () => {
    const fixture = createUndoFixture();
    const controller = new CircleStatusController(
      new ChangeCircleStatusUseCase(
        fixture.repository,
        fixture.session,
        undefined,
        { createUndoId: () => "undo-consume" },
      ),
      new UndoCircleStatusChangeUseCase(
        fixture.repository,
        fixture.session,
      ),
    );

    controller.changeStatus({
      eventDay,
      circleSpace: "A01",
      nextStatus: "held",
      expectedSourceGeneration: "gen-1",
    });

    expect(controller.undo()).toBe(true);
    expect(controller.getLastUndoToken()).toBeNull();
    expect(fixture.getState().circleStates.A01).toBeUndefined();
  });

  test("issuing a new token replaces the previous one", () => {
    const fixture = createUndoFixture();
    const change = new ChangeCircleStatusUseCase(
      fixture.repository,
      fixture.session,
      undefined,
      { createUndoId: (() => {
        let sequence = 0;
        return () => `undo-${++sequence}`;
      })() },
    );
    const controller = new CircleStatusController(
      change,
      new UndoCircleStatusChangeUseCase(fixture.repository, fixture.session),
    );

    controller.changeStatus({
      eventDay,
      circleSpace: "A01",
      nextStatus: "held",
      expectedSourceGeneration: "gen-1",
    });
    controller.changeStatus({
      eventDay,
      circleSpace: "A01",
      nextStatus: "purchased",
      expectedSourceGeneration: "gen-1",
    });

    expect(controller.getLastUndoToken()?.undoId).toBe("undo-2");
  });

  test("failed undo clears the expired token", () => {
    const fixture = createUndoFixture();
    const controller = new CircleStatusController(
      new ChangeCircleStatusUseCase(
        fixture.repository,
        fixture.session,
        undefined,
        { createUndoId: () => "undo-controller" },
      ),
      new UndoCircleStatusChangeUseCase(
        fixture.repository,
        fixture.session,
        undefined,
        { now: () => "2026-08-04T00:00:00.051Z", ttlMs: 50 },
      ),
    );

    controller.changeStatus({
      eventDay,
      circleSpace: "A01",
      nextStatus: "held",
      expectedSourceGeneration: "gen-1",
    });
    expect(controller.getLastUndoToken()).not.toBeNull();
    expect(controller.undo()).toBe(false);
    expect(controller.getLastUndoToken()).toBeNull();
  });

  test("token expires after TTL and rejects the undo", () => {
    const fixture = createUndoFixture();
    const token = issueToken(fixture);
    if (!token) throw new Error("Expected undo token");
    const undo = new UndoCircleStatusChangeUseCase(
      fixture.repository,
      fixture.session,
      undefined,
      { now: () => "2026-08-04T00:00:00.051Z", ttlMs: 50 },
    );

    expect(() => undo.execute({ undoToken: token })).toThrow("expired");
    expect(fixture.getState().circleStates.A01).toBe("held");
  });
});
