import type {
  Circle,
  CircleRecord,
  CircleVisitState,
  EventDayRef,
} from "../../event-day/public-api";
import type { MapAreaCatalog } from "../domain/map-area";
import {
  distancesFromStartToEndpoints,
  type StoredDistanceMatrix,
} from "../domain/routing/distance-matrix";
import {
  planRoute,
  planRouteFromGridIndex,
} from "../domain/routing/grid-route-planner";
import type {
  NavigationState,
  RouteGuidanceSession,
} from "../domain/route-guidance-types";
import type { NavigationSnapshot } from "./route-guidance-snapshot-repository";
import type { RouteMapAssetsLoader } from "./route-map-assets-loader";
import { parseSpace } from "../../../shared/domain/space-parser";

export interface ResumeRouteGuidanceInput {
  readonly eventDay: EventDayRef;
  readonly circles: readonly Circle[];
  readonly circleStates: Record<string, CircleVisitState>;
}

export interface StartupInitInput {
  readonly eventId: string;
  readonly dayId: string;
  readonly bundleVersion: string;
  readonly circleStates: Record<string, CircleVisitState>;
  readonly pendingCircleSpaces: readonly string[];
}

export interface StartupInitResult {
  readonly shouldShowResumeDialog: boolean;
  readonly snapshot: NavigationSnapshot | null;
}

export interface RouteGuidanceRuntimePort {
  getPendingResumeSnapshot(): NavigationSnapshot | null;
  setPendingResumeSnapshot(snapshot: NavigationSnapshot | null): void;
  getMatrixRef(): string | null;
  setMatrixRef(matrixRef: string | null): void;
  getMatrixRepo(): {
    load(cacheKey: string): StoredDistanceMatrix | null;
  };
  resumeFromSnapshot(snapshot: NavigationSnapshot): {
    navState: NavigationState;
    optimizationTimeLimitMs: 5000 | 10000 | 15000;
    matrixRef: string | null;
    fixedFirstTarget: string | null;
    initialSolutions: readonly (readonly string[])[];
  };
  launchAlnsOptimization(
    input: {
      navState: NavigationState;
      areaId: string;
      startDistanceToCircles: readonly number[];
      pendingCircles: readonly CircleRecord[];
      distanceMatrix: readonly number[];
      fixedFirstTarget: string | null;
      searchTimeLimitMs: 5000 | 10000 | 15000;
      randomSeed: number;
      initialSolutions: readonly (readonly string[])[];
    },
    onProgress: (updatedState: NavigationState) => void,
  ): NavigationState;
  saveSnapshot(
    eventId: string,
    dayId: string,
    snapshot: NavigationSnapshot,
  ): void;
  initStartup(input: StartupInitInput): StartupInitResult;
  invalidateActiveOptimization(): void;
  clearSnapshot(eventId: string, dayId: string): void;
  deleteMatrix(eventId: string, dayId: string): void;
  dispose(): void;
}

export type ResumeRouteGuidanceResult =
  | { readonly kind: "idle" }
  | {
      readonly kind: "failed";
      readonly message: string;
    }
  | {
      readonly kind: "resumed";
      readonly targetSpace: string;
      readonly optimizationTimeLimitMs: 5000 | 10000 | 15000;
      readonly warningMessage?: string;
    };

function findAreaForSpace(space: string, mapAreaCatalog: MapAreaCatalog) {
  if (!space || typeof space !== "string") return null;
  const cleanedSpace = space.trim();
  if (cleanedSpace.length < 2) return null;
  const prefixChar = cleanedSpace[0];
  const labelChar = cleanedSpace[1];
  return (
    mapAreaCatalog
      .getAllMapAreas()
      .find(
        (area) =>
          area.prefixes?.includes(prefixChar) && area.labels?.includes(labelChar),
      ) ?? null
  );
}

function buildTargetWithRoute(target: Circle, route: NonNullable<unknown>) {
  return {
    ...target,
    gridDistance: Math.round((route as { cost: number }).cost),
    mapPosition: (route as { targetPosition: { x: number; y: number } })
      .targetPosition,
  };
}

