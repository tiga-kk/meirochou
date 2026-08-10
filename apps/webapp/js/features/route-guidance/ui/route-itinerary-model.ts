import type { Circle } from "../../event-day/public-api";
import type { RouteGuidanceSessionSnapshot } from "../domain/route-guidance-types";

export interface RouteItineraryEntry {
  readonly index: number;
  readonly space: string;
  readonly circle: Circle;
  readonly isCurrent: boolean;
}

/** Builds the read-only pending order without changing Route Guidance state. */
export function buildRouteItineraryModel(
  snapshot: RouteGuidanceSessionSnapshot,
  pendingCircles: readonly Circle[],
): readonly RouteItineraryEntry[] {
  const navigationState = snapshot.navigationState;
  if (!navigationState) return [];

  const order =
    navigationState.bestOrder.length > 0
      ? navigationState.bestOrder
      : navigationState.provisionalOrder;
  const circlesBySpace = new Map(
    pendingCircles
      .filter((circle) => Boolean(circle?.space))
      .map((circle) => [circle.space, circle] as const),
  );
  const seen = new Set<string>();
  const currentSpace = snapshot.currentDestination?.space;
  const entries: RouteItineraryEntry[] = [];

  for (const space of order) {
    const circle = circlesBySpace.get(space);
    if (!circle || seen.has(space)) continue;
    seen.add(space);
    entries.push({
      index: entries.length + 1,
      space,
      circle,
      isCurrent: space === currentSpace,
    });
  }
  return entries;
}
