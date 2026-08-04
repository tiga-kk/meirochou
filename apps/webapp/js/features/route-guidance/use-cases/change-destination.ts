import type { Circle } from "../../event-day/public-api";
import type { RouteGuidanceSession } from "../domain/route-guidance-types";

export interface ChangeDestinationInput {
  readonly circleSpace: string;
  readonly circles: readonly Circle[];
}

export class ChangeDestinationUseCase {
  constructor(private session: RouteGuidanceSession) {}

  async execute(input: ChangeDestinationInput): Promise<void> {
    const snap = this.session.getSnapshot();
    if (!snap.navigationState) return;

    const selected =
      input.circles.find((c) => c.space === input.circleSpace) ?? null;
    this.session.replaceSnapshot({
      ...snap,
      selectedDestination: selected,
      selectionStatus: "ready",
    });
  }
}
