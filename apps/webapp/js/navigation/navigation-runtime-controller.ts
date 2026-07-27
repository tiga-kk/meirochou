import { parseTimeDecayedAlnsWorkerResponse } from "../routing/alns-worker-protocol";
import type { LocalStorageDistanceMatrixRepository } from "../routing/distance-matrix-repository";
import {
  type LocalStorageNavigationSnapshotRepository,
  type NavigationSnapshot,
  validateSnapshotForResume,
} from "../state/navigation-snapshot-repository";
import type { CircleVisitState, NavigationState } from "../types/domain";
import type { NavigationOrchestrationService } from "./navigation-orchestration";
import {
  buildOptimizationProblem,
  type OptimizationProblemInput,
} from "./optimization-input-adapter";

export interface AlnsWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  terminate?(): void;
}

export interface ControllerDependencies {
  readonly snapshotRepo: LocalStorageNavigationSnapshotRepository;
  readonly matrixRepo: LocalStorageDistanceMatrixRepository;
  readonly orchestration: NavigationOrchestrationService;
  readonly workerFactory?: () => AlnsWorkerPort;
}

export interface StartupInitInput {
  readonly eventId: string;
  readonly dayId: string;
  readonly bundleVersion: string;
  readonly circleStates: Record<string, CircleVisitState>;
  readonly pendingCircleSpaces: readonly string[];
}

export interface StartupInitResult {
  readonly shouldShowResumeDialog: boolean;
  readonly snapshot: NavigationSnapshot | null;
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

export class NavigationRuntimeController {
  private readonly snapshotRepo: LocalStorageNavigationSnapshotRepository;
  private readonly matrixRepo: LocalStorageDistanceMatrixRepository;
  private readonly orchestration: NavigationOrchestrationService;
  private readonly workerFactory: () => AlnsWorkerPort;
  private worker: AlnsWorkerPort | null = null;
  private currentJobId: string | null = null;
  private currentGeneration = 0;

  constructor(deps: ControllerDependencies) {
    this.snapshotRepo = deps.snapshotRepo;
    this.matrixRepo = deps.matrixRepo;
    this.orchestration = deps.orchestration;
    this.workerFactory =
      deps.workerFactory ??
      (() =>
        new Worker(new URL("../routing/alns-worker.ts", import.meta.url), {
          type: "module",
        }));
  }

  getSnapshotRepo(): LocalStorageNavigationSnapshotRepository {
    return this.snapshotRepo;
  }

  getMatrixRepo(): LocalStorageDistanceMatrixRepository {
    return this.matrixRepo;
  }

  getOrchestration(): NavigationOrchestrationService {
    return this.orchestration;
  }

  getCurrentJobId(): string | null {
    return this.currentJobId;
  }

  getCurrentGeneration(): number {
    return this.currentGeneration;
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
    onProgress: (updatedState: NavigationState) => void,
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
        currentState = this.orchestration.handleWorkerProgress(
          currentState,
          response.best.route,
          currentState.optimizationGeneration,
        );
        onProgress(currentState);
      }
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
    const snapshot = this.snapshotRepo.load(input.eventId, input.dayId);
    if (!snapshot) {
      return { shouldShowResumeDialog: false, snapshot: null };
    }

    const isValid = validateSnapshotForResume({
      snapshot,
      currentBundleVersion: input.bundleVersion,
      circleStates: input.circleStates,
      pendingCircleSpaces: input.pendingCircleSpaces,
    });

    if (!isValid) {
      this.snapshotRepo.clear(input.eventId, input.dayId);
      return { shouldShowResumeDialog: false, snapshot: null };
    }

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
    this.snapshotRepo.save(eventId, dayId, snapshot);
  }

  /**
   * スナップショットクリアトリガー。
   */
  clearSnapshot(eventId: string, dayId: string): void {
    this.snapshotRepo.clear(eventId, dayId);
  }
}
