import type { Circle } from "../../event-day/public-api";
import { buildRouteGuidanceScreenModel } from "./route-guidance-screen-model";

/** Compatibility adapter for callers that still use the former formatter signature. */
export function formatTargetViewModel(
  target: Circle | null,
  startSpace = "",
  nextTarget: Circle | null = null,
) {
  return buildRouteGuidanceScreenModel({
    currentDestination: target,
    nextDestination: nextTarget,
    startSpace,
  });
}
