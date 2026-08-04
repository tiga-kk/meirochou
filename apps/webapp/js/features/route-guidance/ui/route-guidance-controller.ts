import type { Circle, EventDayRef } from "../../event-day/public-api";
import type { ChangeDestinationUseCase } from "../use-cases/change-destination";
import type { FinishCurrentCircleUseCase } from "../use-cases/finish-current-circle";
import type { ResumeRouteGuidanceUseCase } from "../use-cases/resume-route-guidance";
import type { StartRouteGuidanceUseCase } from "../use-cases/start-route-guidance";

export interface RouteGuidanceControllerDependencies {
  startGuidance: StartRouteGuidanceUseCase;
  resumeGuidance: ResumeRouteGuidanceUseCase;
  changeDestination: ChangeDestinationUseCase;
  finishCircle: FinishCurrentCircleUseCase;
}

export class RouteGuidanceController {
  constructor(private deps: RouteGuidanceControllerDependencies) {}

  async resumeSavedGuidance(
    eventDay: EventDayRef,
    circles: readonly Circle[],
  ): Promise<boolean> {
    return this.deps.resumeGuidance.execute({ eventDay, circles });
  }

  async startFromCurrentLocation(
    input: Parameters<StartRouteGuidanceUseCase["execute"]>[0],
  ): Promise<void> {
    return this.deps.startGuidance.execute(input);
  }
}
