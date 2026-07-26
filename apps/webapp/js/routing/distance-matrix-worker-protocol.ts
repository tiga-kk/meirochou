import {
  type DistanceMatrixJobInput,
  type MatrixEndpoint,
  parseStoredDistanceMatrix,
} from "./distance-matrix";
import type { DistanceMatrixWorkerMessage } from "./distance-matrix-worker-kernel";

export type DistanceMatrixWorkerRequest =
  | {
      readonly type: "start";
      readonly jobId: string;
      readonly input: DistanceMatrixJobInput;
    }
  | {
      readonly type: "cancel";
      readonly jobId: string;
    };

export type DistanceMatrixWorkerResponse = DistanceMatrixWorkerMessage;

function isJobInput(input: unknown): input is DistanceMatrixJobInput {
  if (typeof input !== "object" || input === null) return false;
  const value = input as Record<string, unknown>;
  const gridInput = value.gridInput;
  const endpoints = value.endpoints;
  if (typeof gridInput !== "object" || gridInput === null) return false;
  const grid = gridInput as Record<string, unknown>;
  return (
    typeof value.eventId === "string" &&
    typeof value.dayId === "string" &&
    typeof value.areaId === "string" &&
    typeof value.cacheKey === "string" &&
    grid.grid instanceof Uint8Array &&
    Number.isInteger(grid.cols) &&
    Number.isInteger(grid.rows) &&
    Number.isFinite(grid.cellSize) &&
    Array.isArray(endpoints) &&
    endpoints.every((endpoint): endpoint is MatrixEndpoint => {
      if (typeof endpoint !== "object" || endpoint === null) return false;
      const item = endpoint as Record<string, unknown>;
      return typeof item.space === "string" && Number.isInteger(item.gridIndex);
    })
  );
}

export function parseDistanceMatrixWorkerRequest(
  input: unknown,
): DistanceMatrixWorkerRequest | null {
  if (typeof input !== "object" || input === null) return null;
  const value = input as Record<string, unknown>;
  if (value.type === "cancel" && typeof value.jobId === "string") {
    return { type: "cancel", jobId: value.jobId };
  }
  if (
    value.type === "start" &&
    typeof value.jobId === "string" &&
    isJobInput(value.input)
  ) {
    return { type: "start", jobId: value.jobId, input: value.input };
  }
  return null;
}

export function parseDistanceMatrixWorkerResponse(
  input: unknown,
): DistanceMatrixWorkerResponse | null {
  if (typeof input !== "object" || input === null) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.jobId !== "string" || typeof value.type !== "string") {
    return null;
  }
  if (value.type === "cancelled") {
    return { type: "cancelled", jobId: value.jobId };
  }
  if (value.type === "error" && typeof value.code === "string") {
    return { type: "error", jobId: value.jobId, code: value.code };
  }
  if (value.type === "complete") {
    const matrix = parseStoredDistanceMatrix(value.matrix);
    return matrix ? { type: "complete", jobId: value.jobId, matrix } : null;
  }
  const completed =
    typeof value.completed === "number" ? value.completed : null;
  const total = typeof value.total === "number" ? value.total : null;
  const etaMs = value.etaMs;
  if (
    value.type === "progress" &&
    completed !== null &&
    total !== null &&
    Number.isInteger(completed) &&
    Number.isInteger(total) &&
    completed >= 0 &&
    total > 0 &&
    completed <= total &&
    (etaMs === null ||
      (typeof etaMs === "number" && Number.isFinite(etaMs) && etaMs >= 0))
  ) {
    return {
      type: "progress",
      jobId: value.jobId,
      completed,
      total,
      etaMs,
    };
  }
  return null;
}
