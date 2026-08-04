import type { Circle } from "../../event-day/public-api";
import type { RouteGuidanceSession } from "../domain/route-guidance-types";

export interface FinishCurrentCircleInput {
  readonly completedSpace: string;
  readonly remainingCircles: readonly Circle[];
}

export class FinishCurrentCircleUseCase {
  constructor(private session: RouteGuidanceSession) {}

  async execute(input: FinishCurrentCircleInput): Promise<void> {
    const snap = this.session.getSnapshot();
    if (!snap.navigationState) return;

    const nextDestination =
      input.remainingCircles.find((c) => c.space !== input.completedSpace) ??
      null;
    this.session.replaceSnapshot({
      ...snap,
      currentDestination: nextDestination,
      selectedDestination: null,
      selectedRoute: null,
      selectionStatus: "ready",
    });
  }
}
