import type { Circle, EventDayRef } from "../../event-day/public-api";
import type { MapAreaCatalog } from "../domain/map-area";
import type { ConfirmedPosition } from "../domain/navigation-state";
import type { RouteGuidanceSession } from "../domain/route-guidance-types";
import { planRouteFromGridIndex } from "../domain/routing/grid-route-planner";
import { parseSpace } from "../../../shared/domain/space-parser";
import type { RouteGuidanceSnapshotRepository } from "./route-guidance-snapshot-repository";
import type {
  RouteMapAssets,
  RouteMapAssetsLoader,
} from "./route-map-assets-loader";

export interface StartRouteGuidanceInput {
  readonly eventDay: EventDayRef;
  readonly bundleVersion: string;
  readonly startPosition?: ConfirmedPosition;
  readonly startSpace?: string;
  readonly currentLocation?: {
    readonly areaId: string;
    readonly label: string;
    readonly number: string | number;
  };
  readonly pendingCircles: readonly Circle[];
  readonly matrixRef: string | null;
  readonly optimizationTimeLimitMs: 5000 | 10000 | 15000;
}

export class StartRouteGuidanceUseCase {
  constructor(
    private session: RouteGuidanceSession,
    private mapAreaCatalog: MapAreaCatalog,
    private assetsLoader: RouteMapAssetsLoader,
    private snapshotRepo: RouteGuidanceSnapshotRepository,
  ) {}

  private findPoint(points: RouteMapAssets["points"], space: string) {
    const [, identifier, number] = parseSpace(space);
    return points.points.find(
      (point) =>
        (point as typeof point & { space?: string }).space === space ||
        (point.identifier === identifier && Number(point.number) === number),
    );
  }

  private resolveStartPosition(
    assets: RouteMapAssets,
    areaId: string,
    space: string,
  ): ConfirmedPosition {
    const point = this.findPoint(assets.points, space);
    const portal = point?.portals[0];
    if (
      !portal ||
      portal.col < 0 ||
      portal.row < 0 ||
      portal.col >= assets.gridMetadata.cols ||
      portal.row >= assets.gridMetadata.rows
    ) {
      throw new Error("Current location is not present in route map assets");
    }
    const centerX = Number(point.center_x);
    const centerY = Number(point.center_y);
    return {
      areaId,
      gridIndex: portal.row * assets.gridMetadata.cols + portal.col,
      svgX: Number.isFinite(centerX) ? centerX : portal.x,
      svgY: Number.isFinite(centerY) ? centerY : portal.y,
      source: "manual-start",
    };
  }

