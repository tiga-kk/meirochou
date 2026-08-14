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
import type {
  PrepareRouteOptimizationInput,
  PrepareRouteOptimizationUseCase,
} from "../use-cases/prepare-route-optimization";
import type {
  RouteOptimizationCallbacks,
  RouteOptimizationFeedback,
} from "../use-cases/route-optimization-preview";
import type { NavigationState } from "../domain/route-guidance-types";

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
  prepareOptimization?: PrepareRouteOptimizationUseCase;
  optimizationFeedback?: RouteOptimizationFeedback;
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
  private optimizationRequest = 0;

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
    this.invalidateOptimization();
    await this.deps.startGuidance.execute({
      ...input,
      matrixRef: this.deps.navigationRuntimeController.getMatrixRef(),
      optimizationTimeLimitMs: this.optimizationTimeLimitMs,
    });
    if (!this.deps.prepareOptimization || !this.deps.session) return;
    const request = ++this.optimizationRequest;
    const started = this.deps.session.getSnapshot();
    const navState = started.navigationState;
    if (!navState?.currentPosition || input.pendingCircles.length === 0) return;
    void this.prepareAndLaunchOptimization(request, {
      eventDay: input.eventDay,
      bundleVersion: input.bundleVersion,
      areaId: navState.areaId ?? navState.currentPosition.areaId,
      currentPosition: navState.currentPosition,
      pendingCircles: input.pendingCircles as unknown as PrepareRouteOptimizationInput["pendingCircles"],
      searchTimeLimitMs: this.optimizationTimeLimitMs,
      navState,
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
    this.invalidateOptimization();
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
    this.invalidateOptimization();
    return this.deps.changeDestination.changeManually({ circleSpace, circles });
  }

  /** Invalidates a candidate calculation owned by a superseding workflow. */
  invalidatePendingDestinationSelection(): void {
    this.deps.changeDestination.invalidatePendingSelection();
  }

  async finishCurrentCircle(
    input: FinishCurrentCircleInput,
  ): Promise<FinishCurrentCircleResult> {
    this.invalidateOptimization();
    return this.deps.finishCircle.execute(input);
  }

  reset(): void {
    if (this.deps.invalidateGuidance) this.deps.invalidateGuidance.execute();
    else this.requireSession().clear();
  }

  resetRuntimeState(): void {
    this.invalidateOptimization();
    this.deps.navigationRuntimeController.setPendingResumeSnapshot(null);
    this.deps.navigationRuntimeController.setMatrixRef(null);
    this.reset();
  }

  private invalidateOptimization(): void {
    this.optimizationRequest += 1;
    this.deps.navigationRuntimeController?.invalidateActiveOptimization?.();
    this.deps.optimizationFeedback?.onClear();
  }

  private async prepareAndLaunchOptimization(
    request: number,
    input: PrepareRouteOptimizationInput & { readonly navState: NavigationState },
  ): Promise<void> {
    try {
      const prepared = await this.deps.prepareOptimization!.execute(input);
      if (request !== this.optimizationRequest) return;
      const current = this.deps.session!.getSnapshot();
      if (!current.navigationState || current.navigationState.targetSpace !== input.navState.targetSpace) return;
      this.deps.navigationRuntimeController.setMatrixRef(prepared.matrixRef);
      const started = this.deps.navigationRuntimeController.launchAlnsOptimization(
        {
          navState: current.navigationState,
          areaId: prepared.areaId,
          startDistanceToCircles: prepared.startDistanceToCircles,
          pendingCircles: prepared.pendingCircles,
          distanceMatrix: prepared.distanceMatrix,
          fixedFirstTarget: current.navigationState.targetSpace,
          searchTimeLimitMs: prepared.searchTimeLimitMs,
          randomSeed: 0,
          initialSolutions: [],
        },
        {
          onPreview: (preview) => this.deps.optimizationFeedback?.onPreview(preview),
          onCommit: (nextNavState) => {
            if (request !== this.optimizationRequest) return;
            const snapshot = this.deps.session!.getSnapshot();
            if (snapshot.navigationState?.targetSpace !== nextNavState.targetSpace) return;
            this.deps.session!.replaceSnapshot({ ...snapshot, navigationState: nextNavState });
            this.saveSnapshot(input.eventDay, input.bundleVersion);
            this.deps.optimizationFeedback?.onClear();
          },
          onCancel: () => this.deps.optimizationFeedback?.onClear(),
          onError: (code) => {
            this.deps.optimizationFeedback?.onClear();
            console.warn("Route optimization failed", code);
          },
        } satisfies RouteOptimizationCallbacks,
      );
      const snapshot = this.deps.session!.getSnapshot();
      this.deps.session!.replaceSnapshot({ ...snapshot, navigationState: started });
    } catch (error) {
      if (request === this.optimizationRequest) {
        console.warn("Route optimization preparation failed", error);
      }
    }
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
