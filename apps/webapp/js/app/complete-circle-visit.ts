import type {
  CircleStatusControllerPort,
} from "../features/circle-status/public-api";

export type CompleteCircleVisitInput =
  Parameters<CircleStatusControllerPort["changeStatus"]>[0];

/** Runs the Circle Status mutation required before any visit-completion workflow. */
export function completeCircleVisit(
  circleStatusController: Pick<CircleStatusControllerPort, "changeStatus">,
  input: CompleteCircleVisitInput,
): ReturnType<CircleStatusControllerPort["changeStatus"]> {
  return circleStatusController.changeStatus(input);
}
