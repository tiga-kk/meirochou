import { describe, expect, it } from "vitest";
import { ChangeCircleStatusUseCase } from "../apps/webapp/js/features/circle-status/use-cases/change-circle-status";
import { UndoCircleStatusChangeUseCase } from "../apps/webapp/js/features/circle-status/use-cases/undo-circle-status-change";
import type {
  ActiveEventDaySession,
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import { createEmptyEventDayState } from "../apps/webapp/js/state/storage-schema";

const REF: EventDayRef = { eventId: "c108", dayId: "day1" };
const CREATED_AT = "2026-08-04T00:00:00.000Z";

function createSession(): ActiveEventDaySession {
  return {
    getActiveEventDay: () => null,
    replaceActiveEventDayState: () => {},
    setActiveEventDay: () => {},
    clearActiveEventDay: () => {},
    subscribe: () => () => {},
  };
}

function createFixture() {
  let state: LocalEventDayState = {
    ...createEmptyEventDayState(
      { type: "csv", fileName: "demo.csv" },
      "gen-1",
      CREATED_AT,
    ),
    circles: [{ space: "A01" }],
  };
  const repository: EventDayRepository = {
    load: () => state,
    save: (_ref, nextState) => {
      state = nextState;
    },
  };
  return { repository, getState: () => state };
}

describe("UndoCircleStatusChangeUseCase", () => {
  it("consumes a valid token once and rejects replay", () => {
    const fixture = createFixture();
    const change = new ChangeCircleStatusUseCase(
      fixture.repository,
      createSession(),
      undefined,
      { createUndoId: () => "undo-1" },
    );
    const changed = change.execute({
      eventDay: REF,
      circleSpace: "A01",
      nextStatus: "held",
      expectedSourceGeneration: "gen-1",
      changedAt: CREATED_AT,
    });
    if (!changed.undoToken) throw new Error("Expected undo token");
    const token = changed.undoToken;
    const undo = new UndoCircleStatusChangeUseCase(
      fixture.repository,
      createSession(),
      undefined,
      { now: () => "2026-08-04T00:00:01.000Z", ttlMs: 5000 },
    );

    undo.execute({ undoToken: token });

    expect(fixture.getState().circleStates.A01).toBeUndefined();
    expect(() => undo.execute({ undoToken: token })).toThrow(
      "already been consumed",
    );
  });

  it("rejects an expired token before saving", () => {
    const fixture = createFixture();
    const change = new ChangeCircleStatusUseCase(
      fixture.repository,
      createSession(),
      undefined,
      { createUndoId: () => "undo-2" },
    );
    const changed = change.execute({
      eventDay: REF,
      circleSpace: "A01",
      nextStatus: "held",
      expectedSourceGeneration: "gen-1",
      changedAt: CREATED_AT,
    });
    if (!changed.undoToken) throw new Error("Expected undo token");
    let saveCount = 0;
    const repository: EventDayRepository = {
      load: fixture.repository.load,
      save: (ref, nextState) => {
        saveCount += 1;
        fixture.repository.save(ref, nextState);
      },
    };
    const undo = new UndoCircleStatusChangeUseCase(
      repository,
      createSession(),
      undefined,
      { now: () => "2026-08-04T00:00:06.000Z", ttlMs: 5000 },
    );

    expect(() => undo.execute({ undoToken: changed.undoToken })).toThrow(
      "expired",
    );
    expect(saveCount).toBe(0);
  });
});
