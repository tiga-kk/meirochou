import type { Circle, EventDayRef } from "../../event-day/public-api";
import type { RouteGuidanceSession } from "../domain/route-guidance-types";
import type { ApplyOptimizedRouteOrderUseCase } from "../use-cases/apply-optimized-route-order";
import type { ChangeDestinationUseCase } from "../use-cases/change-destination";
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
  ): Promise<void> {
    return this.deps.changeDestination.execute({ circleSpace, circles });
  }

  compareSelectedDestination(): void {
    const session = this.requireSession();
    const snapshot = session.getSnapshot();
    if (!snapshot.selectedDestination || !snapshot.selectedRoute) return;
    session.replaceSnapshot({ ...snapshot, selectionStatus: "comparing" });
  }

  confirmSelectedDestination(): void {
    const session = this.requireSession();
    const snapshot = session.getSnapshot();
    if (snapshot.selectionStatus !== "comparing") return;
    if (!snapshot.selectedDestination || !snapshot.selectedRoute) return;
    session.replaceSnapshot({
      ...snapshot,
      currentDestination: snapshot.selectedDestination,
      currentRoute: snapshot.selectedRoute,
      selectedDestination: null,
      selectedRoute: null,
      selectionStatus: "ready",
    });
  }

  cancelDestinationComparison(): void {
    const session = this.requireSession();
    const snapshot = session.getSnapshot();
    if (snapshot.selectionStatus === "comparing") {
      session.replaceSnapshot({ ...snapshot, selectionStatus: "ready" });
    }
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
