import type {
  Circle,
  GasCircleResponse,
  GasSheetListResponse,
  GridMeta,
  MapBundleAreaV1,
  MapBundleManifestV1,
  OcrPoint,
  OcrPortal,
  PointsPayload,
} from "./domain";

export class BoundaryValidationError extends Error {
  constructor(path: string, expectation: string) {
    super(`${path}: expected ${expectation}`);
    this.name = "BoundaryValidationError";
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BoundaryValidationError(path, "an object");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string")
    throw new BoundaryValidationError(path, "a string");
  return value;
}

function nonEmptyText(value: unknown, path: string): string {
  const parsed = text(value, path).trim();
  if (!parsed) throw new BoundaryValidationError(path, "a non-empty string");
  return parsed;
}

function uniqueTextArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BoundaryValidationError(
      path,
      "a non-empty array of unique strings",
    );
  }
  const parsed = value.map((item, index) =>
    nonEmptyText(item, `${path}[${index}]`),
  );
  if (new Set(parsed).size !== parsed.length) {
    throw new BoundaryValidationError(
      path,
      "a non-empty array of unique strings",
    );
  }
  return parsed;
}

function resolveBundlePath(
  value: unknown,
  path: string,
  manifestUrl: URL,
): string {
  const relativePath = nonEmptyText(value, path);
  if (
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    relativePath.includes("?") ||
    relativePath.includes("#") ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(relativePath)
  ) {
    throw new BoundaryValidationError(
      path,
      "a relative path inside the map bundle",
    );
  }

  try {
    const segments = relativePath
      .split("/")
      .map((segment) => decodeURIComponent(segment));
    if (
      segments.some(
        (segment) =>
          segment === ".." || segment.includes("/") || segment.includes("\\"),
      )
    ) {
      throw new BoundaryValidationError(
        path,
        "a relative path inside the map bundle",
      );
    }
  } catch (error) {
    if (error instanceof BoundaryValidationError) throw error;
    throw new BoundaryValidationError(
      path,
      "a valid relative path inside the map bundle",
    );
  }

  const bundleBase = new URL(".", manifestUrl);
  const resolved = new URL(relativePath, bundleBase);
  if (
    resolved.origin !== bundleBase.origin ||
    !resolved.pathname.startsWith(bundleBase.pathname)
  ) {
    throw new BoundaryValidationError(
      path,
      "a relative path inside the map bundle",
    );
  }
  return resolved.href;
}

function parseMapBundleArea(
  input: unknown,
  path: string,
  manifestUrl: URL,
): MapBundleAreaV1 {
  const value = record(input, path);
  return {
    id: nonEmptyText(value.id, `${path}.id`),
    mapId: nonEmptyText(value.mapId, `${path}.mapId`),
    name: nonEmptyText(value.name, `${path}.name`),
    prefixes: uniqueTextArray(value.prefixes, `${path}.prefixes`),
    labels: uniqueTextArray(value.labels, `${path}.labels`),
    mapFile: resolveBundlePath(value.mapFile, `${path}.mapFile`, manifestUrl),
    pointsFile: resolveBundlePath(
      value.pointsFile,
      `${path}.pointsFile`,
      manifestUrl,
    ),
    gridMetaFile: resolveBundlePath(
      value.gridMetaFile,
      `${path}.gridMetaFile`,
      manifestUrl,
    ),
    gridFile: resolveBundlePath(
      value.gridFile,
      `${path}.gridFile`,
      manifestUrl,
    ),
  };
}

/** Validate a v1 map manifest and resolve every asset path against its URL. */
export function parseMapBundleManifest(
  input: unknown,
  manifestHref: string,
): MapBundleManifestV1 {
  let manifestUrl: URL;
  try {
    manifestUrl = new URL(manifestHref);
  } catch {
    throw new BoundaryValidationError("map manifest URL", "an absolute URL");
  }
  const value = record(input, "map manifest");
  if (value.schemaVersion !== 1) {
    throw new BoundaryValidationError(
      "map manifest.schemaVersion",
      "the number 1",
    );
  }
  if (!Array.isArray(value.areas) || value.areas.length === 0) {
    throw new BoundaryValidationError(
      "map manifest.areas",
      "a non-empty array",
    );
  }

  const areas = value.areas.map((area, index) =>
    parseMapBundleArea(area, `map manifest.areas[${index}]`, manifestUrl),
  );
  const areaIds = new Set<string>();
  const mapIds = new Set<string>();
  areas.forEach((area, index) => {
    if (areaIds.has(area.id)) {
      throw new BoundaryValidationError(
        `map manifest.areas[${index}].id`,
        "a unique area id",
      );
    }
    if (mapIds.has(area.mapId)) {
      throw new BoundaryValidationError(
        `map manifest.areas[${index}].mapId`,
        "a unique map id",
      );
    }
    areaIds.add(area.id);
    mapIds.add(area.mapId);
  });

  return {
    schemaVersion: 1,
    eventId: nonEmptyText(value.eventId, "map manifest.eventId"),
    displayName: nonEmptyText(value.displayName, "map manifest.displayName"),
    areas,
  };
}

function positiveNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new BoundaryValidationError(path, "a positive finite number");
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BoundaryValidationError(path, "a non-negative integer");
  }
  return value;
}

function nonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new BoundaryValidationError(path, "a non-negative finite number");
  }
  return value;
}

export function parseGasSheetListResponse(
  input: unknown,
): GasSheetListResponse {
  const value = record(input, "GAS sheet-list response");
  if (!Array.isArray(value.sheets)) {
    throw new BoundaryValidationError(
      "GAS sheet-list response.sheets",
      "an array of strings",
    );
  }
  return {
    sheets: value.sheets.map((sheet, index) =>
      text(sheet, `GAS sheet-list response.sheets[${index}]`),
    ),
    spreadsheetTitle: text(
      value.spreadsheetTitle,
      "GAS sheet-list response.spreadsheetTitle",
      "",
    ),
  };
}

function parseCircle(input: unknown, path: string): Circle {
  const value = record(input, path);
  const circle: Circle = {
    ...value,
    space: text(value.space, `${path}.space`),
  };
  if (value.account !== undefined)
    circle.account = text(value.account, `${path}.account`);
  if (value.tweet !== undefined)
    circle.tweet = text(value.tweet, `${path}.tweet`);
  if (value.sheetName !== undefined)
    circle.sheetName = text(value.sheetName, `${path}.sheetName`);
  return circle;
}

export function parseGasCircleResponse(input: unknown): GasCircleResponse {
  const value = record(input, "GAS circle response");
  if (!Array.isArray(value.wantToBuy)) {
    throw new BoundaryValidationError(
      "GAS circle response.wantToBuy",
      "an array",
    );
  }
  return {
    wantToBuy: value.wantToBuy.map((circle, index) =>
      parseCircle(circle, `GAS circle response.wantToBuy[${index}]`),
    ),
    spreadsheetTitle: text(
      value.spreadsheetTitle,
      "GAS circle response.spreadsheetTitle",
      "",
    ),
  };
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
    throw new BoundaryValidationError(`${path}.portals`, "an array");
  }
  const number = value.number;
  if (typeof number !== "string" && typeof number !== "number") {
    throw new BoundaryValidationError(`${path}.number`, "a string or number");
  }
  return {
    identifier: text(value.identifier, `${path}.identifier`),
    number,
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
    throw new BoundaryValidationError("points payload.points", "an array");
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
      if (candidate.identifier === null || candidate.identifier === undefined)
        return [];
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
