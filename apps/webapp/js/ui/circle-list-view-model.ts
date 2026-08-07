import type {
  CircleRecord,
  CircleStateOverrides,
  CircleVisitState,
} from "../features/event-day/domain/application-contract-types";
import { getCircleVisitState } from "../state/storage-schema";

export type CircleActionType =
  | "set-target"
  | "hold"
  | "unhold"
  | "mark-purchased"
  | "unmark-purchased"
  | "exclude"
  | "restore";

export interface AvailableCircleActions {
  readonly primary?: CircleActionType;
  readonly secondary?: CircleActionType;
  readonly menu?: readonly CircleActionType[];
}

export interface CircleListItemViewModel {
  readonly circle: CircleRecord;
  readonly visitState: CircleVisitState;
  readonly badge: CircleVisitState;
}

export interface UnpurchasedCircleListViewModel {
  readonly pendingSection: readonly CircleRecord[];
  readonly heldSection: readonly CircleRecord[];
}

export function buildUnpurchasedCircleList(
  circles: readonly CircleRecord[],
  circleStates: CircleStateOverrides,
): UnpurchasedCircleListViewModel {
  const pendingSection: CircleRecord[] = [];
  const heldSection: CircleRecord[] = [];

  for (const circle of circles) {
    const state = getCircleVisitState(circleStates, circle.space);
    if (state === "pending") {
      pendingSection.push(circle);
    } else if (state === "held") {
      heldSection.push(circle);
    }
  }

  return Object.freeze({
    pendingSection: Object.freeze(pendingSection),
    heldSection: Object.freeze(heldSection),
  });
}

export function buildAllCircleList(
  circles: readonly CircleRecord[],
  circleStates: CircleStateOverrides,
): readonly CircleListItemViewModel[] {
  return Object.freeze(
    circles.map((circle) => {
      const visitState = getCircleVisitState(circleStates, circle.space);
      return Object.freeze({
        circle,
        visitState,
        badge: visitState,
      });
    }),
  );
}

export function getAvailableActionsForCircle(
  _space: string,
  visitState: CircleVisitState,
): AvailableCircleActions {
  switch (visitState) {
    case "pending":
      return Object.freeze({
        primary: "set-target" as const,
        secondary: "hold" as const,
        menu: Object.freeze(["mark-purchased", "exclude"] as const),
      });
    case "held":
      return Object.freeze({
        primary: "set-target" as const,
        secondary: "unhold" as const,
        menu: Object.freeze(["mark-purchased", "exclude"] as const),
      });
    case "purchased":
      return Object.freeze({
        primary: "unmark-purchased" as const,
      });
    case "excluded":
      return Object.freeze({
        primary: "restore" as const,
      });
    default:
      return Object.freeze({});
  }
}
