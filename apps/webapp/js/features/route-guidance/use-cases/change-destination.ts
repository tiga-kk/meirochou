import type { Circle } from "../../event-day/public-api";
import type { MapAreaCatalog } from "../domain/map-area";
import type {
  NavigationState,
  RouteGuidanceRoute,
  RouteGuidanceSession,
  RouteGuidanceSessionSnapshot,
} from "../domain/route-guidance-types";
import {
  planRoute,
  planRouteFromGridIndex,
} from "../domain/routing/grid-route-planner";
import type { RouteGuidanceNavigationOperations } from "./route-guidance-navigation-operations";
import type { RouteMapAssetsLoader } from "./route-map-assets-loader";

export interface ChangeDestinationInput {
  readonly circleSpace: string;
  readonly circles: readonly Circle[];
}

export type DestinationSelectionResult =
  | { readonly kind: "ignored" | "selected" | "current" | "stale" }
  | {
      readonly kind: "route-unavailable";
      readonly reason: "invalid-origin" | "not-found";
    }
  | { readonly kind: "failed"; readonly error: unknown };

export type ManualDestinationResult =
  | {
      readonly kind:
        | "ignored"
        | "missing-position"
        | "route-unavailable"
        | "stale";
    }
  | { readonly kind: "changed"; readonly destination: Circle }
  | {
      readonly kind: "failed";
      readonly reason: "route-calculation" | "invalid-transition";
      readonly error: unknown;
    };

export class ChangeDestinationUseCase {
  private selectionToken = 0;

  constructor(
    private session: RouteGuidanceSession,
    private mapAreaCatalog: MapAreaCatalog,
    private assetsLoader: RouteMapAssetsLoader,
    private navigationOperations: RouteGuidanceNavigationOperations,
  ) {}

  /** Calculates a candidate route without replacing the confirmed route. */
  async execute(
    input: ChangeDestinationInput,
  ): Promise<DestinationSelectionResult> {
    const selected = this.findCircle(input);
    const initial = this.session.getSnapshot();
    if (!selected || initial.selectionStatus === "comparing") {
      return { kind: "ignored" };
    }

    const token = ++this.selectionToken;
    this.session.replaceSnapshot({
      ...initial,
      selectedDestination: selected,
      selectedRoute: null,
      selectionStatus: "loading",
    });
    if (!initial.currentRoute || !this.hasRouteOrigin(initial)) {
      return this.commitUnavailable(token, "invalid-origin");
    }
    if (!this.isCandidateInCurrentOriginArea(initial, selected.space)) {
      return this.commitUnavailable(token, "invalid-origin");
    }

    try {
      const route = await this.planRoute(
        initial,
        selected.space,
        initial.currentRoute.startPosition,
      );
      if (token !== this.selectionToken) return { kind: "stale" };
      if (!route) return this.commitUnavailable(token, "not-found");

      const destination = this.withRoute(selected, route);
      const kind =
        selected.space === initial.currentDestination?.space
          ? "current"
          : "selected";
      this.session.replaceSnapshot({
        ...this.session.getSnapshot(),
        selectedDestination: destination,
        selectedRoute: route,
        selectionStatus: kind === "current" ? "idle" : "ready",
      });
      return { kind };
    } catch (error) {
      if (token !== this.selectionToken) return { kind: "stale" };
      this.session.replaceSnapshot({
        ...this.session.getSnapshot(),
        selectionStatus: "error",
      });
      return { kind: "failed", error };
    }
  }

  /** Promotes a manual destination only after route and navigation updates succeed. */
  async changeManually(
    input: ChangeDestinationInput,
  ): Promise<ManualDestinationResult> {
    const selected = this.findCircle(input);
    if (!selected) return { kind: "ignored" };

    const token = ++this.selectionToken;
    const snapshot = this.session.getSnapshot();
    const navigationState = snapshot.navigationState;
    if (
      !navigationState?.currentPosition ||
      !navigationState.lockedFirstLeg?.from
    ) {
      return { kind: "missing-position" };
    }

    let route: RouteGuidanceRoute | null;
    try {
      route = await this.planRoute(snapshot, selected.space);
    } catch (error) {
      if (token !== this.selectionToken) return { kind: "stale" };
      return { kind: "failed", reason: "route-calculation", error };
    }
    if (token !== this.selectionToken) return { kind: "stale" };
    if (!route) return { kind: "route-unavailable" };

    let nextNavigationState: NavigationState;
    try {
      nextNavigationState = this.navigationOperations.handleManualTarget(
        navigationState,
        selected.space,
      ).navState;
    } catch (error) {
      return { kind: "failed", reason: "invalid-transition", error };
    }

    const destination = this.withRoute(selected, route);
    this.session.replaceSnapshot({
      ...snapshot,
      navigationState: nextNavigationState,
      currentDestination: destination,
      currentRoute: route,
      selectedDestination: destination,
      selectedRoute: route,
      selectionStatus: "idle",
    });
    return { kind: "changed", destination };
  }

