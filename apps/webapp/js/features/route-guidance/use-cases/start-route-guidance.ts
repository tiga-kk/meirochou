import type { Circle, EventDayRef } from "../../event-day/public-api";
import type { MapAreaCatalog } from "../domain/map-area";
import type { ConfirmedPosition } from "../domain/navigation-state";
import type { RouteGuidanceSession } from "../domain/route-guidance-types";
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
    const firstCircle = input.pendingCircles[0] ?? null;
    if (!input.startPosition.areaId) {
      throw new Error("Route guidance requires a map area");
    }
    const area = firstCircle
      ? this.mapAreaCatalog.findMapAreaForCircleSpace(firstCircle.space)
      : null;
    const areaId = input.startPosition.areaId || area?.areaId;
    if (!areaId) {
      throw new Error("No map area is available for the starting position");
    }

    await this.assetsLoader.loadMapAssets(areaId);

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
      lockedFirstLeg: null,
      provisionalOrder: input.pendingCircles.map((c) => c.space),
      bestOrder: input.pendingCircles.map((c) => c.space),
      optimizationGeneration: 1,
    };

    const newSnapshot = {
      navigationState: navState,
      currentDestination: firstCircle,
      currentRoute: null,
      selectedDestination: null,
      selectedRoute: null,
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
