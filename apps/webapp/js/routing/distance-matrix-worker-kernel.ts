import {
  type DistanceMatrixJobInput,
  dijkstraFromCell,
  type StoredDistanceMatrix,
} from "./distance-matrix";

export type DistanceMatrixWorkerMessage =
  | {
      readonly type: "progress";
      readonly jobId: string;
      readonly completed: number;
      readonly total: number;
      readonly etaMs: number | null;
    }
  | {
      readonly type: "complete";
      readonly jobId: string;
      readonly matrix: StoredDistanceMatrix;
    }
  | {
      readonly type: "cancelled";
      readonly jobId: string;
    }
  | {
      readonly type: "error";
      readonly jobId: string;
      readonly code: string;
    };

/**
 * 距離行列Workerの純粋な計算カーネル。
 * main thread / Worker両方で使えるようにWebWorker APIに依存しない設計。
 * 実際のWorker実装はこのカーネルをラップする。
 */
export class DistanceMatrixWorkerKernel {
  private cancelledJobs = new Set<string>();

  constructor(
    private readonly postMessage: (msg: DistanceMatrixWorkerMessage) => void,
  ) {}

  /** 指定jobIdをキャンセル済みとしてマークする。まだ開始していない場合も有効。 */
  cancel(jobId: string): void {
    this.cancelledJobs.add(jobId);
  }

  /**
   * 距離行列計算を実行し、progress / complete / cancelled メッセージを postMessage 経由で送信する。
   * キャンセル済みのjobIdはcancelledを送って即座に戻る。
   */
  start(jobId: string, input: DistanceMatrixJobInput): void {
    if (this.cancelledJobs.has(jobId)) {
      this.postMessage({ type: "cancelled", jobId });
      this.cancelledJobs.delete(jobId);
      return;
    }

    const { gridInput, endpoints, cacheKey, areaId } = input;
    const n = endpoints.length;
    if (n === 0) {
      this.postMessage({ type: "error", jobId, code: "empty-endpoints" });
      this.cancelledJobs.delete(jobId);
      return;
    }
    const startTimes: number[] = [];
    const flatDistances: number[] = new Array(n * n).fill(Infinity);

    for (let i = 0; i < n; i++) {
      if (this.cancelledJobs.has(jobId)) {
        this.postMessage({ type: "cancelled", jobId });
        this.cancelledJobs.delete(jobId);
        return;
      }

      const rowStart = globalThis.performance?.now() ?? Date.now();
      const distFromI = dijkstraFromCell(endpoints[i].gridIndex, gridInput);
      const rowEnd = globalThis.performance?.now() ?? Date.now();
      startTimes.push(rowEnd - rowStart);

      for (let j = 0; j < n; j++) {
        flatDistances[i * n + j] =
          i === j ? 0 : distFromI[endpoints[j].gridIndex];
      }

      // ETA: estimate only after enough samples (≥2)
      let etaMs: number | null = null;
      if (startTimes.length >= 2) {
        const avgMs = startTimes.reduce((s, t) => s + t, 0) / startTimes.length;
        const remaining = n - (i + 1);
        etaMs = avgMs * remaining;
      }

      this.postMessage({
        type: "progress",
        jobId,
        completed: i + 1,
        total: n,
        etaMs,
      });
    }

    if (this.cancelledJobs.has(jobId)) {
      this.postMessage({ type: "cancelled", jobId });
      this.cancelledJobs.delete(jobId);
      return;
    }

    const matrix: StoredDistanceMatrix = Object.freeze({
      schemaVersion: 1 as const,
      cacheKey,
      areaId,
      spaces: Object.freeze(endpoints.map((e) => e.space)),
      size: n,
      distances: Object.freeze(flatDistances),
      createdAt: new Date().toISOString(),
    });

    this.postMessage({ type: "complete", jobId, matrix });
    this.cancelledJobs.delete(jobId);
  }
}
