import type { Circle } from "../../event-day/public-api";
import type { MapAreaCatalog } from "../domain/map-area";
import type { RouteGuidanceSession } from "../domain/route-guidance-types";
import {
  planRoute,
  planRouteFromGridIndex,
} from "../domain/routing/grid-route-planner";
import type { RouteGuidanceNavigationOperations } from "./route-guidance-navigation-operations";
import type {
  RouteMapAssets,
  RouteMapAssetsLoader,
} from "./route-map-assets-loader";

export type FinishCurrentCircleAction = "purchase" | "hold";

export interface FinishCurrentCircleInput {
  readonly action: FinishCurrentCircleAction;
  readonly completedSpace: string;
  readonly remainingCircles: readonly Circle[];
}

export type FinishCurrentCircleResult =
  | { readonly kind: "ignored" }
  | { readonly kind: "advanced" }
  | { readonly kind: "finished" }
  | {
      readonly kind: "failed";
      readonly reason:
        | "arrival-position-unavailable"
        | "next-target-missing"
        | "route-unavailable"
        | "invalid-transition";
    };

export class FinishCurrentCircleUseCase {
  constructor(
    private session: RouteGuidanceSession,
    private mapAreaCatalog: MapAreaCatalog,
    private assetsLoader: RouteMapAssetsLoader,
    private navigationOperations: RouteGuidanceNavigationOperations,
  ) {}

  async execute(
    input: FinishCurrentCircleInput,
  ): Promise<FinishCurrentCircleResult> {
    const snap = this.session.getSnapshot();
    const navState = snap.navigationState;
    if (!navState || navState.targetSpace !== input.completedSpace) {
      return { kind: "ignored" };
    }

    let assets: RouteMapAssets | null = null;
    let nextNavigationState;
    if (input.action === "purchase") {
      const area = navState.areaId
        ? this.mapAreaCatalog.getMapArea(navState.areaId)
        : null;
      if (!area) return { kind: "failed", reason: "route-unavailable" };
      try {
        assets = await this.assetsLoader.loadMapAssets(area);
      } catch {
        return { kind: "failed", reason: "route-unavailable" };
      }
      const lastCell = snap.currentRoute?.cells.at(-1);
      const targetPosition = snap.currentRoute?.targetPosition;
      const cols = assets.gridMetadata.cols;
      const rows = assets.gridMetadata.rows;
      if (
        !lastCell ||
        !targetPosition ||
        !Number.isInteger(lastCell.col) ||
        !Number.isInteger(lastCell.row) ||
        lastCell.col < 0 ||
        lastCell.row < 0 ||
        !Number.isInteger(cols) ||
        cols <= 0 ||
        !Number.isInteger(rows) ||
        rows <= 0 ||
        lastCell.col >= cols ||
        lastCell.row >= rows ||
        lastCell.row * cols + lastCell.col >= assets.gridBytes.length ||
        !Number.isFinite(targetPosition.x) ||
        !Number.isFinite(targetPosition.y)
      ) {
        return { kind: "failed", reason: "arrival-position-unavailable" };
      }
      try {
        const arrivedState = this.navigationOperations.handleArrival(navState, {
          areaId: navState.areaId as string,
          gridIndex: lastCell.row * cols + lastCell.col,
          svgX: targetPosition.x,
          svgY: targetPosition.y,
          source: "arrived-circle",
          circleSpace: input.completedSpace,
        });
        nextNavigationState =
          this.navigationOperations.handlePurchaseNext(arrivedState);
      } catch {
        return { kind: "failed", reason: "invalid-transition" };
      }
    } else {
      try {
        nextNavigationState =
          this.navigationOperations.handleBeforeArrivalHold(navState).navState;
      } catch {
        return { kind: "failed", reason: "invalid-transition" };
      }
    }

    const nextTargetSpace = nextNavigationState.targetSpace;
    if (!nextTargetSpace) {
      this.session.replaceSnapshot({
        ...snap,
        navigationState: nextNavigationState,
        currentDestination: null,
        currentRoute: null,
        selectedDestination: null,
        selectedRoute: null,
        selectionStatus: "idle",
      });
      return { kind: "finished" };
    }
    const nextDestination = input.remainingCircles.find(
      (circle) => circle.space === nextTargetSpace,
    );
    if (!nextDestination) {
      return { kind: "failed", reason: "next-target-missing" };
    }

    const lockedFirstLeg = nextNavigationState.lockedFirstLeg;
    if (lockedFirstLeg?.toSpace !== nextTargetSpace) {
      return { kind: "failed", reason: "invalid-transition" };
    }
    if (!assets) {
      const area = nextNavigationState.areaId
        ? this.mapAreaCatalog.getMapArea(nextNavigationState.areaId)
        : null;
      if (!area) return { kind: "failed", reason: "route-unavailable" };
      try {
        assets = await this.assetsLoader.loadMapAssets(area);
      } catch {
        return { kind: "failed", reason: "route-unavailable" };
      }
    }
    const route =
      lockedFirstLeg.from.type === "circle"
        ? planRoute(
            assets.points,
            assets.gridMetadata,
            assets.gridBytes,
            lockedFirstLeg.from.space,
            nextTargetSpace,
          )
        : planRouteFromGridIndex(
            assets.points,
            assets.gridMetadata,
            assets.gridBytes,
            nextNavigationState.currentPosition?.gridIndex ??
              lockedFirstLeg.from.gridIndex,
            nextTargetSpace,
          );
    if (!route) return { kind: "failed", reason: "route-unavailable" };

    const target = {
      ...nextDestination,
      gridDistance: Math.round(route.cost),
      mapPosition: route.targetPosition,
    };
    this.session.replaceSnapshot({
      ...snap,
      navigationState: nextNavigationState,
      currentDestination: target,
      currentRoute: route,
      selectedDestination: target,
      selectedRoute: route,
      selectionStatus: "idle",
    });
    return { kind: "advanced" };
  }
}
