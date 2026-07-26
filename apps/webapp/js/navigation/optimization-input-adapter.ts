import {
  convertDistanceToTravelTime,
  DEFAULT_TIMING_PROFILE,
  type OptimizationTimingProfile,
  type TimeDecayedAlnsProblem,
} from "../routing/time-decayed-objective";
import type { CircleRecord } from "../types/domain";

export function resolveServiceTimeSec(
  circle: CircleRecord,
  profile: OptimizationTimingProfile = DEFAULT_TIMING_PROFILE,
): number {
  if (circle.queueClass === "wall") {
    return profile.wallServiceTimeSec;
  }
  return profile.defaultServiceTimeSec;
}

export interface OptimizationProblemInput {
  readonly areaId: string;
  readonly startDistanceToCircles: readonly number[];
  readonly pendingCircles: readonly CircleRecord[];
  /** Flat NxN weighted distance matrix from Task 5 */
  readonly distanceMatrix: readonly number[];
  readonly fixedFirstTarget: string | null;
  readonly searchTimeLimitMs: 5000 | 10000 | 15000;
  readonly randomSeed: number;
  readonly timingProfile?: OptimizationTimingProfile;
  readonly initialSolutions?: readonly (readonly string[])[];
}

function convertInputDistance(
  distance: number,
  areaId: string,
  profile: OptimizationTimingProfile,
  fieldName: string,
): number {
  if (
    typeof distance !== "number" ||
    Number.isNaN(distance) ||
    distance < 0 ||
    (distance !== Infinity && !Number.isFinite(distance))
  ) {
    throw new Error(`${fieldName} contains an invalid weighted distance`);
  }
  return convertDistanceToTravelTime(distance, areaId, profile);
}

export function buildOptimizationProblem(
  input: OptimizationProblemInput,
): TimeDecayedAlnsProblem {
  const profile = input.timingProfile ?? DEFAULT_TIMING_PROFILE;
  if (profile.secondsPerWeightedDistance[input.areaId] === undefined) {
    throw new Error(`Unknown timing profile area: ${input.areaId}`);
  }

  const nodeIds = input.pendingCircles.map((c) => c.space);
  const n = nodeIds.length + 1; // index 0 is start position

  if (input.startDistanceToCircles.length !== nodeIds.length) {
    throw new Error("startDistanceToCircles length must match pendingCircles");
  }
  if (input.distanceMatrix.length !== nodeIds.length ** 2) {
    throw new Error("distanceMatrix must be an N x N circle matrix");
  }
  if (
    input.fixedFirstTarget !== null &&
    !nodeIds.includes(input.fixedFirstTarget)
  ) {
    throw new Error("fixedFirstTarget must be a pending circle");
  }

  // Convert values: max(0, priority ?? 0)
  const values: number[] = [0];
  const serviceTimesSec: number[] = [0];

  for (const circle of input.pendingCircles) {
    const rawPrio = circle.priority ?? 0;
    values.push(Number.isFinite(rawPrio) && rawPrio > 0 ? rawPrio : 0);
    serviceTimesSec.push(resolveServiceTimeSec(circle, profile));
  }

  // Convert NxN distance matrix to travel times in seconds
  // Size = n x n
  const travelTimesSec = new Array<number>(n * n).fill(0);

  // Start to circles (row 0)
  for (let j = 1; j < n; j++) {
    const dist = input.startDistanceToCircles[j - 1];
    const travelTime = convertInputDistance(
      dist,
      input.areaId,
      profile,
      "startDistanceToCircles",
    );
    travelTimesSec[0 * n + j] = travelTime;
    travelTimesSec[j * n + 0] = travelTime;
  }

  // Circle to circle
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      if (i === j) {
        travelTimesSec[i * n + j] = 0;
      } else {
        // Input distanceMatrix is (n-1) x (n-1) for circles
        const circleMatrixSize = input.pendingCircles.length;
        const dist = input.distanceMatrix[(i - 1) * circleMatrixSize + (j - 1)];
        travelTimesSec[i * n + j] = convertInputDistance(
          dist,
          input.areaId,
          profile,
          "distanceMatrix",
        );
      }
    }
  }

  return Object.freeze({
    nodeIds: Object.freeze(nodeIds),
    travelTimesSec: Object.freeze(travelTimesSec),
    serviceTimesSec: Object.freeze(serviceTimesSec),
    values: Object.freeze(values),
    size: n,
    fixedFirstTarget: input.fixedFirstTarget,
    searchTimeLimitMs: input.searchTimeLimitMs,
    randomSeed: input.randomSeed,
    initialSolutions: input.initialSolutions ?? [],
    halfLivesSec: profile.halfLivesSec,
    halfLifeWeights: profile.halfLifeWeights,
    optimizationProfileVersion: profile.profileVersion,
  });
}
