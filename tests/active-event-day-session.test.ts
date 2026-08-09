import { describe, expect, test } from "vitest";
import { createActiveEventDaySession } from "../apps/webapp/js/features/event-day/use-cases/active-event-day-session";
import { createEmptyEventDayState } from "../apps/webapp/js/state/storage-schema";

const ref = { eventId: "demo-v1", dayId: "day1" };
const state = () =>
  createEmptyEventDayState(
    { type: "csv", fileName: "empty.csv" },
    "g",
    "2026-01-01T00:00:00.000Z",
  );

describe("ActiveEventDaySession", () => {
  test("keeps one active snapshot and notifies on transitions", () => {
    const session = createActiveEventDaySession();
    const values: unknown[] = [];
    const unsubscribe = session.subscribe((value) => values.push(value));
    session.setActiveEventDay(ref, state());
    session.replaceActiveEventDayState({
      ...state(),
      sourceGeneration: "next",
    });
    session.clearActiveEventDay();
    unsubscribe();
    session.setActiveEventDay(ref, state());
    expect(values).toHaveLength(3);
    expect(session.getActiveEventDay()).not.toBeNull();
  });

  test("returns immutable copies", () => {
    const session = createActiveEventDaySession();
    session.setActiveEventDay(ref, {
      ...state(),
      circles: [{ space: "A-01" }],
      circleStates: { "A-01": "purchased" },
    });
    const snapshot = session.getActiveEventDay();
    if (!snapshot) throw new Error("snapshot missing");
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.state)).toBe(true);
    expect(Object.isFrozen(snapshot?.state.circles)).toBe(true);
    expect(Object.isFrozen(snapshot?.state.circles[0])).toBe(true);
    expect(Object.isFrozen(snapshot?.state.circleStates)).toBe(true);
    expect(() => {
      (snapshot?.ref as { eventId: string }).eventId = "x";
    }).toThrow();
    expect(() => {
      (snapshot.state.circles as { space: string }[])[0].space = "B-02";
    }).toThrow();
    expect(() => {
      (snapshot.state.circleStates as Record<string, string>)["A-01"] = "held";
    }).toThrow();
  });
});
