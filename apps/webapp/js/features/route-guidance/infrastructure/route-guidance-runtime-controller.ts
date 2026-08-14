import type { NavigationState } from "../domain/route-guidance-types";
import {
  buildOptimizationProblem,
  type OptimizationProblemInput,
} from "../use-cases/build-route-optimization-problem";
import type { RouteGuidanceNavigationOperations } from "../use-cases/route-guidance-navigation-operations";
import type { LocalStorageDistanceMatrixRepository } from "./local-storage-distance-matrix-repository";
import {
  type LocalStorageRouteGuidanceSnapshotRepository,
  validateSnapshotForResume,
} from "./local-storage-route-guidance-snapshot-repository";
import type { NavigationSnapshot } from "../use-cases/route-guidance-snapshot-repository";
import type {
  StartupInitInput,
  StartupInitResult,
} from "../use-cases/resume-route-guidance";
import { parseTimeDecayedAlnsWorkerResponse } from "./worker/alns-worker-protocol";
import type {
  RouteOptimizationCallbacks,
  RouteOptimizationPreview,
} from "../use-cases/route-optimization-preview";

export interface AlnsWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  terminate?(): void;
}

export interface ControllerDependencies {
  readonly snapshotRepo: LocalStorageRouteGuidanceSnapshotRepository;
  readonly matrixRepo: LocalStorageDistanceMatrixRepository;
  readonly orchestration: RouteGuidanceNavigationOperations;
  readonly workerFactory?: () => AlnsWorkerPort;
}

export interface ResumeResult {
  readonly navState: NavigationState;
  readonly optimizationTimeLimitMs: 5000 | 10000 | 15000;
  readonly matrixRef: string | null;
  readonly fixedFirstTarget: string | null;
  readonly initialSolutions: readonly (readonly string[])[];
}

export interface OptimizationStartResult {
  readonly navState: NavigationState;
  readonly jobId: string;
  readonly generation: number;
}

export interface LaunchOptimizationInput extends OptimizationProblemInput {
  readonly navState: NavigationState;
}

type OptimizationCallbacks =
  | RouteOptimizationCallbacks
  | ((updatedState: NavigationState) => void);

export class RouteGuidanceRuntimeController {
  private readonly snapshotRepo: LocalStorageRouteGuidanceSnapshotRepository;
  private readonly matrixRepo: LocalStorageDistanceMatrixRepository;
  private readonly orchestration: RouteGuidanceNavigationOperations;
  private readonly workerFactory: () => AlnsWorkerPort;
  private worker: AlnsWorkerPort | null = null;
  private currentJobId: string | null = null;
  private currentGeneration = 0;
  private pendingResumeSnapshot: NavigationSnapshot | null = null;
  private matrixRef: string | null = null;

  constructor(deps: ControllerDependencies) {
    this.snapshotRepo = deps.snapshotRepo;
    this.matrixRepo = deps.matrixRepo;
    this.orchestration = deps.orchestration;
    this.workerFactory =
      deps.workerFactory ??
      (() =>
        new Worker(new URL("./worker/alns-worker.ts", import.meta.url), {
          type: "module",
        }));
  }

  getSnapshotRepo(): LocalStorageRouteGuidanceSnapshotRepository {
    return this.snapshotRepo;
  }

  getMatrixRepo(): LocalStorageDistanceMatrixRepository {
    return this.matrixRepo;
  }

  getOrchestration(): RouteGuidanceNavigationOperations {
    return this.orchestration;
  }

  getCurrentJobId(): string | null {
    return this.currentJobId;
  }

  getCurrentGeneration(): number {
    return this.currentGeneration;
  }

  getPendingResumeSnapshot(): NavigationSnapshot | null {
    return this.pendingResumeSnapshot;
  }

  setPendingResumeSnapshot(snapshot: NavigationSnapshot | null): void {
    this.pendingResumeSnapshot = snapshot;
  }

  getMatrixRef(): string | null {
    return this.matrixRef;
  }

  setMatrixRef(matrixRef: string | null): void {
    this.matrixRef = matrixRef;
  }

