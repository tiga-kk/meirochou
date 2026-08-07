import { TimeDecayedAlnsSolver } from "./alns-solver";
import type {
  TimeDecayedAlnsBestSolution,
  TimeDecayedAlnsProblem,
} from "./time-decayed-objective";

export type TimeDecayedAlnsWorkerMessage =
  | {
      readonly type: "progress";
      readonly stage: "time-decayed-alns";
      readonly jobId: string;
      readonly elapsedMs: number;
      readonly searchTimeLimitMs: number;
      readonly best: TimeDecayedAlnsBestSolution;
    }
  | {
      readonly type: "complete";
      readonly stage: "time-decayed-alns";
      readonly jobId: string;
      readonly best: TimeDecayedAlnsBestSolution;
    }
  | {
      readonly type: "cancelled";
      readonly stage: "time-decayed-alns";
      readonly jobId: string;
      readonly best: TimeDecayedAlnsBestSolution;
    }
  | {
      readonly type: "error";
      readonly stage: "time-decayed-alns";
      readonly jobId: string;
      readonly code: string;
    };

interface WorkerKernelOptions {
  readonly now?: () => number;
  readonly yieldControl?: () => Promise<void>;
  readonly batchIterations?: number;
}

/** Pure Worker-side adapter with bounded batches so cancellation can be read. */
export class TimeDecayedAlnsWorkerKernel {
  private readonly cancelledJobs = new Set<string>();
  private readonly now: () => number;
  private readonly yieldControl: () => Promise<void>;
  private readonly batchIterations: number;

  constructor(
    private readonly postMessage: (msg: TimeDecayedAlnsWorkerMessage) => void,
    options: WorkerKernelOptions = {},
  ) {
    this.now =
      options.now ?? (() => globalThis.performance?.now?.() ?? Date.now());
    this.yieldControl =
      options.yieldControl ??
      (() => new Promise((resolve) => setTimeout(resolve, 0)));
    this.batchIterations = Math.max(1, options.batchIterations ?? 32);
  }

  cancel(jobId: string): void {
    this.cancelledJobs.add(jobId);
  }

  /**
   * Run until the approved search-time limit. `maxIterations` is a test hook
   * that keeps unit tests fast; production Worker calls omit it.
   */
  async start(
    jobId: string,
    problem: TimeDecayedAlnsProblem,
    maxIterations?: number,
  ): Promise<void> {
    try {
      const solver = new TimeDecayedAlnsSolver(problem);
      let best = solver.initialize();
      const startedAt = this.now();

      if (this.cancelledJobs.has(jobId)) {
        this.postCancelled(jobId, best);
        return;
      }

      this.postProgress(jobId, problem, best, startedAt);
      let iterations = 0;
      while (
        maxIterations === undefined
          ? this.now() - startedAt < problem.searchTimeLimitMs
          : iterations < maxIterations
      ) {
        if (this.cancelledJobs.has(jobId)) {
          this.postCancelled(jobId, best);
          return;
        }

        const batch =
          maxIterations === undefined
            ? this.batchIterations
            : Math.min(this.batchIterations, maxIterations - iterations);
        best = solver.step(batch);
        iterations += batch;
        this.postProgress(jobId, problem, best, startedAt);
        await this.yieldControl();
      }

      if (this.cancelledJobs.has(jobId)) {
        this.postCancelled(jobId, best);
        return;
      }
      this.postMessage({
        type: "complete",
        stage: "time-decayed-alns",
        jobId,
        best,
      });
    } catch (error) {
      this.postMessage({
        type: "error",
        stage: "time-decayed-alns",
        jobId,
        code: this.errorCode(error),
      });
    } finally {
      this.cancelledJobs.delete(jobId);
    }
  }

  private postProgress(
    jobId: string,
    problem: TimeDecayedAlnsProblem,
    best: TimeDecayedAlnsBestSolution,
    startedAt: number,
  ): void {
    this.postMessage({
      type: "progress",
      stage: "time-decayed-alns",
      jobId,
      elapsedMs: Math.max(0, this.now() - startedAt),
      searchTimeLimitMs: problem.searchTimeLimitMs,
      best,
    });
  }

  private postCancelled(
    jobId: string,
    best: TimeDecayedAlnsBestSolution,
  ): void {
    this.postMessage({
      type: "cancelled",
      stage: "time-decayed-alns",
      jobId,
      best,
    });
  }

  private errorCode(error: unknown): string {
    if (
      error instanceof Error &&
      error.message.startsWith("Invalid searchTimeLimitMs")
    ) {
      return "invalid-search-time-limit";
    }
    if (error instanceof Error && error.message.includes("travelTimesSec")) {
      return "invalid-problem-shape";
    }
    return "solver-failed";
  }
}
