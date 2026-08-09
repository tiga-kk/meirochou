export const ALNS_SEARCH_TIME_LIMITS = [5_000, 10_000, 15_000] as const;
export type AlnsSearchTimeLimitMs = (typeof ALNS_SEARCH_TIME_LIMITS)[number];
export const DEFAULT_SEARCH_TIME_LIMIT_MS: AlnsSearchTimeLimitMs = 10_000;

export interface OptimizationTimingProfile {
  readonly profileVersion: string;
  readonly secondsPerWeightedDistance: Readonly<Record<string, number>>;
  readonly halfLivesSec: readonly [1800, 3600, 7200];
  readonly halfLifeWeights: readonly [number, number, number];
  readonly defaultServiceTimeSec: 30;
  readonly wallServiceTimeSec: 200;
}

export const SECONDS_PER_WEIGHTED_DISTANCE: Readonly<Record<string, number>> = {
  "demo-east": 0.13184,
  e456: 0.13184,
  e7: 0.11288,
  s12: 0.15066,
  w12: 0.12425,
} as const;

export const DEFAULT_TIMING_PROFILE: OptimizationTimingProfile = Object.freeze({
  profileVersion: "v1.0.0",
  secondsPerWeightedDistance: SECONDS_PER_WEIGHTED_DISTANCE,
  halfLivesSec: [1800, 3600, 7200] as const,
  halfLifeWeights: [1 / 3, 1 / 3, 1 / 3] as const,
  defaultServiceTimeSec: 30 as const,
  wallServiceTimeSec: 200 as const,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHalfLives(value: unknown): value is [1800, 3600, 7200] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === 1800 &&
    value[1] === 3600 &&
    value[2] === 7200
  );
}

function isHalfLifeWeights(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (weight) =>
        typeof weight === "number" && Number.isFinite(weight) && weight >= 0,
    ) &&
    Math.abs(value.reduce((sum, weight) => sum + weight, 0) - 1) <= 1e-9
  );
}

/** Parse untrusted timing-profile data at the Worker/application boundary. */
export function parseOptimizationTimingProfile(
  input: unknown,
): OptimizationTimingProfile | null {
  if (!isRecord(input)) return null;
  const coefficients = input.secondsPerWeightedDistance;
  if (!isRecord(coefficients)) return null;
  const entries = Object.entries(coefficients);
  if (
    !entries.every(
      ([areaId, coefficient]) =>
        areaId.length > 0 &&
        typeof coefficient === "number" &&
        Number.isFinite(coefficient) &&
        coefficient > 0,
    )
  ) {
    return null;
  }
  if (
    typeof input.profileVersion !== "string" ||
    !isHalfLives(input.halfLivesSec) ||
    !isHalfLifeWeights(input.halfLifeWeights) ||
    input.defaultServiceTimeSec !== 30 ||
    input.wallServiceTimeSec !== 200
  ) {
    return null;
  }
  return Object.freeze({
    profileVersion: input.profileVersion,
    secondsPerWeightedDistance: Object.freeze(
      Object.fromEntries(entries) as Record<string, number>,
    ),
    halfLivesSec: [1800, 3600, 7200] as const,
    halfLifeWeights: [
      input.halfLifeWeights[0],
      input.halfLifeWeights[1],
      input.halfLifeWeights[2],
    ] as const,
    defaultServiceTimeSec: 30 as const,
    wallServiceTimeSec: 200 as const,
  });
}

/**
 * Convert Task 5's weighted grid distance into seconds without applying the
 * crowded multiplier a second time.
 */
export function convertDistanceToTravelTime(
  weightedDistance: number,
  areaId: string,
  profile: OptimizationTimingProfile = DEFAULT_TIMING_PROFILE,
): number {
  if (Number.isNaN(weightedDistance) || weightedDistance < 0) {
    throw new Error("weightedDistance must be a non-negative number");
  }
  const coefficient = profile.secondsPerWeightedDistance[areaId];
  if (coefficient === undefined) {
    throw new Error(`Unknown timing profile area: ${areaId}`);
  }
  return weightedDistance * coefficient;
}

