import type { Circle } from "../../event-day/public-api";
import {
  filterCirclesByPriority,
} from "../../../shared/domain/circle-priority-filter";
import {
  rankCandidatesByGridDistanceFromGridIndex,
  type RankedCandidate,
} from "../domain/routing/grid-route-planner";
import type {
  GridMeta,
  PointsPayload,
} from "../domain/routing/grid-route-types";

export type NearbyCircleLimit = 5 | 10 | 15 | 20;

export interface NearbyCircleArea {
  readonly prefixes?: readonly string[];
  readonly labels?: readonly string[];
}

export interface NearbyCircleRankingInput {
  readonly pointsPayload: PointsPayload;
  readonly gridMeta: Partial<GridMeta>;
  readonly gridBytes: Uint8Array;
  readonly originGridIndex: number;
  readonly area: NearbyCircleArea | null;
  readonly circles: readonly Circle[];
  readonly getCircleStatus: (space: string) => string;
  readonly selectedPriorities?: readonly number[] | null;
  readonly includeHeld?: boolean;
  readonly limit?: NearbyCircleLimit;
}

function belongsToArea(circle: Circle, area: NearbyCircleArea | null): boolean {
  if (!area) return false;
  const space = circle.space?.trim() ?? "";
  return Boolean(
    area.prefixes?.includes(space[0]) && area.labels?.includes(space[1]),
  );
}

function finiteCandidates(
  ranked: readonly RankedCandidate[],
  limit: NearbyCircleLimit,
): RankedCandidate[] {
  return ranked.filter(({ distance }) => Number.isFinite(distance)).slice(0, limit);
}

export function rankNearbyCircles(
  input: NearbyCircleRankingInput,
): RankedCandidate[] {
  const eligible = filterCirclesByPriority(
    input.circles.filter((circle) => {
      const status = input.getCircleStatus(circle.space);
      return (
        belongsToArea(circle, input.area) &&
        status !== "purchased" &&
        (input.includeHeld || status !== "held")
      );
    }),
    input.selectedPriorities ?? null,
  );
  const ranked = rankCandidatesByGridDistanceFromGridIndex(
    input.pointsPayload,
    input.gridMeta,
    input.gridBytes,
    input.originGridIndex,
    [...eligible],
  );
  return finiteCandidates(ranked, input.limit ?? 5);
}
