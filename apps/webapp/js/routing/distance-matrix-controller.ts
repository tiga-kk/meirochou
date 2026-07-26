import type {
  DistanceMatrixJobInput,
  DistanceMatrixRepository,
  StoredDistanceMatrix,
} from "./distance-matrix";
import type {
  DistanceMatrixWorkerRequest,
  DistanceMatrixWorkerResponse,
} from "./distance-matrix-worker-protocol";
import { parseDistanceMatrixWorkerResponse } from "./distance-matrix-worker-protocol";

function createDistanceMatrixWorker(): Worker {
  return new Worker(new URL("./distance-matrix-worker.ts", import.meta.url), {
    type: "module",
  });
}

export interface DistanceMatrixWorkerPort {
  onmessage:
    | ((event: MessageEvent<DistanceMatrixWorkerResponse>) => void)
    | null;
  postMessage(message: DistanceMatrixWorkerRequest): void;
  terminate(): void;
}

export type DistanceMatrixStatus =
  | "idle"
  | "running"
  | "complete"
  | "cancelled"
  | "error";

export interface DistanceMatrixProgressModel {
  readonly stage: DistanceMatrixStatus;
  readonly completed: number;
  readonly total: number;
  readonly etaMs: number | null;
  readonly matrix: StoredDistanceMatrix | null;
  readonly cacheHit: boolean;
  readonly message: string | null;
}

interface CurrentJob {
  readonly jobId: string;
  readonly worker: DistanceMatrixWorkerPort;
  readonly resolve: (matrix: StoredDistanceMatrix | null) => void;
}

export interface DistanceMatrixControllerOptions {
  readonly repository: DistanceMatrixRepository;
  readonly workerFactory?: () => DistanceMatrixWorkerPort;
  readonly onUpdate?: (model: DistanceMatrixProgressModel) => void;
}

const EMPTY_MODEL: DistanceMatrixProgressModel = Object.freeze({
  stage: "idle",
  completed: 0,
  total: 0,
  etaMs: null,
  matrix: null,
  cacheHit: false,
  message: null,
});

const STORAGE_WARNING =
  "距離行列を保存できませんでした。今回の案内は継続しますが、次回は再計算されます。";

/** Worker、cache hit/miss、stale responseをUI向け状態へ変換するcontroller。 */
export class DistanceMatrixController {
  private readonly repository: DistanceMatrixRepository;
  private readonly workerFactory: () => DistanceMatrixWorkerPort;
  private readonly onUpdate: (model: DistanceMatrixProgressModel) => void;
  private currentJob: CurrentJob | null = null;
  private nextJobNumber = 1;
  private model: DistanceMatrixProgressModel = EMPTY_MODEL;

  constructor(options: DistanceMatrixControllerOptions) {
    this.repository = options.repository;
    this.workerFactory =
      options.workerFactory ?? (() => createDistanceMatrixWorker());
    this.onUpdate = options.onUpdate ?? (() => undefined);
  }

  getModel(): DistanceMatrixProgressModel {
    return this.model;
  }

  start(input: DistanceMatrixJobInput): Promise<StoredDistanceMatrix | null> {
    this.cancel();

    const cached = this.repository.load(input.cacheKey);
    if (cached) {
      this.publish({
        stage: "complete",
        completed: cached.size,
        total: cached.size,
        etaMs: null,
        matrix: cached,
        cacheHit: true,
        message: null,
      });
      return Promise.resolve(cached);
    }

    const worker = this.workerFactory();
    const jobId = `job-${this.nextJobNumber++}`;
    const promise = new Promise<StoredDistanceMatrix | null>((resolve) => {
      this.currentJob = { jobId, worker, resolve };
    });
    worker.onmessage = (event) => this.handleMessage(jobId, input, event.data);
    this.publish({
      stage: "running",
      completed: 0,
      total: input.endpoints.length,
      etaMs: null,
      matrix: null,
      cacheHit: false,
      message: null,
    });
    worker.postMessage({ type: "start", jobId, input });
    return promise;
  }

  cancel(): void {
    const current = this.currentJob;
    if (!current) return;
    current.worker.postMessage({ type: "cancel", jobId: current.jobId });
    current.worker.terminate();
    current.resolve(null);
    this.currentJob = null;
    this.publish({
      stage: "cancelled",
      completed: this.model.completed,
      total: this.model.total,
      etaMs: null,
      matrix: null,
      cacheHit: false,
      message: null,
    });
  }

  private handleMessage(
    jobId: string,
    input: DistanceMatrixJobInput,
    rawMessage: unknown,
  ): void {
    const message = parseDistanceMatrixWorkerResponse(rawMessage);
    if (!message) return;
    const current = this.currentJob;
    if (!current || current.jobId !== jobId || message.jobId !== jobId) return;

    if (message.type === "progress") {
      this.publish({
        stage: "running",
        completed: message.completed,
        total: message.total,
        etaMs: message.etaMs,
        matrix: null,
        cacheHit: false,
        message: null,
      });
      return;
    }

    this.currentJob = null;
    current.worker.terminate();
    if (message.type === "complete") {
      const saved = this.saveMatrix(input, message.matrix);
      this.publish({
        stage: "complete",
        completed: message.matrix.size,
        total: message.matrix.size,
        etaMs: null,
        matrix: message.matrix,
        cacheHit: false,
        message: saved ? null : STORAGE_WARNING,
      });
      current.resolve(message.matrix);
      return;
    }

    if (message.type === "cancelled") {
      this.publish({
        stage: "cancelled",
        completed: this.model.completed,
        total: this.model.total,
        etaMs: null,
        matrix: null,
        cacheHit: false,
        message: null,
      });
      current.resolve(null);
      return;
    }

    this.publish({
      stage: "error",
      completed: this.model.completed,
      total: this.model.total,
      etaMs: null,
      matrix: null,
      cacheHit: false,
      message: "距離行列の計算に失敗しました。現在の案内は変更されません。",
    });
    current.resolve(null);
  }

  private saveMatrix(
    input: DistanceMatrixJobInput,
    matrix: StoredDistanceMatrix,
  ): boolean {
    if (this.repository.saveWithRef) {
      return this.repository.saveWithRef(input.eventId, input.dayId, matrix);
    }
    return this.repository.save(matrix);
  }

  private publish(model: DistanceMatrixProgressModel): void {
    this.model = Object.freeze(model);
    this.onUpdate(this.model);
  }
}
