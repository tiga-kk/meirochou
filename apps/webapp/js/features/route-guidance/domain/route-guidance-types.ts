import type { Circle } from "../../event-day/public-api";

export type { Circle };

export interface RouteMapPoint {
  readonly x: number;
  readonly y: number;
}

export interface PointsPayload {
  readonly points: readonly RouteMapPoint[];
}

export interface GridMeta {
  readonly cols: number;
  readonly rows: number;
}

export type NavigationStage = "idle" | "navigating" | "atTarget";

export type RouteEndpointId =
  | {
      readonly type: "start";
      readonly areaId: string;
      readonly gridIndex: number;
    }
  | { readonly type: "circle"; readonly space: string };

export interface ConfirmedPosition {
  readonly areaId: string;
  readonly gridIndex: number;
  readonly svgX: number;
  readonly svgY: number;
  readonly source: "manual-start" | "arrived-circle";
  readonly circleSpace?: string;
}

export interface LockedLeg {
  readonly from: RouteEndpointId;
  readonly toSpace: string;
}

export interface NavigationState {
  readonly stage: NavigationStage;
  readonly areaId: string | null;
  readonly currentPosition: ConfirmedPosition | null;
  readonly targetSpace: string | null;
  readonly lockedFirstLeg: LockedLeg | null;
  readonly provisionalOrder: readonly string[];
  readonly bestOrder: readonly string[];
  readonly optimizationGeneration?: number;
}

export type SelectionStatus =
  | "idle"
  | "calculating"
  | "ready"
  | "comparing"
  | "error";

export interface RouteResult {
  readonly path: readonly { x: number; y: number }[];
  readonly distance: number;
}

export interface RouteGuidanceSessionSnapshot {
  readonly navigationState: NavigationState | null;
  readonly currentDestination: Circle | null;
  readonly currentRoute: RouteResult | null;
  readonly selectedDestination: Circle | null;
  readonly selectedRoute: RouteResult | null;
  readonly selectionStatus: SelectionStatus;
  readonly routeOptimizationGeneration: number;
}

export interface RouteGuidanceSession {
  getSnapshot(): RouteGuidanceSessionSnapshot;
  replaceSnapshot(snapshot: RouteGuidanceSessionSnapshot): void;
  clear(): void;
  subscribe(
    listener: (snapshot: RouteGuidanceSessionSnapshot) => void,
  ): () => void;
}