function findPointPortalIndex(
  pointsPayload: { points?: readonly unknown[] },
  gridMeta: { cols: number; rows: number },
  space: string,
) {
  const [, identifier, number] = parseSpace(space);
  const point = pointsPayload?.points?.find(
    (candidate) => {
      const point = candidate as {
        space?: string;
        identifier?: string;
        number?: string | number;
      };
      return (
        point.space === space ||
        (point.identifier === identifier && Number(point.number) === number)
      );
    },
  ) as
    | {
        portals?: Array<{ col?: number; row?: number }>;
      }
    | undefined;
  const portal = point?.portals?.[0];
  const portalCol = portal?.col;
  const portalRow = portal?.row;
  if (
    !portal ||
    typeof portalCol !== "number" ||
    !Number.isInteger(portalCol) ||
    typeof portalRow !== "number" ||
    !Number.isInteger(portalRow) ||
    portalCol < 0 ||
    portalRow < 0 ||
    portalCol >= gridMeta.cols ||
    portalRow >= gridMeta.rows
  ) {
    return null;
  }
  return portalRow * gridMeta.cols + portalCol;
}

export class ResumeRouteGuidanceUseCase {
  constructor(
    private session: RouteGuidanceSession,
    private runtimeController: RouteGuidanceRuntimePort,
    private assetsLoader: RouteMapAssetsLoader,
    private mapAreaCatalog?: MapAreaCatalog,
  ) {}

  async execute(
    input: ResumeRouteGuidanceInput,
  ): Promise<ResumeRouteGuidanceResult> {
    const snapshot = this.runtimeController.getPendingResumeSnapshot();
    if (!snapshot) return { kind: "idle" };

    if (
      snapshot.eventId !== input.eventDay.eventId ||
      snapshot.dayId !== input.eventDay.dayId
    ) {
      return { kind: "failed", message: "目的地が見つかりません。始点を再設定してください" };
    }

    const resumeResult = this.runtimeController.resumeFromSnapshot(snapshot);
    const targetSpace = resumeResult.navState.targetSpace;
    const targetCircle = targetSpace
      ? input.circles.find((circle) => circle.space === targetSpace) ?? null
      : null;
    if (!targetCircle) {
      return {
        kind: "failed",
        message: "目的地が見つかりません。始点を再設定してください",
      };
    }

    const lockedLeg = resumeResult.navState.lockedFirstLeg;
    if (!lockedLeg) {
      return {
        kind: "failed",
        message: "経路の再構築に失敗しました。始点を設定し直してください",
      };
    }
    const route = await this.rebuildLockedRoute(lockedLeg, targetCircle);
    if (!route) {
      return {
        kind: "failed",
        message: "経路の再構築に失敗しました。始点を設定し直してください",
      };
    }

    let navState = resumeResult.navState;
    const optimizationInput = await this.buildOptimizationInput({
      snapshot,
      navState,
      circles: input.circles,
      circleStates: input.circleStates,
      targetSpace: targetCircle.space,
      fixedFirstTarget: resumeResult.fixedFirstTarget,
      optimizationTimeLimitMs: resumeResult.optimizationTimeLimitMs,
      initialSolutions: resumeResult.initialSolutions,
    });

    if ("message" in optimizationInput) {
      return { kind: "failed", message: optimizationInput.message };
    }

    try {
      navState = this.runtimeController.launchAlnsOptimization(
        {
          navState,
          areaId: optimizationInput.areaId,
          startDistanceToCircles: optimizationInput.startDistanceToCircles,
          pendingCircles: optimizationInput.pendingCircles,
          distanceMatrix: optimizationInput.subDistances,
          fixedFirstTarget: optimizationInput.fixedFirstTarget,
          searchTimeLimitMs: optimizationInput.searchTimeLimitMs,
          randomSeed: 0,
          initialSolutions: optimizationInput.initialSolutions,
        },
        (nextNavState) => {
          this.session.replaceSnapshot({
            ...this.session.getSnapshot(),
            navigationState: nextNavState,
          });
          this.persistSnapshot(
            snapshot,
            nextNavState,
            resumeResult.optimizationTimeLimitMs,
          );
        },
      );
    } catch (error) {
      console.error("Failed to start ALNS optimization", error);
      return { kind: "failed", message: "最適化の開始に失敗しました" };
    }

    this.runtimeController.setPendingResumeSnapshot(null);
    this.runtimeController.setMatrixRef(resumeResult.matrixRef);
    const target = buildTargetWithRoute(targetCircle, route);
    this.session.replaceSnapshot({
      ...this.session.getSnapshot(),
      navigationState: navState,
      currentDestination: target,
      currentRoute: route,
      selectedDestination: target,
      selectedRoute: route,
      selectionStatus: "idle",
    });

    return {
      kind: "resumed",
      targetSpace: targetCircle.space,
      optimizationTimeLimitMs: resumeResult.optimizationTimeLimitMs,
    };
  }