  /** Enters candidate comparison when a complete candidate route exists. */
  compare(): boolean {
    const snapshot = this.session.getSnapshot();
    if (snapshot.selectionStatus !== "ready" || !snapshot.selectedRoute) {
      return false;
    }
    this.session.replaceSnapshot({
      ...snapshot,
      selectionStatus: "comparing",
    });
    return true;
  }

  /** Promotes the compared candidate while retaining it as the selected route. */
  confirm(): Circle | null {
    const snapshot = this.session.getSnapshot();
    if (
      snapshot.selectionStatus !== "comparing" ||
      !snapshot.selectedDestination ||
      !snapshot.selectedRoute
    ) {
      return null;
    }
    this.session.replaceSnapshot({
      ...snapshot,
      currentDestination: snapshot.selectedDestination,
      currentRoute: snapshot.selectedRoute,
      selectionStatus: "idle",
    });
    return snapshot.selectedDestination;
  }

  /** Leaves comparison while retaining the calculated candidate route. */
  cancelComparison(): boolean {
    const snapshot = this.session.getSnapshot();
    if (snapshot.selectionStatus !== "comparing") return false;
    this.session.replaceSnapshot({ ...snapshot, selectionStatus: "ready" });
    return true;
  }

  /** Invalidates an in-flight candidate calculation. */
  invalidatePendingSelection(): void {
    this.selectionToken += 1;
  }

  private findCircle(input: ChangeDestinationInput): Circle | null {
    return (
      input.circles.find((circle) => circle.space === input.circleSpace) ?? null
    );
  }

  private hasRouteOrigin(snapshot: RouteGuidanceSessionSnapshot): boolean {
    return Boolean(
      snapshot.navigationState?.currentPosition &&
        snapshot.navigationState.lockedFirstLeg?.from,
    );
  }

  private isCandidateInCurrentOriginArea(
    snapshot: RouteGuidanceSessionSnapshot,
    targetSpace: string,
  ): boolean {
    const origin = snapshot.navigationState?.lockedFirstLeg?.from;
    if (!origin) return false;
    const originAreaId =
      origin.type === "start"
        ? origin.areaId
        : this.mapAreaCatalog.findMapAreaForCircleSpace(origin.space)?.areaId;
    const candidateAreaId =
      this.mapAreaCatalog.findMapAreaForCircleSpace(targetSpace)?.areaId;
    return Boolean(
      originAreaId && candidateAreaId && originAreaId === candidateAreaId,
    );
  }

  private async planRoute(
    snapshot: RouteGuidanceSessionSnapshot,
    targetSpace: string,
    startPosition?: RouteGuidanceRoute["startPosition"],
  ): Promise<RouteGuidanceRoute | null> {
    const navigationState = snapshot.navigationState;
    const currentPosition = navigationState?.currentPosition;
    const origin = navigationState?.lockedFirstLeg?.from;
    if (!navigationState || !currentPosition || !origin) return null;
    const areaId =
      origin.type === "start" ? origin.areaId : navigationState.areaId;
    const area = areaId ? this.mapAreaCatalog.getMapArea(areaId) : null;
    if (!area) return null;
    const assets = await this.assetsLoader.loadMapAssets(area);
    return origin.type === "circle"
      ? planRoute(
          assets.points,
          assets.gridMetadata,
          assets.gridBytes,
          origin.space,
          targetSpace,
          { startPosition },
        )
      : planRouteFromGridIndex(
          assets.points,
          assets.gridMetadata,
          assets.gridBytes,
          currentPosition.gridIndex,
          targetSpace,
        );
  }

  private commitUnavailable(
    token: number,
    reason: "invalid-origin" | "not-found",
  ): DestinationSelectionResult {
    if (token !== this.selectionToken) return { kind: "stale" };
    this.session.replaceSnapshot({
      ...this.session.getSnapshot(),
      selectionStatus: "error",
    });
    return { kind: "route-unavailable", reason };
  }

  private withRoute(circle: Circle, route: RouteGuidanceRoute): Circle {
    return {
      ...circle,
      gridDistance: Math.round(route.cost),
      mapPosition: route.targetPosition,
    };
  }
}
