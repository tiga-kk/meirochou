import type {
  GridMeta,
  OcrPoint,
  OcrPortal,
  PointsPayload,
} from "../domain/routing/grid-route-types";

export class RouteAssetValidationError extends Error {
  readonly path: string;

  constructor(path: string, expectation: string) {
    super(`${path}: expected ${expectation}`);
    this.name = "RouteAssetValidationError";
    this.path = path;
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RouteAssetValidationError(path, "an object");
  }
  return value as Record<string, unknown>;
}

function positiveNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RouteAssetValidationError(path, "a positive finite number");
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new RouteAssetValidationError(path, "a non-negative integer");
  }
  return value;
}

function nonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RouteAssetValidationError(
      path,
      "a non-negative finite number",
    );
  }
  return value;
}

function parsePortal(input: unknown, path: string): OcrPortal {
  const value = record(input, path);
  return {
    col: nonNegativeInteger(value.col, `${path}.col`),
    row: nonNegativeInteger(value.row, `${path}.row`),
    x: nonNegativeNumber(value.x, `${path}.x`),
    y: nonNegativeNumber(value.y, `${path}.y`),
  };
}

function parsePoint(input: unknown, path: string): OcrPoint {
  const value = record(input, path);
  if (!Array.isArray(value.portals)) {
    throw new RouteAssetValidationError(`${path}.portals`, "an array");
  }
  if (typeof value.number !== "string" && typeof value.number !== "number") {
    throw new RouteAssetValidationError(
      `${path}.number`,
      "a string or number",
    );
  }
  return {
    identifier:
      typeof value.identifier === "string"
        ? value.identifier
        : (() => {
            throw new RouteAssetValidationError(
              `${path}.identifier`,
              "a string",
            );
          })(),
    number: value.number,
    center_x: nonNegativeNumber(value.center_x, `${path}.center_x`),
    center_y: nonNegativeNumber(value.center_y, `${path}.center_y`),
    portals: value.portals.map((portal, index) =>
      parsePortal(portal, `${path}.portals[${index}]`),
    ),
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(typeof value.point_id === "number" ? { point_id: value.point_id } : {}),
    ...(typeof value.group_id === "string" ? { group_id: value.group_id } : {}),
  };
}

export function parsePointsPayload(input: unknown): PointsPayload {
  const value = record(input, "points payload");
  const image = record(value.image, "points payload.image");
  if (!Array.isArray(value.points)) {
    throw new RouteAssetValidationError("points payload.points", "an array");
  }
  const parsed: PointsPayload = {
    image: {
      width: positiveNumber(image.width, "points payload.image.width"),
      height: positiveNumber(image.height, "points payload.image.height"),
      ...(typeof image.path === "string" ? { path: image.path } : {}),
    },
    points: value.points.flatMap((point, index) => {
      const path = `points payload.points[${index}]`;
      const candidate = record(point, path);
      if (candidate.identifier === null || candidate.identifier === undefined) {
        return [];
      }
      return [parsePoint(candidate, path)];
    }),
  };
  if (value.grid !== undefined) {
    const grid = record(value.grid, "points payload.grid");
    parsed.grid = {
      cell_size: positiveNumber(
        grid.cell_size,
        "points payload.grid.cell_size",
      ),
      cols: positiveNumber(grid.cols, "points payload.grid.cols"),
      rows: positiveNumber(grid.rows, "points payload.grid.rows"),
      ...(typeof grid.grid_file === "string"
        ? { grid_file: grid.grid_file }
        : {}),
      ...(typeof grid.meta_file === "string"
        ? { meta_file: grid.meta_file }
        : {}),
    };
  }
  return parsed;
}

export function parseGridMeta(input: unknown): GridMeta {
  const value = record(input, "grid metadata");
  return {
    width: positiveNumber(value.width, "grid metadata.width"),
    height: positiveNumber(value.height, "grid metadata.height"),
    cell_size: positiveNumber(value.cell_size, "grid metadata.cell_size"),
    cols: positiveNumber(value.cols, "grid metadata.cols"),
    rows: positiveNumber(value.rows, "grid metadata.rows"),
    ...(typeof value.map_id === "string" ? { map_id: value.map_id } : {}),
    ...(typeof value.grid_file === "string"
      ? { grid_file: value.grid_file }
      : {}),
  };
}