  async execute(input: StartRouteGuidanceInput): Promise<void> {
    const requestedStartSpace = input.startSpace;
    const areaFromLocation = input.currentLocation
      ? this.mapAreaCatalog.getMapArea(input.currentLocation.areaId)
      : null;
    const locationStartSpace = areaFromLocation?.prefixes?.[0] &&
      input.currentLocation?.label &&
      Number.isInteger(Number(input.currentLocation.number))
      ? `${areaFromLocation.prefixes[0]}${input.currentLocation.label[0]}${input.currentLocation.number}`
      : undefined;
    const startSpace = requestedStartSpace ?? locationStartSpace;
    const areaFromStart = startSpace
      ? this.mapAreaCatalog.findMapAreaForCircleSpace(startSpace)
      : null;
    const areaFromCircle = this.mapAreaCatalog.findMapAreaForCircleSpace(
      input.pendingCircles[0]?.space ?? "",
    );
    const areaId =
      input.startPosition?.areaId ||
      areaFromStart?.areaId ||
      areaFromCircle?.areaId ||
      null;
    if (!areaId) {
      throw new Error("No map area is available for the starting position");
    }

    const area =
      this.mapAreaCatalog.getMapArea?.(areaId) ?? areaFromStart ?? areaFromCircle;
    if (!area) throw new Error(`No map area is available: ${areaId}`);
    const assets = await this.assetsLoader.loadMapAssets(area);
    const startPosition =
      input.startPosition ??
      (startSpace
        ? this.resolveStartPosition(assets, areaId, startSpace)
        : null);
    if (!startPosition) {
      throw new Error("A starting position is required");
    }

    if (input.pendingCircles.length === 0) {
      this.session.replaceSnapshot({
        navigationState: {
          stage: "idle",
          areaId,
          currentPosition: startPosition,
          targetSpace: null,
          lockedFirstLeg: null,
          provisionalOrder: [],
          bestOrder: [],
          optimizationGeneration: 1,
        },
        currentDestination: null,
        currentRoute: null,
        selectedDestination: null,
        selectedRoute: null,
        selectionStatus: "idle",
        routeOptimizationGeneration: 1,
      });
      this.snapshotRepo.saveSnapshot(input.eventDay, {
        schemaVersion: 1,
        eventId: input.eventDay.eventId,
        dayId: input.eventDay.dayId,
        areaId,
        bundleVersion: input.bundleVersion,
        matrixRef: input.matrixRef,
        navState: this.session.getSnapshot().navigationState!,
        optimizationTimeLimitMs: input.optimizationTimeLimitMs,
        savedAt: new Date().toISOString(),
      });
      return;
    }

    const candidates = input.pendingCircles
      .filter(
        (circle) =>
          this.mapAreaCatalog.findMapAreaForCircleSpace(circle.space)?.areaId ===
          areaId,
      )
      .map((circle, index) => ({
      circle,
      index,
      route: planRouteFromGridIndex(
        assets.points,
        assets.gridMetadata,
        assets.gridBytes,
        startPosition.gridIndex,
        circle.space,
      ),
      }));
    if (candidates.length === 0) {
      throw new Error(
        "No pending route guidance target is available in the current map area",
      );
    }
    const reachable = candidates
      .filter((candidate) => candidate.route !== null)
      .sort(
        (left, right) =>
          (left.route?.cost ?? Infinity) - (right.route?.cost ?? Infinity) ||
          left.index - right.index,
      );
    if (reachable.length === 0 || !reachable[0].route) {
      throw new Error("No reachable route guidance target is available");
    }
    const first = reachable[0];
    const firstRoute = first.route;
    if (!firstRoute) {
      throw new Error("No reachable route guidance target is available");
    }
    const orderedCircles = [
      ...reachable,
      ...candidates.filter((candidate) => candidate.route === null),
    ];
    const firstCircle = first.circle;

    const navState = {
      stage: "navigating" as const,
      areaId,
      currentPosition: {
        areaId,
        gridIndex: startPosition.gridIndex,
        svgX: startPosition.svgX,
        svgY: startPosition.svgY,
        source: startPosition.source,
        circleSpace: startPosition.circleSpace,
      },
      targetSpace: firstCircle?.space ?? null,
      lockedFirstLeg: {
        from: {
          type: "start" as const,
          areaId,
          gridIndex: startPosition.gridIndex,
        },
        toSpace: firstCircle.space,
      },
      provisionalOrder: orderedCircles.map(
        (candidate) => candidate.circle.space,
      ),
      bestOrder: orderedCircles.map((candidate) => candidate.circle.space),
      optimizationGeneration: 1,
    };

    const displayFirstCircle = {
      ...firstCircle,
      gridDistance: Math.round(firstRoute.cost),
      mapPosition: firstRoute.targetPosition,
    };
    const newSnapshot = {
      navigationState: navState,
      currentDestination: displayFirstCircle,
      currentRoute: firstRoute,
      selectedDestination: displayFirstCircle,
      selectedRoute: firstRoute,
      selectionStatus: "ready" as const,
      routeOptimizationGeneration: 1,
    };

    this.session.replaceSnapshot(newSnapshot);
    this.snapshotRepo.saveSnapshot(input.eventDay, {
      schemaVersion: 1,
      eventId: input.eventDay.eventId,
      dayId: input.eventDay.dayId,
      areaId,
      bundleVersion: input.bundleVersion,
      matrixRef: input.matrixRef,
      navState,
      optimizationTimeLimitMs: input.optimizationTimeLimitMs,
      savedAt: new Date().toISOString(),
    });
  }
}
