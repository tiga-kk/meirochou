import type {
  ChangeCircleStatusResult,
  CircleStatusControllerPort,
} from "../features/circle-status/public-api";
import type {
  FinishCurrentCircleInput,
  FinishCurrentCircleResult,
} from "../features/route-guidance/use-cases/finish-current-circle";

type ChangeStatusInput = Parameters<CircleStatusControllerPort["changeStatus"]>[0];

export type CompleteCircleVisitInput = Omit<ChangeStatusInput, "nextStatus"> & {
  readonly nextStatus: "purchased" | "held";
};

export interface CompleteCircleVisitResult {
  readonly statusResult: ChangeCircleStatusResult;
  readonly routeGuidanceResult: FinishCurrentCircleResult;
}

/** Advances Route Guidance only after the Circle Status mutation succeeds. */
export async function completeCircleVisit(
  circleStatusController: Pick<CircleStatusControllerPort, "changeStatus">,
  getPendingCircles: () => FinishCurrentCircleInput["remainingCircles"],
  finishCurrentCircle: (
    input: FinishCurrentCircleInput,
  ) => Promise<FinishCurrentCircleResult>,
  input: CompleteCircleVisitInput,
): Promise<CompleteCircleVisitResult> {
  const statusResult = circleStatusController.changeStatus(input);
  const remainingCircles = getPendingCircles();
  const routeGuidanceResult = await finishCurrentCircle({
    action: input.nextStatus === "purchased" ? "purchase" : "hold",
    completedSpace: input.circleSpace,
    remainingCircles,
  });
  return { statusResult, routeGuidanceResult };
}
