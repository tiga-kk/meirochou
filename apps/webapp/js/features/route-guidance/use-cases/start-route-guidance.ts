import type { Circle, EventDayRef } from "../../event-day/public-api";
import type { MapAreaCatalog } from "../domain/map-area";
import type { ConfirmedPosition } from "../domain/navigation-state";
import type { RouteGuidanceSession } from "../domain/route-guidance-types";
import { planRouteFromGridIndex } from "../domain/routing/grid-route-planner";
import type { RouteGuidanceSnapshotRepository } from "./route-guidance-snapshot-repository";
import type { RouteMapAssetsLoader } from "./route-map-assets-loader";

export interface StartRouteGuidanceInput {
  readonly eventDay: EventDayRef;
  readonly startPosition: ConfirmedPosition;
  readonly pendingCircles: readonly Circle[];
}

export class StartRouteGuidanceUseCase {
  constructor(
    private session: RouteGuidanceSession,
    private mapAreaCatalog: MapAreaCatalog,
    private assetsLoader: RouteMapAssetsLoader,
    private snapshotRepo: RouteGuidanceSnapshotRepository,
  ) {}

  async execute(input: StartRouteGuidanceInput): Promise<void> {
    const areaFromCircle = this.mapAreaCatalog.findMapAreaForCircleSpace(
      input.pendingCircles[0]?.space ?? "",
    );
    const areaId = input.startPosition.areaId || areaFromCircle?.areaId || null;
    if (!areaId) {
      throw new Error("No map area is available for the starting position");
    }

    const area = this.mapAreaCatalog.getMapArea?.(areaId) ?? areaFromCircle;
    if (!area) throw new Error(`No map area is available: ${areaId}`);
    const assets = await this.assetsLoader.loadMapAssets(area);

    if (input.pendingCircles.length === 0) {
      this.session.replaceSnapshot({
        navigationState: {
          stage: "idle",
          areaId,
          currentPosition: input.startPosition,
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
        eventId: input.eventDay.eventId,
        dayId: input.eventDay.dayId,
        mapAreaId: areaId,
        startPosition: input.startPosition,
        targetSpace: null,
        visitedSpaces: [],
      });
      return;
    }

    const candidates = input.pendingCircles.map((circle, index) => ({
      circle,
      index,
      route: planRouteFromGridIndex(
        assets.points,
        assets.gridMetadata,
        assets.gridBytes,
        input.startPosition.gridIndex,
        circle.space,
      ),
    }));
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
    const orderedCircles = [
      ...reachable,
      ...candidates.filter((candidate) => candidate.route === null),
    ];
    const firstCircle = first.circle;
    const firstRoute = first.route;

    const navState = {
      stage: "navigating" as const,
      areaId,
      currentPosition: {
        areaId,
        gridIndex: input.startPosition.gridIndex,
        svgX: input.startPosition.svgX,
        svgY: input.startPosition.svgY,
        source: input.startPosition.source,
        circleSpace: input.startPosition.circleSpace,
      },
      targetSpace: firstCircle?.space ?? null,
      lockedFirstLeg: {
        from: {
          type: "start" as const,
          areaId,
          gridIndex: input.startPosition.gridIndex,
        },
        toSpace: firstCircle.space,
      },
      provisionalOrder: orderedCircles.map(
        (candidate) => candidate.circle.space,
      ),
      bestOrder: orderedCircles.map((candidate) => candidate.circle.space),
      optimizationGeneration: 1,
    };

    const newSnapshot = {
      navigationState: navState,
      currentDestination: firstCircle,
      currentRoute: firstRoute,
      selectedDestination: firstCircle,
      selectedRoute: firstRoute,
      selectionStatus: "ready" as const,
      routeOptimizationGeneration: 1,
    };

    this.session.replaceSnapshot(newSnapshot);
    this.snapshotRepo.saveSnapshot(input.eventDay, {
      eventId: input.eventDay.eventId,
      dayId: input.eventDay.dayId,
      mapAreaId: areaId,
      startPosition: navState.currentPosition,
      targetSpace: navState.targetSpace,
      visitedSpaces: [],
    });
  }
}
