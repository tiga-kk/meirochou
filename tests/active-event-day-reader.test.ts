import { expect, test } from "vitest";
import type { LocalEventDayState } from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import { createActiveEventDayReader } from "../apps/webapp/js/features/event-day/use-cases/active-event-day-reader";
import { createActiveEventDaySession } from "../apps/webapp/js/features/event-day/use-cases/active-event-day-session";

const state = (
  circleStates: Record<string, "held" | "purchased">,
): LocalEventDayState => ({
  schemaVersion: 2,
  source: { type: "csv", fileName: "demo.csv" },
  sourceGeneration: "g",
  circles: [{ space: "A01" }, { space: "A02" }],
  circleStates,
  gasOutbox: [],
  timestamps: {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
  },
});

test("derives every list from current state", () => {
  const session = createActiveEventDaySession();
  const reader = createActiveEventDayReader(session);
  session.setActiveEventDay(
    { eventId: "demo-v1", dayId: "day1" },
    state({ A01: "purchased", A02: "held" }),
  );
  expect(reader.getPurchasedCircleSpaces()).toEqual(["A01"]);
  expect(reader.getHeldCircleSpaces()).toEqual(["A02"]);
  session.replaceActiveEventDayState(state({ A02: "purchased" }));
  expect(reader.getPurchasedCircleSpaces()).toEqual(["A02"]);
  expect(reader.getHeldCircleSpaces()).toEqual([]);
});
