import type {
  CircleRecord,
  CircleStateOverrides,
  CircleVisitState,
  CsvDataSource,
  DataSource,
  GasDataSource,
  GasOutboxEntry,
  LocalEventDayState,
} from "../features/event-day/domain/application-contract-types";
import {
  parseDayId,
  parseEventId,
  parseSourceGeneration,
} from "../features/event-day/infrastructure/application-boundary-parsers";
import { canonicalizeSpace } from "../shared/domain/space-parser";

export class StorageSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageSchemaError";
    Object.setPrototypeOf(this, StorageSchemaError.prototype);
  }
}

export function getCircleVisitState(
  overrides: CircleStateOverrides,
  space: string,
): CircleVisitState {
  if (overrides[space]) return overrides[space];
  const key = canonicalizeSpace(space);
  if (!key) return "pending";
  // ponytail: linear scan keeps legacy raw keys readable; normalize storage on a future schema migration.
  for (const [storedSpace, state] of Object.entries(overrides)) {
    if (canonicalizeSpace(storedSpace) === key) return state;
  }
  return "pending";
}

export function transitionCircleVisitState(
  current: CircleVisitState,
  requested: CircleVisitState,
): CircleVisitState {
  if (current === requested) {
    return current;
  }

  const allowed: Record<CircleVisitState, readonly CircleVisitState[]> = {
    pending: ["held", "purchased", "excluded"],
    held: ["pending", "purchased", "excluded"],
    purchased: ["pending"],
    excluded: ["pending"],
  };

  if (!allowed[current].includes(requested)) {
    throw new StorageSchemaError(
      `Invalid circle state transition from '${current}' to '${requested}'`,
    );
  }

  return requested;
}

const ISO_8601_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function isIso8601(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!ISO_8601_REGEX.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function deepCloneAndFreeze<T>(val: T): T {
  if (val === null || typeof val !== "object") {
    return val;
  }

  if (Array.isArray(val)) {
    const clone = val.map((item) => deepCloneAndFreeze(item)) as unknown as T;
    return Object.freeze(clone);
  }

  const obj = val as Record<string, unknown>;
  const clone = {} as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    clone[key] = deepCloneAndFreeze(obj[key]);
  }
  return Object.freeze(clone as unknown as T);
}

export function createEmptyEventDayState(
  source: DataSource,
  generation: string,
  now: string,
): LocalEventDayState {
  if (!isIso8601(now)) {
    throw new StorageSchemaError(`Invalid timestamp: ${now}`);
  }

  // Validate generation format
  try {
    parseSourceGeneration(generation);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new StorageSchemaError(`Invalid source generation: ${msg}`);
  }

  // Validate source structure briefly
  if (!source || typeof source !== "object") {
    throw new StorageSchemaError("Invalid source object");
  }
  if (source.type === "csv") {
    const csvSource = source as CsvDataSource;
    if (typeof csvSource.fileName !== "string" || !csvSource.fileName) {
      throw new StorageSchemaError("CSV source must have fileName");
    }
  } else if (source.type === "gas") {
    const gasSource = source as GasDataSource;
    if (typeof gasSource.gasUrl !== "string" || !gasSource.gasUrl) {
      throw new StorageSchemaError("GAS source must have gasUrl");
    }
    if (typeof gasSource.sheetName !== "string" || !gasSource.sheetName) {
      throw new StorageSchemaError("GAS source must have sheetName");
    }
  } else {
    const invalidSource = source as { type: unknown };
    throw new StorageSchemaError(`Unknown source type: ${invalidSource.type}`);
  }

  const state: LocalEventDayState = {
    schemaVersion: 2,
    source,
    sourceGeneration: generation,
    circles: [],
    circleStates: {},
    gasOutbox: [],
    timestamps: {
      createdAt: now,
      updatedAt: now,
      sourceUpdatedAt: now,
    },
  };

  return deepCloneAndFreeze(state);
}

