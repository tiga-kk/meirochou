import type { Circle, CircleStatus } from "../domain/event-day-types";
import type { ActiveEventDaySession } from "./active-event-day-session";

export interface ActiveEventDayReader {
  getAllCircles(): readonly Circle[];
  getPendingCircles(): readonly Circle[];
  getPurchasedCircleSpaces(): readonly string[];
  getHeldCircleSpaces(): readonly string[];
  getCircleStatus(space: string): CircleStatus;
}

export function createActiveEventDayReader(
  session: ActiveEventDaySession,
): ActiveEventDayReader {
  const circles = (): readonly Circle[] =>
    session
      .getActiveEventDay()
      ?.state.circles.filter((circle) => !circle.removedFromSource)
      .map((circle) => ({ ...circle })) ?? [];
  const status = (space: string): CircleStatus => {
    const state = session.getActiveEventDay()?.state;
    return state?.circleStates[space] ?? "pending";
  };
  return {
    getAllCircles: circles,
    getPendingCircles: () =>
      circles().filter((circle) => status(circle.space) === "pending"),
    getPurchasedCircleSpaces: () =>
      circles()
        .filter((circle) => status(circle.space) === "purchased")
        .map((circle) => circle.space),
    getHeldCircleSpaces: () =>
      circles()
        .filter((circle) => status(circle.space) === "held")
        .map((circle) => circle.space),
    getCircleStatus: status,
  };
}
