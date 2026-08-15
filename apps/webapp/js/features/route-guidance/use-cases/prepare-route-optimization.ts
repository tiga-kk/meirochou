import type { CircleRecord, EventDayRef } from "../../event-day/public-api";
import type { MapAreaCatalog } from "../domain/map-area";
import {
  buildDistanceMatrixCacheKey,
  distancesFromStartToEndpoints,
  type DistanceMatrixJobInput,
  type StoredDistanceMatrix,
} from "../domain/routing/distance-matrix";
import type { ConfirmedPosition } from "../domain/navigation-state";
import { parseSpace } from "../../../shared/domain/space-parser";
import type { RouteMapAssetsLoader } from "./route-map-assets-loader";
import {
  collectWallIdentifiers,
  resolveCircleQueueClass,
} from "../../../shared/domain/wall-circle-classification";

export interface PrepareRouteOptimizationInput {
  readonly eventDay: EventDayRef;
  readonly bundleVersion: string;
  readonly areaId: string;
  readonly currentPosition: ConfirmedPosition;
  /** searchNextでpriority/hold条件を適用済みの、StartRouteGuidanceUseCaseと同一集合。 */
  readonly pendingCircles: readonly CircleRecord[];
  readonly searchTimeLimitMs: 5000 | 10000 | 15000;
}

export interface PreparedRouteOptimization {
  readonly areaId: string;
  readonly matrixRef: string;
  readonly pendingCircles: readonly CircleRecord[];
  readonly startDistanceToCircles: readonly number[];
  readonly distanceMatrix: readonly number[];
  readonly searchTimeLimitMs: 5000 | 10000 | 15000;
}

export interface DistanceMatrixPreparationPort {
  start(input: DistanceMatrixJobInput): Promise<StoredDistanceMatrix | null>;
}

function findPortalIndex(assets: Awaited<ReturnType<RouteMapAssetsLoader["loadMapAssets"]>>, space: string): number | null {
  const [, identifier, number] = parseSpace(space);
  const point = assets.points.points.find(
    (candidate) =>
      ((candidate as typeof candidate & { space?: string }).space === space) ||
      (candidate.identifier === identifier && Number(candidate.number) === number),
  );
  const portal = point?.portals?.[0];
  if (!portal || portal.col < 0 || portal.row < 0 || portal.col >= assets.gridMetadata.cols || portal.row >= assets.gridMetadata.rows) {
    return null;
  }
  return portal.row * assets.gridMetadata.cols + portal.col;
}

function reorderDistanceMatrix(
  matrix: StoredDistanceMatrix,
  spaces: readonly string[],
): readonly number[] {
  const indexes = spaces.map((space) => matrix.spaces.indexOf(space));
  if (indexes.some((index) => index < 0)) {
    throw new Error("Distance matrix does not contain every pending circle");
  }
  return indexes.flatMap((row) =>
    indexes.map((column) => matrix.distances[row * matrix.size + column]),
  );
}

export class PrepareRouteOptimizationUseCase {
  constructor(
    private readonly mapAreaCatalog: MapAreaCatalog,
    private readonly assetsLoader: RouteMapAssetsLoader,
    private readonly distanceMatrixController: DistanceMatrixPreparationPort,
  ) {}

  async execute(input: PrepareRouteOptimizationInput): Promise<PreparedRouteOptimization> {
    if (input.pendingCircles.length === 0) {
      throw new Error("At least one pending circle is required");
    }
    const area = this.mapAreaCatalog.getMapArea(input.areaId);
    if (!area) throw new Error(`No map area is available: ${input.areaId}`);
    const assets = await this.assetsLoader.loadMapAssets(area);
    const wallIdentifiers = collectWallIdentifiers(assets.points.points);
    const pendingCircles = input.pendingCircles.map((circle) => ({
      ...circle,
      queueClass: resolveCircleQueueClass(circle.space, wallIdentifiers),
    }));
    const endpointIndexes = pendingCircles.map((circle) => findPortalIndex(assets, circle.space));
    if (endpointIndexes.some((index) => index === null)) {
      throw new Error("A pending circle is not present in route map assets");
    }
    const endpoints = pendingCircles.map((circle, index) => ({
      space: circle.space,
      gridIndex: endpointIndexes[index] as number,
    }));
    const cacheKey = buildDistanceMatrixCacheKey({
      eventId: input.eventDay.eventId,
      dayId: input.eventDay.dayId,
      areaId: input.areaId,
      bundleVersion: input.bundleVersion,
      gridWeightVersion: "v1",
      endpoints,
      schemaVersion: 1,
    });
    const matrix = await this.distanceMatrixController.start({
      eventId: input.eventDay.eventId,
      dayId: input.eventDay.dayId,
      areaId: input.areaId,
      cacheKey,
      gridInput: {
        grid: assets.gridBytes,
        cols: assets.gridMetadata.cols,
        rows: assets.gridMetadata.rows,
        cellSize: assets.gridMetadata.cell_size,
      },
      endpoints,
    });
    if (!matrix) throw new Error("Distance matrix could not be prepared");

    const startDistanceToCircles = Array.from(
      distancesFromStartToEndpoints(input.currentPosition.gridIndex, {
        grid: assets.gridBytes,
        cols: assets.gridMetadata.cols,
        rows: assets.gridMetadata.rows,
        cellSize: assets.gridMetadata.cell_size,
      }, endpointIndexes as number[]),
    );
    return {
      areaId: input.areaId,
      matrixRef: matrix.cacheKey,
      pendingCircles,
      startDistanceToCircles,
      distanceMatrix: reorderDistanceMatrix(
        matrix,
        pendingCircles.map((circle) => circle.space),
      ),
      searchTimeLimitMs: input.searchTimeLimitMs,
    };
  }
}
