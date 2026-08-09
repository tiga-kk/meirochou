import type { Circle } from "./features/event-day/public-api";
import type {
  GridMeta,
  MapPoint,
  PointsPayload,
  RouteResult,
} from "./features/route-guidance/public-api";
import { rankCandidatesByGridDistance, planRoute } from "./features/route-guidance/domain/routing/grid-route-planner";
import { solveNearestNeighbor } from "./features/route-guidance/domain/optimization/nearest-neighbor-order";
import type { SpaceArea } from "./shared/domain/space-parser";

export interface DevDemoRouteAssets {
  readonly pointsPayload: PointsPayload;
  readonly gridMeta: Partial<GridMeta>;
  readonly gridBytes: Uint8Array;
}

export interface DevDemoRouteOptions {
  readonly startPosition?: MapPoint;
}

export function planDevDemoRoute(
  assets: DevDemoRouteAssets,
  startSpace: string,
  targetSpace: string,
  options: DevDemoRouteOptions = {},
): RouteResult | null {
  return planRoute(
    assets.pointsPayload,
    assets.gridMeta,
    assets.gridBytes,
    startSpace,
    targetSpace,
    options,
  );
}

export function rankDevDemoCandidates(
  assets: DevDemoRouteAssets,
  startSpace: string,
  sameAreaCandidates: Circle[],
  fallbackCandidates: Circle[],
  areas: readonly SpaceArea[],
): Circle[] | null {
  const ranked = rankCandidatesByGridDistance(
    assets.pointsPayload,
    assets.gridMeta,
    assets.gridBytes,
    startSpace,
    sameAreaCandidates,
  );
  const reachable = ranked
    .filter((item) => Number.isFinite(item.distance))
    .map((item) => ({
      ...item.candidate,
      gridDistance: Math.round(item.distance),
      ...(item.position ? { mapPosition: item.position } : {}),
    }));

  if (reachable.length === 0) return null;

  const unreachable = ranked
    .filter((item) => !Number.isFinite(item.distance))
    .map((item) => item.candidate);
  const fallbackRemainder = solveNearestNeighbor(
    startSpace,
    [...unreachable, ...fallbackCandidates],
    areas,
  ).slice(1);

  return [...reachable, ...fallbackRemainder];
}

export function orderDevDemoCandidates(
  startSpace: string,
  candidates: readonly Circle[],
  areas: readonly SpaceArea[],
): Array<Circle & { isStart: boolean }> {
  return solveNearestNeighbor(startSpace, candidates, areas);
}
