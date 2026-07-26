import type {
  Circle,
  EventDay,
  EventMapAreaManifest,
  EventMapBundleManifest,
  EventRegistryEntryV1,
  EventRegistryV1,
  GasCircleResponse,
  GasSheetListResponse,
  GridMeta,
  MapAssetPaths,
  MapBundleAreaV1,
  MapBundleManifestV1,
  OcrPoint,
  OcrPortal,
  PointsPayload,
} from "./domain";

export class BoundaryValidationError extends Error {
  readonly path: string;
  constructor(path: string, expectation: string) {
    super(`${path}: expected ${expectation}`);
    this.name = "BoundaryValidationError";
    this.path = path;
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

function nonEmptyExactText(value: unknown, path: string): string {
  const parsed = text(value, path);
  if (!parsed || parsed.trim() !== parsed) {
    throw new BoundaryValidationError(
      path,
      "a non-empty string without surrounding whitespace",
    );
  }
  return parsed;
}

export function parseEventId(value: unknown, path = "eventId"): string {
  if (typeof value !== "string") {
    throw new BoundaryValidationError(path, "a string");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new BoundaryValidationError(
      path,
      "a valid event identifier (1-64 alphanumeric, dash, or underscore characters starting with alphanumeric)",
    );
  }
  return value;
}

export function parseDayId(value: unknown, path = "dayId"): string {
  if (typeof value !== "string") {
    throw new BoundaryValidationError(path, "a string");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new BoundaryValidationError(
      path,
      "a valid day identifier (1-64 alphanumeric, dash, or underscore characters starting with alphanumeric)",
    );
  }
  return value;
}

export function parseSourceGeneration(
  value: unknown,
  path = "sourceGeneration",
): string {
  if (typeof value !== "string") {
    throw new BoundaryValidationError(path, "a string");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new BoundaryValidationError(
      path,
      "a valid source generation identifier (1-64 alphanumeric, dash, or underscore characters starting with alphanumeric)",
    );
  }
  return value;
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
    eventId: parseEventId(value.eventId, "map manifest.eventId"),
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

function gasSuccessEnvelope(
  input: unknown,
  path: string,
): Record<string, unknown> {
  const value = record(input, path);
  if (value.ok !== true) {
    throw new BoundaryValidationError(`${path}.ok`, "the boolean true");
  }
  if (value.status !== "success") {
    throw new BoundaryValidationError(`${path}.status`, 'the string "success"');
  }
  return value;
}

export function parseGasSheetListResponse(
  input: unknown,
): GasSheetListResponse {
  const value = gasSuccessEnvelope(input, "GAS sheet-list response");
  if (!Array.isArray(value.sheets)) {
    throw new BoundaryValidationError(
      "GAS sheet-list response.sheets",
      "an array of strings",
    );
  }
  const sheets = value.sheets.map((sheet, index) => {
    const s = text(sheet, `GAS sheet-list response.sheets[${index}]`);
    if (!s.trim()) {
      throw new BoundaryValidationError(
        `GAS sheet-list response.sheets[${index}]`,
        "a non-empty string",
      );
    }
    return s;
  });
  return {
    sheets,
    spreadsheetTitle: nonEmptyText(
      value.spreadsheetTitle,
      "GAS sheet-list response.spreadsheetTitle",
    ),
  };
}

function parseCircle(input: unknown, path: string): Circle {
  const value = record(input, path);
  const space = text(value.space, `${path}.space`).trim();
  if (!space) {
    throw new BoundaryValidationError(`${path}.space`, "a non-empty string");
  }
  const circle: Circle = {
    ...value,
    space,
  };
  if (value.priority !== undefined && value.priority !== null) {
    if (typeof value.priority === "number") {
      if (!Number.isFinite(value.priority)) {
        throw new BoundaryValidationError(
          `${path}.priority`,
          "a finite number",
        );
      }
    } else if (typeof value.priority === "string") {
      const num = Number(value.priority);
      if (Number.isNaN(num) || !Number.isFinite(num)) {
        throw new BoundaryValidationError(
          `${path}.priority`,
          "a finite number string",
        );
      }
    } else {
      throw new BoundaryValidationError(
        `${path}.priority`,
        "a number or string",
      );
    }
  }
  if (value.account !== undefined)
    circle.account = text(value.account, `${path}.account`);
  if (value.tweet !== undefined)
    circle.tweet = text(value.tweet, `${path}.tweet`);
  if (value.sheetName !== undefined)
    circle.sheetName = text(value.sheetName, `${path}.sheetName`);
  return circle;
}

export function parseGasCircleResponse(input: unknown): GasCircleResponse {
  const value = gasSuccessEnvelope(input, "GAS circle response");
  if (!Array.isArray(value.circles)) {
    throw new BoundaryValidationError(
      "GAS circle response.circles",
      "an array",
    );
  }
  const seenSpaces = new Set<string>();
  const parsedCircles = value.circles.map((circle, index) => {
    const parsed = parseCircle(circle, `GAS circle response.circles[${index}]`);
    if (seenSpaces.has(parsed.space)) {
      throw new BoundaryValidationError(
        `GAS circle response.circles[${index}].space`,
        `a unique space identifier (duplicate '${parsed.space}' found)`,
      );
    }
    seenSpaces.add(parsed.space);
    return parsed;
  });
  return {
    circles: parsedCircles,
    spreadsheetTitle: nonEmptyText(
      value.spreadsheetTitle,
      "GAS circle response.spreadsheetTitle",
    ),
  };
}

/** Validate the success envelope returned by a GAS sale update. */
export function parseGasSaleResponse(input: unknown): void {
  gasSuccessEnvelope(input, "GAS sale response");
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

function validateMapBundlePath(value: unknown, path: string): string {
  const relativePath = nonEmptyText(value, path);
  if (
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    relativePath.includes("?") ||
    relativePath.includes("#") ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(relativePath)
  ) {
    throw new BoundaryValidationError(path, "a safe relative path");
  }

  if (!relativePath.startsWith("../maps/")) {
    throw new BoundaryValidationError(
      path,
      "a relative path starting with '../maps/'",
    );
  }

  const segments = relativePath.split("/");
  for (let i = 2; i < segments.length; i++) {
    if (segments[i] === "..") {
      throw new BoundaryValidationError(
        path,
        "a safe relative path within maps directory",
      );
    }
  }

  return relativePath;
}

export function parseEventRegistry(input: unknown): EventRegistryV1 {
  const value = record(input, "event registry");
  if (value.schemaVersion !== 1) {
    throw new BoundaryValidationError(
      "event registry.schemaVersion",
      "the number 1",
    );
  }
  if (!Array.isArray(value.events)) {
    throw new BoundaryValidationError("event registry.events", "an array");
  }

  const events: EventRegistryEntryV1[] = [];
  const eventIds = new Set<string>();

  for (let i = 0; i < value.events.length; i++) {
    const eventInput = value.events[i];
    const eventPath = `event registry.events[${i}]`;
    const eventObj = record(eventInput, eventPath);
    const eventId = parseEventId(eventObj.eventId, `${eventPath}.eventId`);
    if (eventIds.has(eventId)) {
      throw new BoundaryValidationError(
        `${eventPath}.eventId`,
        "a unique eventId",
      );
    }
    eventIds.add(eventId);

    const displayName = nonEmptyText(
      eventObj.displayName,
      `${eventPath}.displayName`,
    );
    const mapBundle = validateMapBundlePath(
      eventObj.mapBundle,
      `${eventPath}.mapBundle`,
    );

    if (!Array.isArray(eventObj.days)) {
      throw new BoundaryValidationError(`${eventPath}.days`, "an array");
    }

    const days: EventDay[] = [];
    const dayIds = new Set<string>();
    for (let j = 0; j < eventObj.days.length; j++) {
      const dayInput = eventObj.days[j];
      const dayPath = `${eventPath}.days[${j}]`;
      const dayObj = record(dayInput, dayPath);
      const dayId = parseDayId(dayObj.dayId, `${dayPath}.dayId`);
      if (dayIds.has(dayId)) {
        throw new BoundaryValidationError(
          `${dayPath}.dayId`,
          "a unique dayId within the event",
        );
      }
      dayIds.add(dayId);

      const dayDisplayName = nonEmptyText(
        dayObj.displayName,
        `${dayPath}.displayName`,
      );
      days.push(
        Object.freeze({
          dayId,
          displayName: dayDisplayName,
        }),
      );
    }

    events.push(
      Object.freeze({
        eventId,
        displayName,
        mapBundle,
        days: Object.freeze(days),
      }),
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    events: Object.freeze(events),
  });
}

function parseBundleAssetPath(
  value: unknown,
  path: string,
  expectedAreaId: string,
  expectedFileName: string,
): string {
  const relativePath = nonEmptyExactText(value, path);
  if (
    !relativePath.startsWith("./") ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    relativePath.includes("?") ||
    relativePath.includes("#") ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(relativePath)
  ) {
    throw new BoundaryValidationError(
      path,
      `a safe relative asset path: ${expectedFileName}`,
    );
  }

  const normalized = relativePath.slice(2);

  const segments = normalized.split("/");
  if (
    segments.length !== 2 ||
    segments[0] !== expectedAreaId ||
    segments[1] !== expectedFileName
  ) {
    throw new BoundaryValidationError(
      path,
      `a path matching ./${expectedAreaId}/${expectedFileName}`,
    );
  }

  return relativePath;
}

/** Validate the strict four-area manifest used by the C108 map bundle. */
export function parseEventMapBundleManifest(
  input: unknown,
): EventMapBundleManifest {
  const value = record(input, "map bundle manifest");
  if (value.schemaVersion !== 1) {
    throw new BoundaryValidationError(
      "map bundle manifest.schemaVersion",
      "the number 1",
    );
  }

  const eventId = parseEventId(value.eventId, "map bundle manifest.eventId");
  const bundleVersion = nonEmptyText(
    value.bundleVersion,
    "map bundle manifest.bundleVersion",
  );

  if (!Array.isArray(value.areas) || value.areas.length !== 4) {
    throw new BoundaryValidationError(
      "map bundle manifest.areas",
      "an array containing exactly four entries",
    );
  }

  const seenAreaIds = new Set<string>();
  const areas: EventMapAreaManifest[] = [];

  for (let i = 0; i < value.areas.length; i++) {
    const areaPath = `map bundle manifest.areas[${i}]`;
    const areaObj = record(value.areas[i], areaPath);

    const areaId = nonEmptyExactText(areaObj.areaId, `${areaPath}.areaId`);
    if (!/^[a-z0-9-]+$/.test(areaId)) {
      throw new BoundaryValidationError(
        `${areaPath}.areaId`,
        "a valid areaId (lowercase ASCII alphanumeric and hyphens)",
      );
    }

    if (seenAreaIds.has(areaId)) {
      throw new BoundaryValidationError(
        `${areaPath}.areaId`,
        `a unique areaId (duplicate '${areaId}')`,
      );
    }
    seenAreaIds.add(areaId);

    const displayName = nonEmptyText(
      areaObj.displayName,
      `${areaPath}.displayName`,
    );
    const assetsObj = record(areaObj.assets, `${areaPath}.assets`);

    const assets: MapAssetPaths = Object.freeze({
      svg: parseBundleAssetPath(
        assetsObj.svg,
        `${areaPath}.assets.svg`,
        areaId,
        "map.svg",
      ),
      points: parseBundleAssetPath(
        assetsObj.points,
        `${areaPath}.assets.points`,
        areaId,
        "points.json",
      ),
      gridMeta: parseBundleAssetPath(
        assetsObj.gridMeta,
        `${areaPath}.assets.gridMeta`,
        areaId,
        "grid-meta.json",
      ),
      grid: parseBundleAssetPath(
        assetsObj.grid,
        `${areaPath}.assets.grid`,
        areaId,
        "grid.bin",
      ),
    });

    areas.push(
      Object.freeze({
        areaId,
        displayName,
        assets,
      }),
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    eventId,
    bundleVersion,
    areas: Object.freeze(areas),
  });
}
