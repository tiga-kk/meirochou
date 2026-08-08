import type { Circle, EventDayRef } from "../../event-day/public-api";
import type { RouteGuidanceSession } from "../domain/route-guidance-types";
import type { ApplyOptimizedRouteOrderUseCase } from "../use-cases/apply-optimized-route-order";
import type {
  ChangeDestinationUseCase,
  DestinationSelectionResult,
  ManualDestinationResult,
} from "../use-cases/change-destination";
import type {
  FinishCurrentCircleInput,
  FinishCurrentCircleResult,
  FinishCurrentCircleUseCase,
} from "../use-cases/finish-current-circle";
import type { InvalidateRouteGuidanceUseCase } from "../use-cases/invalidate-route-guidance";
import type { ResumeRouteGuidanceUseCase } from "../use-cases/resume-route-guidance";
import type { StartRouteGuidanceUseCase } from "../use-cases/start-route-guidance";

export interface RouteGuidanceControllerDependencies {
  startGuidance: StartRouteGuidanceUseCase;
  resumeGuidance: ResumeRouteGuidanceUseCase;
  changeDestination: ChangeDestinationUseCase;
  finishCircle: FinishCurrentCircleUseCase;
  session?: RouteGuidanceSession;
  invalidateGuidance?: InvalidateRouteGuidanceUseCase;
  applyOptimizedOrder?: ApplyOptimizedRouteOrderUseCase;
}

export class RouteGuidanceController {
  private optimizationTimeLimitMs: 5000 | 10000 | 15000 = 10000;

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

  async selectDestination(
    circleSpace: string,
    circles: readonly Circle[],
  ): Promise<DestinationSelectionResult> {
    return this.deps.changeDestination.execute({ circleSpace, circles });
  }

  compareSelectedDestination(): boolean {
    return this.deps.changeDestination.compare();
  }

  confirmSelectedDestination(): Circle | null {
    return this.deps.changeDestination.confirm();
  }

  cancelDestinationComparison(): boolean {
    return this.deps.changeDestination.cancelComparison();
  }

  /** Rebuilds and commits a manually selected destination. */
  async setManualDestination(
    circleSpace: string,
    circles: readonly Circle[],
  ): Promise<ManualDestinationResult> {
    return this.deps.changeDestination.changeManually({ circleSpace, circles });
  }

  /** Invalidates a candidate calculation owned by a superseding workflow. */
  invalidatePendingDestinationSelection(): void {
    this.deps.changeDestination.invalidatePendingSelection();
  }

  async finishCurrentCircle(
    input: FinishCurrentCircleInput,
  ): Promise<FinishCurrentCircleResult> {
    return this.deps.finishCircle.execute(input);
  }

  reset(): void {
    if (this.deps.invalidateGuidance) this.deps.invalidateGuidance.execute();
    else this.requireSession().clear();
  }

  setOptimizationTimeLimit(value: 5000 | 10000 | 15000): void {
    this.optimizationTimeLimitMs = value;
  }

  getOptimizationTimeLimit(): 5000 | 10000 | 15000 {
    return this.optimizationTimeLimitMs;
  }

  async applyOptimizedOrder(
    optimizedOrder: readonly string[],
    generation: number,
  ): Promise<void> {
    if (this.deps.applyOptimizedOrder) {
      return this.deps.applyOptimizedOrder.execute(optimizedOrder, generation);
    }
  }

  private requireSession(): RouteGuidanceSession {
    if (!this.deps.session) {
      throw new Error("Route guidance session is not configured");
    }
    return this.deps.session;
  }
}
