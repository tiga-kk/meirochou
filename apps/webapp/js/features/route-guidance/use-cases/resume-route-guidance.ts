import type { Circle, EventDayRef } from "../../event-day/public-api";
import type { RouteGuidanceSession } from "../domain/route-guidance-types";
import type { RouteGuidanceSnapshotRepository } from "./route-guidance-snapshot-repository";
import type { RouteMapAssetsLoader } from "./route-map-assets-loader";

export interface ResumeRouteGuidanceInput {
  readonly eventDay: EventDayRef;
  readonly circles: readonly Circle[];
}

export class ResumeRouteGuidanceUseCase {
  constructor(
    private session: RouteGuidanceSession,
    private snapshotRepo: RouteGuidanceSnapshotRepository,
    private assetsLoader: RouteMapAssetsLoader,
  ) {}

  async execute(input: ResumeRouteGuidanceInput): Promise<boolean> {
    const saved = this.snapshotRepo.loadSnapshot(input.eventDay);
    if (!saved) return false;

    if (
      saved.eventId !== input.eventDay.eventId ||
      saved.dayId !== input.eventDay.dayId
    ) {
      this.snapshotRepo.deleteSnapshot(input.eventDay);
      return false;
    }

    await this.assetsLoader.loadMapAssets(saved.mapAreaId);

    const currentDestination =
      input.circles.find((c) => c.space === saved.targetSpace) ?? null;
    if (saved.targetSpace !== null && currentDestination === null) {
      this.snapshotRepo.deleteSnapshot(input.eventDay);
      return false;
    }
    const navState = {
      stage: "navigating" as const,
      areaId: saved.mapAreaId,
      currentPosition: saved.startPosition,
      targetSpace: saved.targetSpace,
      lockedFirstLeg: null,
      provisionalOrder: input.circles.map((c) => c.space),
      bestOrder: input.circles.map((c) => c.space),
      optimizationGeneration: 1,
    };

    this.session.replaceSnapshot({
      navigationState: navState,
      currentDestination,
      currentRoute: null,
      selectedDestination: null,
      selectedRoute: null,
      selectionStatus: "ready",
      routeOptimizationGeneration: 1,
    });

    return true;
  }
}
