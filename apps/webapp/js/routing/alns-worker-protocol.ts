import { validateSearchTimeLimit } from "./alns-solver";
import type { TimeDecayedAlnsWorkerMessage } from "./alns-worker-kernel";
import type {
  TimeDecayedAlnsBestSolution,
  TimeDecayedAlnsProblem,
} from "./time-decayed-objective";

export type TimeDecayedAlnsWorkerRequest =
  | {
      readonly type: "start";
      readonly jobId: string;
      readonly problem: TimeDecayedAlnsProblem;
    }
  | {
      readonly type: "cancel";
      readonly jobId: string;
    };

export type TimeDecayedAlnsWorkerResponse = TimeDecayedAlnsWorkerMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDistanceArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "number" && !Number.isNaN(item))
  );
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function isProblem(value: unknown): value is TimeDecayedAlnsProblem {
  if (!isRecord(value)) return false;
  const size = value.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
    return false;
  }
  if (
    !Array.isArray(value.nodeIds) ||
    !value.nodeIds.every((nodeId) => typeof nodeId === "string") ||
    !isDistanceArray(value.travelTimesSec) ||
    !isFiniteNumberArray(value.serviceTimesSec) ||
    !isFiniteNumberArray(value.values) ||
    value.travelTimesSec.length < size ** 2 ||
    value.nodeIds.length + 1 !== size ||
    value.serviceTimesSec.length < size ||
    value.values.length < size ||
    (value.fixedFirstTarget !== null &&
      typeof value.fixedFirstTarget !== "string") ||
    !Number.isFinite(value.randomSeed) ||
    !Array.isArray(value.initialSolutions) ||
    !value.initialSolutions.every(
      (solution) =>
        Array.isArray(solution) &&
        solution.every((nodeId) => typeof nodeId === "string"),
    ) ||
    !Array.isArray(value.halfLivesSec) ||
    value.halfLivesSec.length !== 3 ||
    value.halfLivesSec[0] !== 1800 ||
    value.halfLivesSec[1] !== 3600 ||
    value.halfLivesSec[2] !== 7200 ||
    !Array.isArray(value.halfLifeWeights) ||
    value.halfLifeWeights.length !== 3 ||
    !value.halfLifeWeights.every(
      (weight) => typeof weight === "number" && Number.isFinite(weight),
    ) ||
    typeof value.optimizationProfileVersion !== "string"
  ) {
    return false;
  }
  try {
    validateSearchTimeLimit(value.searchTimeLimitMs as number);
  } catch {
    return false;
  }
  return true;
}

export function parseTimeDecayedAlnsWorkerRequest(
  input: unknown,
): TimeDecayedAlnsWorkerRequest | null {
  if (!isRecord(input) || typeof input.jobId !== "string") return null;
  if (input.type === "cancel") return { type: "cancel", jobId: input.jobId };
  if (input.type === "start" && isProblem(input.problem)) {
    return {
      type: "start",
      jobId: input.jobId,
      problem: input.problem,
    };
  }
  return null;
}

function isBestSolution(value: unknown): value is TimeDecayedAlnsBestSolution {
  return (
    isRecord(value) &&
    Array.isArray(value.route) &&
    value.route.every((nodeId) => typeof nodeId === "string") &&
    typeof value.score === "number" &&
    Number.isFinite(value.score) &&
    isFiniteNumberArray(value.completionTimesSec) &&
    typeof value.elapsedMs === "number" &&
    Number.isFinite(value.elapsedMs) &&
    typeof value.optimizationProfileVersion === "string"
  );
}

export function parseTimeDecayedAlnsWorkerResponse(
  input: unknown,
): TimeDecayedAlnsWorkerResponse | null {
  if (
    !isRecord(input) ||
    typeof input.jobId !== "string" ||
    input.stage !== "time-decayed-alns"
  ) {
    return null;
  }
  if (input.type === "error" && typeof input.code === "string") {
    return {
      type: "error",
      stage: "time-decayed-alns",
      jobId: input.jobId,
      code: input.code,
    };
  }
  if (
    (input.type === "complete" || input.type === "cancelled") &&
    isBestSolution(input.best)
  ) {
    return {
      type: input.type,
      stage: "time-decayed-alns",
      jobId: input.jobId,
      best: input.best,
    };
  }
  if (
    input.type === "progress" &&
    typeof input.elapsedMs === "number" &&
    Number.isFinite(input.elapsedMs) &&
    typeof input.searchTimeLimitMs === "number" &&
    Number.isFinite(input.searchTimeLimitMs) &&
    isBestSolution(input.best)
  ) {
    return {
      type: "progress",
      stage: "time-decayed-alns",
      jobId: input.jobId,
      elapsedMs: input.elapsedMs,
      searchTimeLimitMs: input.searchTimeLimitMs,
      best: input.best,
    };
  }
  return null;
}
