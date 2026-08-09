import {
  buildDistanceMatrixCacheKey,
  computeAllPairsDistances,
  type DistanceMatrixRepository,
  type MatrixEndpoint,
  type MatrixGridInput,
  type StoredDistanceMatrix,
} from "../domain/routing/distance-matrix";

export interface BuildDistanceMatrixInput {
  readonly eventId: string;
  readonly dayId: string;
  readonly areaId: string;
  readonly bundleVersion: string;
  readonly gridWeightVersion: string;
  readonly grid: MatrixGridInput;
  readonly endpoints: readonly MatrixEndpoint[];
}

export class BuildDistanceMatrixUseCase {
  constructor(private readonly repository: DistanceMatrixRepository) {}

  execute(input: BuildDistanceMatrixInput): StoredDistanceMatrix {
    const cacheKey = buildDistanceMatrixCacheKey({
      eventId: input.eventId,
      dayId: input.dayId,
      areaId: input.areaId,
      bundleVersion: input.bundleVersion,
      gridWeightVersion: input.gridWeightVersion,
      endpoints: input.endpoints,
      schemaVersion: 1,
    });
    const cached = this.repository.load(cacheKey);
    if (cached) return cached;

    const result = computeAllPairsDistances(input.grid, input.endpoints);
    if (!result) throw new Error("At least one route endpoint is required");

    const matrix: StoredDistanceMatrix = {
      schemaVersion: 1,
      cacheKey,
      areaId: input.areaId,
      spaces: result.spaces,
      size: result.size,
      distances: result.distances,
      createdAt: new Date().toISOString(),
    };
    if (!this.repository.save(matrix)) {
      throw new Error("Distance matrix could not be saved");
    }
    return matrix;
  }
}