  private persistSnapshot(
    snapshot: NavigationSnapshot,
    navState: NavigationSnapshot["navState"],
    optimizationTimeLimitMs: 5000 | 10000 | 15000,
  ) {
    this.runtimeController.saveSnapshot(snapshot.eventId, snapshot.dayId, {
      ...snapshot,
      matrixRef: this.runtimeController.getMatrixRef(),
      navState,
      optimizationTimeLimitMs,
      savedAt: new Date().toISOString(),
    });
  }

  private async rebuildLockedRoute(
    lockedLeg: NonNullable<NavigationSnapshot["navState"]["lockedFirstLeg"]>,
    targetCircle: Circle,
  ) {
    if (!lockedLeg?.from || !this.mapAreaCatalog) return null;
    if (lockedLeg.from.type === "circle") {
      const area =
        this.mapAreaCatalog.findMapAreaForCircleSpace(lockedLeg.from.space) ??
        findAreaForSpace(targetCircle.space, this.mapAreaCatalog);
      if (!area) return null;
      const assets = await this.assetsLoader.loadMapAssets(area);
      return planRoute(
        assets.points,
        assets.gridMetadata,
        assets.gridBytes,
        lockedLeg.from.space,
        targetCircle.space,
      );
    }

    const area =
      this.mapAreaCatalog.getMapArea(lockedLeg.from.areaId) ??
      findAreaForSpace(targetCircle.space, this.mapAreaCatalog);
    if (!area) return null;
    const assets = await this.assetsLoader.loadMapAssets(area);
    return planRouteFromGridIndex(
      assets.points,
      assets.gridMetadata,
      assets.gridBytes,
      lockedLeg.from.gridIndex,
      targetCircle.space,
    );
  }