function validateDecayParameters(
  halfLives: readonly [number, number, number],
  weights: readonly [number, number, number],
): void {
  if (
    !halfLives.every((halfLife) => Number.isFinite(halfLife) && halfLife > 0) ||
    !weights.every((weight) => Number.isFinite(weight) && weight >= 0) ||
    Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-9
  ) {
    throw new Error(
      "halfLifeWeights must be finite, non-negative, and sum to 1",
    );
  }
}

/** Evaluate the equal-weight time-decay function from the approved profile. */
export function calculateDecay(
  tSec: number,
  halfLives: readonly [number, number, number] = [1800, 3600, 7200],
  weights: readonly [number, number, number] = [1 / 3, 1 / 3, 1 / 3],
): number {
  if (!Number.isFinite(tSec) || tSec < 0) {
    throw new Error("completion time must be a finite non-negative number");
  }
  validateDecayParameters(halfLives, weights);
  let sum = 0;
  for (let i = 0; i < halfLives.length; i++) {
    sum += weights[i] * 2 ** (-tSec / halfLives[i]);
  }
  return sum;
}

export interface TimeDecayedAlnsProblem {
  readonly nodeIds: readonly string[];
  /** Flat size x size travel times in seconds. Index 0 is the start position. */
  readonly travelTimesSec: readonly number[];
  readonly serviceTimesSec: readonly number[];
  readonly values: readonly number[];
  readonly size: number;
  readonly fixedFirstTarget: string | null;
  readonly searchTimeLimitMs: AlnsSearchTimeLimitMs;
  readonly randomSeed: number;
  readonly initialSolutions: readonly (readonly string[])[];
  readonly halfLivesSec: readonly [1800, 3600, 7200];
  readonly halfLifeWeights: readonly [number, number, number];
  readonly optimizationProfileVersion: string;
}

export interface TimeDecayedAlnsBestSolution {
  readonly route: readonly string[];
  readonly score: number;
  readonly completionTimesSec: readonly number[];
  readonly elapsedMs: number;
  readonly optimizationProfileVersion: string;
}

export interface TimeDecayedAlnsProgress {
  readonly elapsedMs: number;
  readonly searchTimeLimitMs: AlnsSearchTimeLimitMs;
  readonly best: TimeDecayedAlnsBestSolution;
}

export interface EvaluatedRoute {
  readonly completionTimesSec: readonly number[];
  readonly score: number;
}

/** Return a non-negative finite priority value for the optimizer. */
export function normalizeRouteValue(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Evaluate purchase completion times and the time-decayed route score.
 * Unreachable legs are represented as Infinity and contribute no score; the
 * solver's repair phase prevents such routes from becoming a best solution.
 */
export function evaluateRouteScore(
  route: readonly string[],
  problem: TimeDecayedAlnsProblem,
): EvaluatedRoute {
  const {
    nodeIds,
    travelTimesSec,
    serviceTimesSec,
    values,
    size,
    halfLivesSec,
    halfLifeWeights,
  } = problem;

  validateDecayParameters(halfLivesSec, halfLifeWeights);
  const nodeMap = new Map<string, number>();
  for (let i = 0; i < nodeIds.length; i++) {
    nodeMap.set(nodeIds[i], i + 1);
  }

  const completionTimesSec: number[] = [];
  let score = 0;
  let currentTime = 0;
  let previousIndex = 0;

  for (const nodeId of route) {
    const currentIndex = nodeMap.get(nodeId);
    if (currentIndex === undefined) continue;

    const travelSec = travelTimesSec[previousIndex * size + currentIndex];
    const serviceSec = serviceTimesSec[currentIndex] ?? 30;
    if (
      !Number.isFinite(travelSec) ||
      !Number.isFinite(serviceSec) ||
      serviceSec < 0
    ) {
      completionTimesSec.push(Number.POSITIVE_INFINITY);
      break;
    }

    currentTime += travelSec + serviceSec;
    completionTimesSec.push(currentTime);
    score +=
      normalizeRouteValue(values[currentIndex]) *
      calculateDecay(currentTime, halfLivesSec, halfLifeWeights);
    previousIndex = currentIndex;
  }

  return Object.freeze({
    completionTimesSec: Object.freeze(completionTimesSec),
    score: Number.isFinite(score) ? score : 0,
  });
}