  invalidateActiveOptimization(): void {
    this.currentJobId = null;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.terminate?.();
      this.worker = null;
    }
  }

  /** Releases the optimizer worker owned by this Route Guidance runtime. */
  dispose(): void {
    this.invalidateActiveOptimization();
  }

  startOptimization(navState: NavigationState): OptimizationStartResult {
    const optimization = this.orchestration.startOptimization(navState);
    this.currentGeneration = optimization.generation;
    this.currentJobId = `alns-job-${Date.now()}-gen${this.currentGeneration}`;
    return {
      navState: optimization.navState,
      jobId: this.currentJobId,
      generation: this.currentGeneration,
    };
  }

  isValidResponse(jobId: string, generation?: number): boolean {
    if (!this.currentJobId || this.currentJobId !== jobId) return false;
    if (generation !== undefined && generation !== this.currentGeneration)
      return false;
    return true;
  }

  launchAlnsOptimization(
    input: LaunchOptimizationInput,
    callbacks: OptimizationCallbacks,
  ): NavigationState {
    // Validate and prepare all input before advancing the orchestration
    // generation. A malformed problem must not invalidate the active job.
    // Create the worker before starting the generation as well, so a factory
    // failure cannot leave the application in a half-started state.
    const problem = buildOptimizationProblem({
      areaId: input.areaId,
      startDistanceToCircles: input.startDistanceToCircles,
      pendingCircles: input.pendingCircles,
      distanceMatrix: input.distanceMatrix,
      fixedFirstTarget: input.fixedFirstTarget,
      searchTimeLimitMs: input.searchTimeLimitMs,
      randomSeed: this.createRandomSeed(input),
      initialSolutions: input.initialSolutions,
      timingProfile: input.timingProfile,
    });

    if (!this.worker) {
      this.worker = this.workerFactory();
    }

    const optimization = this.startOptimization(input.navState);
    const { jobId, generation } = optimization;

    let currentState = optimization.navState;
    const legacyProgress =
      typeof callbacks === "function" &&
      !("onPreview" in callbacks && "onCommit" in callbacks)
        ? callbacks
        : null;
    const handlers: RouteOptimizationCallbacks = legacyProgress
      ? {
          onPreview: (preview) => {
            const previewState = this.orchestration.handleWorkerProgress(
              currentState,
              preview.bestOrder,
              currentState.optimizationGeneration,
            );
            legacyProgress(previewState);
          },
          onCommit: legacyProgress,
        }
      : callbacks as RouteOptimizationCallbacks;

    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      const response = parseTimeDecayedAlnsWorkerResponse(event.data);
      if (!response) return; // Ignore malformed response

      if (!this.isValidResponse(response.jobId, generation)) {
        return; // Ignore stale job or wrong generation
      }

      if (
        (response.type === "progress" || response.type === "complete") &&
        response.best?.route
      ) {
        const nextState = this.orchestration.handleWorkerProgress(
          currentState,
          response.best.route,
          currentState.optimizationGeneration,
        );
        if (response.type === "progress") {
          const preview: RouteOptimizationPreview = {
            jobId: response.jobId,
            generation,
            elapsedMs: response.elapsedMs,
            searchTimeLimitMs: response.searchTimeLimitMs as 5000 | 10000 | 15000,
            bestOrder: nextState.bestOrder,
            score: response.best.score,
          };
          handlers.onPreview(preview);
          return;
        }
        currentState = nextState;
        handlers.onCommit(currentState);
      }
      if (response.type === "cancelled") handlers.onCancel?.();
      if (response.type === "error") handlers.onError?.(response.code);
    };

    try {
      this.worker.postMessage({
        type: "start",
        jobId,
        problem,
      });
    } catch (error) {
      this.currentJobId = null;
      this.worker?.terminate?.();
      this.worker = null;
      throw error;
    }

    return optimization.navState;
  }

  private createRandomSeed(input: LaunchOptimizationInput): number {
    let seed = 0;
    const seedSource = JSON.stringify({
      areaId: input.areaId,
      pendingSpaces: input.pendingCircles.map((circle) => circle.space),
      fixedFirstTarget: input.fixedFirstTarget,
      searchTimeLimitMs: input.searchTimeLimitMs,
      initialSolutions: input.initialSolutions,
    });
    for (let i = 0; i < seedSource.length; i++) {
      seed = (seed * 31 + seedSource.charCodeAt(i)) % 2_147_483_647;
    }
    return seed > 0 ? seed : 12345;
  }

  /**
   * 起動時にスナップショットの有無と有効性を検証し、再開ダイアログ表示の可否を返す。
   * 無効なスナップショットは即座にクリアする。
   */
  initStartup(input: StartupInitInput): StartupInitResult {
    const snapshot = this.snapshotRepo.loadByIds(input.eventId, input.dayId);
    if (!snapshot) {
      this.pendingResumeSnapshot = null;
      return { shouldShowResumeDialog: false, snapshot: null };
    }

    const isValid = validateSnapshotForResume({
      snapshot,
      currentBundleVersion: input.bundleVersion,
      circleStates: input.circleStates,
      pendingCircleSpaces: input.pendingCircleSpaces,
    });

    if (!isValid) {
      this.snapshotRepo.clearByIds(input.eventId, input.dayId);
      this.pendingResumeSnapshot = null;
      return { shouldShowResumeDialog: false, snapshot: null };
    }

    this.pendingResumeSnapshot = snapshot;
    return { shouldShowResumeDialog: true, snapshot };
  }

  /**
   * スナップショットからの復元処理。
   * targetSpace を fixedFirstTarget として固定し、bestOrder を initialSolutions へ渡す。
   */
  resumeFromSnapshot(snapshot: NavigationSnapshot): ResumeResult {
    const navState = snapshot.navState;
    const fixedFirstTarget = navState.targetSpace;
    const initialSolutions =
      navState.bestOrder && navState.bestOrder.length > 0
        ? [Object.freeze([...navState.bestOrder])]
        : [];

    return {
      navState,
      optimizationTimeLimitMs: snapshot.optimizationTimeLimitMs,
      matrixRef: snapshot.matrixRef,
      fixedFirstTarget,
      initialSolutions,
    };
  }

  /**
   * ナビゲーション状態保存トリガー。
   */
  saveSnapshot(
    eventId: string,
    dayId: string,
    snapshot: NavigationSnapshot,
  ): void {
    this.snapshotRepo.saveByIds(eventId, dayId, snapshot);
  }

  /**
   * スナップショットクリアトリガー。
   */
  clearSnapshot(eventId: string, dayId: string): void {
    this.snapshotRepo.clearByIds(eventId, dayId);
  }

  deleteMatrix(eventId: string, dayId: string): void {
    this.matrixRepo.deleteByEventDay(eventId, dayId);
  }
}
