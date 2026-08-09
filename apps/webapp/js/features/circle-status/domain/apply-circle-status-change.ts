import type { LocalEventDayState } from "../../event-day/public-api";
import type { CircleStatus } from "./circle-status-types";

export function applyCircleStatusChange(
  state: LocalEventDayState,
  circleSpace: string,
  nextStatus: CircleStatus,
): {
  readonly state: LocalEventDayState;
  readonly previousStatus: CircleStatus;
} {
  const currentOverride = state.circleStates[circleSpace];
  const previousStatus: CircleStatus = currentOverride ?? "pending";

  const nextCircleStates = { ...state.circleStates };
  if (nextStatus === "pending") {
    delete nextCircleStates[circleSpace];
  } else {
    nextCircleStates[circleSpace] = nextStatus;
  }

  return {
    state: {
      ...state,
      circleStates: Object.freeze(nextCircleStates),
    },
    previousStatus,
  };
}