  private async buildOptimizationInput(input: {
    snapshot: NavigationSnapshot;
    navState: NavigationSnapshot["navState"];
    circles: readonly Circle[];
    circleStates: Record<string, CircleVisitState>;
    targetSpace: string;
    fixedFirstTarget: string | null;
    optimizationTimeLimitMs: 5000 | 10000 | 15000;
    initialSolutions: readonly (readonly string[])[];
  }):
    Promise<
      | {
          readonly message: string;
        }
      | {
          readonly areaId: string;
          readonly startDistanceToCircles: readonly number[];
          readonly pendingCircles: readonly CircleRecord[];
          readonly subDistances: readonly number[];
          readonly fixedFirstTarget: string | null;
          readonly searchTimeLimitMs: 5000 | 10000 | 15000;
          readonly initialSolutions: readonly (readonly string[])[];
        }
    > {
    if (!input.snapshot.matrixRef) {
      return {
        message:
          "距離行列が見つからないため、最適化を開始できませんでした",
      };
    }

    const storedMatrix = this.runtimeController
      .getMatrixRepo()
      .load(input.snapshot.matrixRef);
    if (!storedMatrix) {
      return {
        message:
          "保存済みの距離行列を読み込めないため、最適化を開始できませんでした",
      };
    }

    if (!this.isValidStoredMatrix(storedMatrix, input.navState, input.targetSpace)) {
      return {
        message: "保存済みの距離行列が現在の案内状態と一致しません",
      };
    }

    const pendingCircles = input.circles.filter(
      (circle) =>
        storedMatrix.spaces.includes(circle.space) &&
        (input.circleStates[circle.space] ?? "pending") === "pending",
    ) as CircleRecord[];
    const pendingSpaces = pendingCircles.map((circle) => circle.space);
    const subDistances = new Array(pendingSpaces.length * pendingSpaces.length).fill(
      Infinity,
    );
    for (let i = 0; i < pendingSpaces.length; i++) {
      const origI = storedMatrix.spaces.indexOf(pendingSpaces[i]);
      for (let j = 0; j < pendingSpaces.length; j++) {
        const origJ = storedMatrix.spaces.indexOf(pendingSpaces[j]);
        subDistances[i * pendingSpaces.length + j] =
          storedMatrix.distances[origI * storedMatrix.size + origJ];
      }
    }

    const lockedFrom = input.navState.lockedFirstLeg?.from;
    const startArea =
      lockedFrom?.type === "start"
        ? this.mapAreaCatalog?.getMapArea(lockedFrom.areaId) ??
          findAreaForSpace(input.targetSpace, this.mapAreaCatalog as MapAreaCatalog)
        : lockedFrom?.type === "circle"
          ? this.mapAreaCatalog?.findMapAreaForCircleSpace(lockedFrom.space) ?? null
          : null;
    if (!startArea) {
      return {
        message:
          "始点距離の計算に失敗したため、最適化を開始できませんでした",
      };
    }

    const assets = await this.assetsLoader.loadMapAssets(startArea);
    const startIndex =
      lockedFrom?.type === "start"
        ? lockedFrom.gridIndex
        : lockedFrom?.type === "circle"
          ? findPointPortalIndex(
              assets.points,
              assets.gridMetadata,
              lockedFrom.space,
            )
          : null;
    const endpointIndexes = pendingCircles.map((circle) =>
      findPointPortalIndex(
        assets.points,
        assets.gridMetadata,
        circle.space,
      ),
    );
    if (
      startIndex === null ||
      endpointIndexes.some((index) => index === null)
    ) {
      return {
        message:
          "始点距離の計算に失敗したため、最適化を開始できませんでした",
      };
    }

    const startDistanceToCircles = Array.from(
      distancesFromStartToEndpoints(
        startIndex,
        {
          grid: assets.gridBytes,
          cols: assets.gridMetadata.cols,
          rows: assets.gridMetadata.rows,
          cellSize: assets.gridMetadata.cell_size,
        },
        endpointIndexes as number[],
      ),
    );
    if (
      startDistanceToCircles.some(
        (distance) =>
          typeof distance !== "number" ||
          !Number.isFinite(distance) ||
          distance < 0,
      )
    ) {
      return {
        message:
          "始点距離が不正なため、最適化を開始できませんでした",
      };
    }

    return {
      areaId: storedMatrix.areaId,
      startDistanceToCircles,
      pendingCircles,
      subDistances,
      fixedFirstTarget: input.fixedFirstTarget,
      searchTimeLimitMs: input.optimizationTimeLimitMs,
      initialSolutions: input.initialSolutions,
    };
  }

  private isValidStoredMatrix(
    matrix: StoredDistanceMatrix,
    navState: NavigationSnapshot["navState"],
    targetSpace: string,
  ) {
    return (
      typeof matrix.areaId === "string" &&
      matrix.areaId === navState.areaId &&
      Array.isArray(matrix.spaces) &&
      Number.isInteger(matrix.size) &&
      matrix.spaces.length === matrix.size &&
      Array.isArray(matrix.distances) &&
      matrix.distances.length === matrix.size * matrix.size &&
      matrix.spaces.includes(targetSpace)
    );
  }
}
