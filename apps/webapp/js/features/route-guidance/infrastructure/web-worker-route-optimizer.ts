import type { CircleRecord } from "../../event-day/public-api";
import type { RouteGuidanceSession } from "../domain/route-guidance-types";
import { ApplyOptimizedRouteOrderUseCase } from "../use-cases/apply-optimized-route-order";
import { buildOptimizationProblem } from "../use-cases/build-route-optimization-problem";
import type { AlnsWorkerPort } from "../use-cases/route-optimizer";
import { parseTimeDecayedAlnsWorkerResponse } from "./worker/alns-worker-protocol";

export interface WebWorkerRouteOptimizationInput {
  readonly areaId: string;
  readonly startDistanceToCircles: readonly number[];
  readonly pendingCircles: readonly CircleRecord[];
  readonly distanceMatrix: readonly number[];
  readonly fixedFirstTarget: string | null;
  readonly searchTimeLimitMs: 5000 | 10000 | 15000;
  readonly initialSolutions?: readonly (readonly string[])[];
}

export interface WebWorkerRouteOptimizerDependencies {
  readonly session: RouteGuidanceSession;
  readonly workerFactory: () => AlnsWorkerPort;
}

export class WebWorkerRouteOptimizer {
  private worker: AlnsWorkerPort | null = null;
  private jobId: string | null = null;
  private generation = 0;

  constructor(private readonly deps: WebWorkerRouteOptimizerDependencies) {}

  start(input: WebWorkerRouteOptimizationInput): {
    jobId: string;
    generation: number;
  } {
    const snapshot = this.deps.session.getSnapshot();
    const navState = snapshot.navigationState;
    if (!navState)
      throw new Error("Route optimization requires navigation state");

    const problem = buildOptimizationProblem({
      areaId: input.areaId,
      startDistanceToCircles: input.startDistanceToCircles,
      pendingCircles: input.pendingCircles,
      distanceMatrix: input.distanceMatrix,
      fixedFirstTarget: input.fixedFirstTarget,
      searchTimeLimitMs: input.searchTimeLimitMs,
      randomSeed: 12345,
      initialSolutions: input.initialSolutions,
    });
    this.worker?.terminate?.();
    this.worker = this.deps.workerFactory();
    this.generation = Math.max(
      this.generation + 1,
      (navState.optimizationGeneration ?? 0) + 1,
    );
    this.jobId = `alns-job-${Date.now()}-gen${this.generation}`;
    const jobId = this.jobId;
    const generation = this.generation;
    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      const response = parseTimeDecayedAlnsWorkerResponse(event.data);
      if (
        !response ||
        response.jobId !== jobId ||
        generation !== this.generation
      )
        return;
      if (
        (response.type === "progress" || response.type === "complete") &&
        response.best
      ) {
        void new ApplyOptimizedRouteOrderUseCase(this.deps.session).execute(
          response.best.route,
          generation,
        );
      }
    };
    try {
      this.worker.postMessage({ type: "start", jobId, problem });
    } catch (error) {
      this.worker.terminate?.();
      this.worker = null;
      this.jobId = null;
      throw error;
    }
    return { jobId, generation };
  }

  cancel(): void {
    if (this.worker && this.jobId) {
      this.worker.postMessage({ type: "cancel", jobId: this.jobId });
    }
    this.generation += 1;
  }
}
