export interface RouteOptimizationProgress {
  readonly generation: number;
  readonly bestCost: number;
}

export interface RouteOptimizationResult {
  readonly bestOrder: readonly string[];
  readonly cost: number;
}

export interface RouteOptimizationRun {
  cancel(): void;
  onProgress(listener: (progress: RouteOptimizationProgress) => void): void;
  readonly result: Promise<RouteOptimizationResult>;
}

export interface RouteOptimizer {
  startOptimization(
    problem: RouteOptimizationProblem,
    options: RouteOptimizationOptions,
  ): RouteOptimizationRun;
}

export interface AlnsWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  terminate?(): void;
}

export interface RouteOptimizationProblem {
  readonly nodeIds: readonly string[];
  readonly travelTimesSec: readonly number[];
  readonly serviceTimesSec: readonly number[];
  readonly values: readonly number[];
  readonly size: number;
  readonly fixedFirstTarget: string | null;
}

export interface RouteOptimizationOptions {
  readonly timeLimitMilliseconds?: number;
  readonly seed?: number;
}
