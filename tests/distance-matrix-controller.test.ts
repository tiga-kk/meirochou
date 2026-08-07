// @vitest-environment node
import { describe, expect, test } from "vitest";
import type {
  DistanceMatrixJobInput,
  DistanceMatrixRepository,
  StoredDistanceMatrix,
} from "../apps/webapp/js/features/route-guidance/domain/routing/distance-matrix";
import type { DistanceMatrixWorkerResponse } from "../apps/webapp/js/features/route-guidance/infrastructure/worker/distance-matrix-worker-protocol";
import {
  DistanceMatrixController,
  type DistanceMatrixWorkerPort,
} from "../apps/webapp/js/routing/distance-matrix-controller";

class FakeWorker implements DistanceMatrixWorkerPort {
  onmessage:
    | ((event: MessageEvent<DistanceMatrixWorkerResponse>) => void)
    | null = null;
  readonly posted: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: DistanceMatrixWorkerResponse): void {
    this.onmessage?.({
      data: message,
    } as MessageEvent<DistanceMatrixWorkerResponse>);
  }
}

function makeInput(cacheKey = "key-1"): DistanceMatrixJobInput {
  return {
    eventId: "demo-v1",
    dayId: "day1",
    areaId: "east",
    cacheKey,
    gridInput: { grid: new Uint8Array([1, 1]), cols: 2, rows: 1, cellSize: 10 },
    endpoints: [
      { space: "A-01", gridIndex: 0 },
      { space: "A-02", gridIndex: 1 },
    ],
  };
}

function makeMatrix(cacheKey: string): StoredDistanceMatrix {
  return {
    schemaVersion: 1,
    cacheKey,
    areaId: "east",
    spaces: ["A-01", "A-02"],
    size: 2,
    distances: [0, 10, 10, 0],
    createdAt: "2026-07-26T00:00:00Z",
  };
}

function makeRepository(
  cached: StoredDistanceMatrix | null = null,
  saveResult = true,
): DistanceMatrixRepository {
  return {
    load: () => cached,
    save: () => saveResult,
    deleteByEventDay: () => undefined,
  };
}

describe("Phase 5C Task 5: DistanceMatrixController", () => {
  test("cache hit returns without creating or starting a worker", async () => {
    let workerCreated = false;
    const controller = new DistanceMatrixController({
      repository: makeRepository(makeMatrix("key-1")),
      workerFactory: () => {
        workerCreated = true;
        return new FakeWorker();
      },
    });

    await expect(controller.start(makeInput())).resolves.toEqual(
      makeMatrix("key-1"),
    );
    expect(workerCreated).toBe(false);
  });

  test("cache miss starts a worker and forwards progress to the model", async () => {
    const worker = new FakeWorker();
    const updates: string[] = [];
    const controller = new DistanceMatrixController({
      repository: makeRepository(),
      workerFactory: () => worker,
      onUpdate: (model) => updates.push(model.stage),
    });

    const pending = controller.start(makeInput());
    expect(worker.posted).toHaveLength(1);
    worker.emit({
      type: "progress",
      jobId: "job-1",
      completed: 1,
      total: 2,
      etaMs: 12,
    });
    worker.emit({
      type: "complete",
      jobId: "job-1",
      matrix: makeMatrix("key-1"),
    });

    await expect(pending).resolves.toEqual(makeMatrix("key-1"));
    expect(updates).toEqual(["running", "running", "complete"]);
  });

  test("stale worker responses do not resolve the current job", async () => {
    const workers: FakeWorker[] = [];
    const controller = new DistanceMatrixController({
      repository: makeRepository(),
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    const first = controller.start(makeInput("key-1"));
    const second = controller.start(makeInput("key-2"));
    workers[1].emit({
      type: "complete",
      jobId: "stale-job",
      matrix: makeMatrix("key-1"),
    });
    workers[1].emit({
      type: "complete",
      jobId: "job-2",
      matrix: makeMatrix("key-2"),
    });

    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toEqual(makeMatrix("key-2"));
    expect(workers[0].terminated).toBe(true);
  });

  test("malformed worker responses are ignored at the message boundary", async () => {
    const worker = new FakeWorker();
    const controller = new DistanceMatrixController({
      repository: makeRepository(),
      workerFactory: () => worker,
    });

    const pending = controller.start(makeInput());
    worker.emit({
      type: "progress",
      jobId: "job-1",
      completed: "invalid" as unknown as number,
      total: 2,
      etaMs: 0,
    });
    expect(controller.getModel().completed).toBe(0);

    worker.emit({
      type: "complete",
      jobId: "job-1",
      matrix: makeMatrix("key-1"),
    });
    await expect(pending).resolves.toEqual(makeMatrix("key-1"));
  });

  test("cancel keeps the current route safe and resolves without a matrix", async () => {
    const worker = new FakeWorker();
    const controller = new DistanceMatrixController({
      repository: makeRepository(),
      workerFactory: () => worker,
    });

    const pending = controller.start(makeInput());
    controller.cancel();

    expect(worker.posted).toHaveLength(2);
    expect(worker.posted[1]).toMatchObject({ type: "cancel", jobId: "job-1" });
    worker.emit({ type: "cancelled", jobId: "job-1" });

    await expect(pending).resolves.toBeNull();
  });

  test("save failure returns the memory matrix with a safe warning", async () => {
    const worker = new FakeWorker();
    const updates: Array<{
      message: string | null;
      matrix: StoredDistanceMatrix | null;
    }> = [];
    const controller = new DistanceMatrixController({
      repository: makeRepository(null, false),
      workerFactory: () => worker,
      onUpdate: (model) =>
        updates.push({ message: model.message, matrix: model.matrix }),
    });

    const pending = controller.start(makeInput());
    worker.emit({
      type: "complete",
      jobId: "job-1",
      matrix: makeMatrix("key-1"),
    });

    await expect(pending).resolves.toEqual(makeMatrix("key-1"));
    expect(updates.at(-1)?.matrix).toEqual(makeMatrix("key-1"));
    expect(updates.at(-1)?.message).toContain("保存できませんでした");
  });
});