export function parseLocalEventDayState(value: unknown): LocalEventDayState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StorageSchemaError("State must be an object");
  }

  const raw = value as Record<string, unknown>;

  // 1. schemaVersion
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2) {
    throw new StorageSchemaError(
      `Expected schemaVersion to be 1 or 2, got ${raw.schemaVersion}`,
    );
  }

  // 2. sourceGeneration
  let sourceGen: string;
  try {
    sourceGen = parseSourceGeneration(raw.sourceGeneration, "sourceGeneration");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new StorageSchemaError(`Invalid sourceGeneration: ${msg}`);
  }

  // 3. source
  const rawSource = raw.source;
  if (!rawSource || typeof rawSource !== "object" || Array.isArray(rawSource)) {
    throw new StorageSchemaError("source must be an object");
  }
  const source = rawSource as Record<string, unknown>;
  const sourceType = source.type;
  if (sourceType === "csv") {
    if (typeof source.fileName !== "string" || !source.fileName) {
      throw new StorageSchemaError("CSV source must have a non-empty fileName");
    }
    const extraKeys = Object.keys(source).filter(
      (k) => k !== "type" && k !== "fileName",
    );
    if (extraKeys.length > 0) {
      throw new StorageSchemaError(
        `CSV source contains invalid fields: ${extraKeys.join(", ")}`,
      );
    }
  } else if (sourceType === "gas") {
    if (typeof source.gasUrl !== "string" || !source.gasUrl) {
      throw new StorageSchemaError("GAS source must have a non-empty gasUrl");
    }
    if (typeof source.sheetName !== "string" || !source.sheetName) {
      throw new StorageSchemaError(
        "GAS source must have a non-empty sheetName",
      );
    }
    const extraKeys = Object.keys(source).filter(
      (k) => k !== "type" && k !== "gasUrl" && k !== "sheetName",
    );
    if (extraKeys.length > 0) {
      throw new StorageSchemaError(
        `GAS source contains invalid fields: ${extraKeys.join(", ")}`,
      );
    }
  } else {
    throw new StorageSchemaError(`Invalid source type: ${sourceType}`);
  }

  // 4. circles
  const rawCircles = raw.circles;
  if (!Array.isArray(rawCircles)) {
    throw new StorageSchemaError("circles must be an array");
  }
  const circleSpaces = new Set<string>();
  const parsedCircles: CircleRecord[] = [];
  for (let i = 0; i < rawCircles.length; i++) {
    const c = rawCircles[i];
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      throw new StorageSchemaError(`circles[${i}] must be an object`);
    }
    const circleObj = c as Record<string, unknown>;
    if (typeof circleObj.space !== "string" || !circleObj.space) {
      throw new StorageSchemaError(
        `circles[${i}].space must be a non-empty string`,
      );
    }
    if (circleSpaces.has(circleObj.space)) {
      throw new StorageSchemaError(
        `Duplicate circle space detected: ${circleObj.space}`,
      );
    }
    circleSpaces.add(circleObj.space);

    const record: {
      space: string;
      priority?: number;
      account?: string;
      tweet?: string;
      memo?: string;
      isSale?: string;
      removedFromSource?: boolean;
    } = { space: circleObj.space };

    if (circleObj.priority !== undefined) {
      if (
        typeof circleObj.priority !== "number" ||
        !Number.isFinite(circleObj.priority)
      ) {
        throw new StorageSchemaError(`circles[${i}].priority must be a number`);
      }
      record.priority = circleObj.priority;
    }
    if (circleObj.account !== undefined) {
      if (typeof circleObj.account !== "string") {
        throw new StorageSchemaError(`circles[${i}].account must be a string`);
      }
      record.account = circleObj.account;
    }
    if (circleObj.tweet !== undefined) {
      if (typeof circleObj.tweet !== "string") {
        throw new StorageSchemaError(`circles[${i}].tweet must be a string`);
      }
      record.tweet = circleObj.tweet;
    }
    if (circleObj.memo !== undefined) {
      if (typeof circleObj.memo !== "string") {
        throw new StorageSchemaError(`circles[${i}].memo must be a string`);
      }
      record.memo = circleObj.memo;
    }
    if (circleObj.isSale !== undefined) {
      if (typeof circleObj.isSale !== "string") {
        throw new StorageSchemaError(`circles[${i}].isSale must be a string`);
      }
      record.isSale = circleObj.isSale;
    }
    if (circleObj.removedFromSource !== undefined) {
      if (typeof circleObj.removedFromSource !== "boolean") {
        throw new StorageSchemaError(
          `circles[${i}].removedFromSource must be a boolean`,
        );
      }
      record.removedFromSource = circleObj.removedFromSource;
    }
    parsedCircles.push(Object.freeze(record));
  }

  const isCsvEmptySentinel =
    source.type === "csv" && source.fileName === "empty.csv";

  // 5. circleStates (and v1 migration)
  const circleStates: Record<string, Exclude<CircleVisitState, "pending">> = {};

  if (raw.schemaVersion === 1) {
    // Migration from v1
    const rawPurchased = raw.purchased;
    if (!Array.isArray(rawPurchased)) {
      throw new StorageSchemaError("purchased must be an array");
    }
    const purchasedSpaces = new Set<string>();
    for (let i = 0; i < rawPurchased.length; i++) {
      const p = rawPurchased[i];
      if (typeof p !== "string" || !p) {
        throw new StorageSchemaError(
          `purchased[${i}] must be a non-empty string`,
        );
      }
      if (purchasedSpaces.has(p)) {
        throw new StorageSchemaError(
          `Duplicate purchased space detected: ${p}`,
        );
      }
      if (!isCsvEmptySentinel && !circleSpaces.has(p)) {
        throw new StorageSchemaError(
          `purchased[${i}] references space not in circle list: ${p}`,
        );
      }
      purchasedSpaces.add(p);
    }

    const rawHold = raw.hold;
    if (!Array.isArray(rawHold)) {
      throw new StorageSchemaError("hold must be an array");
    }
    const holdSpaces = new Set<string>();
    for (let i = 0; i < rawHold.length; i++) {
      const h = rawHold[i];
      if (typeof h !== "string" || !h) {
        throw new StorageSchemaError(`hold[${i}] must be a non-empty string`);
      }
      if (holdSpaces.has(h)) {
        throw new StorageSchemaError(`Duplicate hold space detected: ${h}`);
      }
      if (!isCsvEmptySentinel && !circleSpaces.has(h)) {
        throw new StorageSchemaError(
          `hold[${i}] references space not in circle list: ${h}`,
        );
      }
      holdSpaces.add(h);
    }

    // Validate history & redo structure to ensure malformed v1 fails schema parse
    if (!Array.isArray(raw.history)) {
      throw new StorageSchemaError("history must be an array");
    }
    if (!Array.isArray(raw.redo)) {
      throw new StorageSchemaError("redo must be an array");
    }

    const validateHistoryEntry = (
      entry: unknown,
      index: number,
      arrayName: string,
    ): void => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new StorageSchemaError(
          `${arrayName}[${index}] must be an object`,
        );
      }
      const entryObj = entry as Record<string, unknown>;
      if (
        entryObj.type !== "purchase" &&
        entryObj.type !== "hold" &&
        entryObj.type !== "unpurchase" &&
        entryObj.type !== "unhold"
      ) {
        throw new StorageSchemaError(
          `${arrayName}[${index}].type must be purchase, hold, unpurchase, or unhold`,
        );
      }
      if (typeof entryObj.space !== "string" || !entryObj.space) {
        throw new StorageSchemaError(
          `${arrayName}[${index}].space must be a non-empty string`,
        );
      }
      if (!isCsvEmptySentinel && !circleSpaces.has(entryObj.space)) {
        throw new StorageSchemaError(
          `${arrayName}[${index}].space references space not in circle list: ${entryObj.space}`,
        );
      }
      if (!isIso8601(entryObj.timestamp)) {
        throw new StorageSchemaError(
          `${arrayName}[${index}].timestamp must be a valid ISO 8601 string`,
        );
      }
    };

    raw.history.forEach((entry, index) => {
      validateHistoryEntry(entry, index, "history");
    });
    raw.redo.forEach((entry, index) => {
      validateHistoryEntry(entry, index, "redo");
    });

    // Build migrated circleStates: purchased takes priority over hold
    for (const space of purchasedSpaces) {
      circleStates[space] = "purchased";
    }
    for (const space of holdSpaces) {
      if (!circleStates[space]) {
        circleStates[space] = "held";
      }
    }
  } else {
    // Schema version 2 parsing
    const rawCircleStates = raw.circleStates;
    if (
      !rawCircleStates ||
      typeof rawCircleStates !== "object" ||
      Array.isArray(rawCircleStates)
    ) {
      throw new StorageSchemaError("circleStates must be an object");
    }

    const stateEntries = Object.entries(
      rawCircleStates as Record<string, unknown>,
    );
    for (const [space, stateVal] of stateEntries) {
      if (!isCsvEmptySentinel && !circleSpaces.has(space)) {
        throw new StorageSchemaError(
          `circleStates references space not in circle list: ${space}`,
        );
      }
      if (
        stateVal !== "held" &&
        stateVal !== "purchased" &&
        stateVal !== "excluded"
      ) {
        throw new StorageSchemaError(
          `Invalid state '${stateVal}' for space '${space}' in circleStates`,
        );
      }
      circleStates[space] = stateVal;
    }
  }

  // 6. gasOutbox
  const rawOutbox = raw.gasOutbox;
  if (!Array.isArray(rawOutbox)) {
    throw new StorageSchemaError("gasOutbox must be an array");
  }
  const parsedOutbox: GasOutboxEntry[] = [];
  const outboxIds = new Set<string>();
  for (let i = 0; i < rawOutbox.length; i++) {
    const entry = rawOutbox[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new StorageSchemaError(`gasOutbox[${i}] must be an object`);
    }
    const entryObj = entry as Record<string, unknown>;
    if (typeof entryObj.id !== "string" || !entryObj.id) {
      throw new StorageSchemaError(
        `gasOutbox[${i}].id must be a non-empty string`,
      );
    }
    if (outboxIds.has(entryObj.id)) {
      throw new StorageSchemaError(`gasOutbox[${i}].id must be unique`);
    }
    outboxIds.add(entryObj.id);
    try {
      parseEventId(entryObj.eventId, `gasOutbox[${i}].eventId`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new StorageSchemaError(`Invalid gasOutbox[${i}].eventId: ${msg}`);
    }
    try {
      parseDayId(entryObj.dayId, `gasOutbox[${i}].dayId`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new StorageSchemaError(`Invalid gasOutbox[${i}].dayId: ${msg}`);
    }
    try {
      parseSourceGeneration(
        entryObj.sourceGeneration,
        `gasOutbox[${i}].sourceGeneration`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new StorageSchemaError(
        `Invalid gasOutbox[${i}].sourceGeneration: ${msg}`,
      );
    }
    if (entryObj.sourceGeneration !== sourceGen) {
      throw new StorageSchemaError(
        `gasOutbox[${i}].sourceGeneration mismatched with state sourceGeneration`,
      );
    }
    if (typeof entryObj.gasUrl !== "string" || !entryObj.gasUrl) {
      throw new StorageSchemaError(
        `gasOutbox[${i}].gasUrl must be a non-empty string`,
      );
    }
    if (typeof entryObj.sheetName !== "string" || !entryObj.sheetName) {
      throw new StorageSchemaError(
        `gasOutbox[${i}].sheetName must be a non-empty string`,
      );
    }
    if (typeof entryObj.space !== "string" || !entryObj.space) {
      throw new StorageSchemaError(
        `gasOutbox[${i}].space must be a non-empty string`,
      );
    }
    if (typeof entryObj.purchased !== "boolean") {
      throw new StorageSchemaError(
        `gasOutbox[${i}].purchased must be a boolean`,
      );
    }
    if (!isIso8601(entryObj.createdAt)) {
      throw new StorageSchemaError(
        `gasOutbox[${i}].createdAt must be a valid ISO 8601 string`,
      );
    }
    if (
      typeof entryObj.attempts !== "number" ||
      !Number.isInteger(entryObj.attempts) ||
      entryObj.attempts < 0
    ) {
      throw new StorageSchemaError(
        `gasOutbox[${i}].attempts must be a non-negative integer`,
      );
    }
    if (entryObj.lastError !== null && typeof entryObj.lastError !== "string") {
      throw new StorageSchemaError(
        `gasOutbox[${i}].lastError must be a string or null`,
      );
    }
    parsedOutbox.push(
      Object.freeze({
        id: entryObj.id,
        eventId: entryObj.eventId as string,
        dayId: entryObj.dayId as string,
        sourceGeneration: entryObj.sourceGeneration as string,
        gasUrl: entryObj.gasUrl,
        sheetName: entryObj.sheetName,
        space: entryObj.space,
        purchased: entryObj.purchased,
        createdAt: entryObj.createdAt,
        attempts: entryObj.attempts,
        lastError: entryObj.lastError,
      }),
    );
  }

  // 7. timestamps
  const rawTimestamps = raw.timestamps;
  if (
    !rawTimestamps ||
    typeof rawTimestamps !== "object" ||
    Array.isArray(rawTimestamps)
  ) {
    throw new StorageSchemaError("timestamps must be an object");
  }
  const timestamps = rawTimestamps as Record<string, unknown>;
  if (!isIso8601(timestamps.createdAt)) {
    throw new StorageSchemaError(
      "timestamps.createdAt must be a valid ISO 8601 string",
    );
  }
  if (!isIso8601(timestamps.updatedAt)) {
    throw new StorageSchemaError(
      "timestamps.updatedAt must be a valid ISO 8601 string",
    );
  }
  if (!isIso8601(timestamps.sourceUpdatedAt)) {
    throw new StorageSchemaError(
      "timestamps.sourceUpdatedAt must be a valid ISO 8601 string",
    );
  }

  const state: LocalEventDayState = {
    schemaVersion: 2,
    source: rawSource as DataSource,
    sourceGeneration: sourceGen,
    circles: parsedCircles,
    circleStates: Object.freeze(circleStates),
    gasOutbox: parsedOutbox,
    timestamps: {
      createdAt: timestamps.createdAt as string,
      updatedAt: timestamps.updatedAt as string,
      sourceUpdatedAt: timestamps.sourceUpdatedAt as string,
    },
  };

  return deepCloneAndFreeze(state);
}
