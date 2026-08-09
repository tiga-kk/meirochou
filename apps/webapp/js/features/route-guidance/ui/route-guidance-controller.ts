import type {
  Circle,
  CircleVisitState,
  EventDayRef,
} from "../../event-day/public-api";
import type { NavigationSnapshot } from "../use-cases/route-guidance-snapshot-repository";
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
import type {
  ResumeRouteGuidanceResult,
  RouteGuidanceRuntimePort,
  ResumeRouteGuidanceUseCase,
} from "../use-cases/resume-route-guidance";
import type { StartRouteGuidanceUseCase } from "../use-cases/start-route-guidance";
import type { RouteGuidanceNavigationOperations } from "../use-cases/route-guidance-navigation-operations";

export interface RouteGuidanceControllerDependencies {
  startGuidance: StartRouteGuidanceUseCase;
  resumeGuidance: ResumeRouteGuidanceUseCase;
  changeDestination: ChangeDestinationUseCase;
  finishCircle: FinishCurrentCircleUseCase;
  session?: RouteGuidanceSession;
  invalidateGuidance?: InvalidateRouteGuidanceUseCase;
  applyOptimizedOrder?: ApplyOptimizedRouteOrderUseCase;
  navigationRuntimeController: RouteGuidanceRuntimePort;
  navigationOperations?: RouteGuidanceNavigationOperations;
}

export interface InitializeResumeStartupInput {
  readonly eventDay: EventDayRef;
  readonly bundleVersion: string;
  readonly circleStates: Record<string, CircleVisitState>;
  readonly pendingCircleSpaces: readonly string[];
}

export type StartRouteGuidanceControllerInput = Omit<
  Parameters<StartRouteGuidanceUseCase["execute"]>[0],
  "matrixRef" | "optimizationTimeLimitMs"
>;

export type InitializeResumeStartupResult =
  | { readonly kind: "idle" }
  | {
      readonly kind: "ready";
      readonly targetSpace: string;
    };

export class RouteGuidanceController {
  private optimizationTimeLimitMs: 5000 | 10000 | 15000 = 10000;

  constructor(private deps: RouteGuidanceControllerDependencies) {}

  async resumeSavedGuidance(
    eventDay: EventDayRef,
    circles: readonly Circle[],
    circleStates: Record<string, CircleVisitState> = {},
  ): Promise<ResumeRouteGuidanceResult> {
    const result = await this.deps.resumeGuidance.execute({
      eventDay,
      circles,
      circleStates,
    });
    if (result.kind === "resumed") {
      this.setOptimizationTimeLimit(result.optimizationTimeLimitMs);
    }
    return result;
  }

  async startFromCurrentLocation(
    input: StartRouteGuidanceControllerInput,
  ): Promise<void> {
    return this.deps.startGuidance.execute({
      ...input,
      matrixRef: this.deps.navigationRuntimeController.getMatrixRef(),
      optimizationTimeLimitMs: this.optimizationTimeLimitMs,
    });
  }

  initializeResumeStartup(
    input: InitializeResumeStartupInput,
  ): InitializeResumeStartupResult {
    const startup = this.deps.navigationRuntimeController.initStartup({
      eventId: input.eventDay.eventId,
      dayId: input.eventDay.dayId,
      bundleVersion: input.bundleVersion,
      circleStates: input.circleStates,
      pendingCircleSpaces: input.pendingCircleSpaces,
    });
    const targetSpace = startup.snapshot?.navState.targetSpace;
    if (!startup.shouldShowResumeDialog || !targetSpace) {
      return { kind: "idle" };
    }
    return {
      kind: "ready",
      targetSpace,
    };
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

  cancelDestinationSelection(): boolean {
    return this.deps.changeDestination.cancelSelection();
  }

  removePurchasedSpaceFromOrder(space: string): boolean {
    const session = this.deps.session;
    const operations = this.deps.navigationOperations;
    const snapshot = session?.getSnapshot();
    if (!session || !operations || !snapshot?.navigationState) return false;
    session.replaceSnapshot({
      ...snapshot,
      navigationState: operations.removePurchasedSpace(
        snapshot.navigationState,
        space,
      ),
    });
    return true;
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

  resetRuntimeState(): void {
    this.deps.navigationRuntimeController.invalidateActiveOptimization();
    this.deps.navigationRuntimeController.setPendingResumeSnapshot(null);
    this.deps.navigationRuntimeController.setMatrixRef(null);
    this.reset();
  }

  setOptimizationTimeLimit(value: 5000 | 10000 | 15000): void {
    this.optimizationTimeLimitMs = value;
  }

  saveSnapshot(
    eventDay: EventDayRef,
    bundleVersion: string,
  ): NavigationSnapshot | null {
    const navState = this.requireSession().getSnapshot().navigationState;
    if (!bundleVersion || !navState?.areaId) return null;
    const snapshot: NavigationSnapshot = {
      schemaVersion: 1,
      eventId: eventDay.eventId,
      dayId: eventDay.dayId,
      areaId: navState.areaId,
      bundleVersion,
      matrixRef: this.deps.navigationRuntimeController.getMatrixRef(),
      navState,
      optimizationTimeLimitMs: this.optimizationTimeLimitMs,
      savedAt: new Date().toISOString(),
    };
    this.deps.navigationRuntimeController.saveSnapshot(
      eventDay.eventId,
      eventDay.dayId,
      snapshot,
    );
    return snapshot;
  }

  clearSavedSnapshot(eventDay: EventDayRef): void {
    this.deps.navigationRuntimeController.clearSnapshot(
      eventDay.eventId,
      eventDay.dayId,
    );
  }

  invalidatePersistence(eventDay: EventDayRef, clearMatrix = false): void {
    this.clearSavedSnapshot(eventDay);
    if (clearMatrix) {
      this.deps.navigationRuntimeController.deleteMatrix(
        eventDay.eventId,
        eventDay.dayId,
      );
    }
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
