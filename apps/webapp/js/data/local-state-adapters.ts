import type {
  ActionType,
  Circle,
  CircleRecord,
  HistoryEntry,
} from "../features/event-day/domain/application-contract-types";
import { StorageService } from "../state/storage-service";
import {
  normalizeRouteMotionPreference,
  type RouteMotionPreference,
} from "../features/route-guidance/ui/route-motion-preference";

const ROUTE_MOTION_PREFERENCE_KEY = "meirochou.route-motion-preference";

const FIRST_USE_GUIDE_SEEN_KEY = "meirochou.first-use-guide-seen";

interface FirstUseGuideStorage {
  getString(key: string, fallback?: string): string;
  setString(key: string, value: string): void;
}

interface RouteMotionPreferenceStorage {
  getString(key: string, fallback?: string): string;
  setString(key: string, value: string): void;
}

export interface DecodeResult<T> {
  readonly value: T;
  readonly issues: readonly string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(
  value: unknown,
  path: string,
  issues: string[],
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    issues.push(`${path} must be a string`);
    return undefined;
  }
  return value;
}

/** Convert a stored circle record into the shape consumed by the map UI. */
export function circleRecordToCircle(record: CircleRecord): Circle {
  return {
    space: record.space,
    priority: record.priority,
    isSale: record.isSale ?? "",
    account: record.account,
    tweet: record.tweet,
    memo: record.memo,
  };
}

/** Decode legacy circle rows without allowing malformed rows into state. */
export function decodeLegacyCircles(
  value: unknown,
): DecodeResult<CircleRecord[]> {
  const issues: string[] = [];
  if (!Array.isArray(value)) {
    return { value: [], issues: ["legacy circles must be an array"] };
  }

  const circles: CircleRecord[] = [];
  const spaces = new Set<string>();
  value.forEach((item, index) => {
    const row = asRecord(item);
    if (!row || typeof row.space !== "string" || !row.space.trim()) {
      issues.push(`legacy circles[${index}].space must be a non-empty string`);
      return;
    }
    const space = row.space.trim();
    if (spaces.has(space)) {
      issues.push(`legacy circles[${index}] duplicates ${space}`);
      return;
    }

    let priority: number | undefined;
    if (row.priority !== undefined && row.priority !== "") {
      if (typeof row.priority === "number" && Number.isFinite(row.priority)) {
        priority = row.priority;
      } else if (typeof row.priority === "string" && row.priority.trim()) {
        const parsed = Number(row.priority);
        if (Number.isFinite(parsed)) priority = parsed;
        else issues.push(`legacy circles[${index}].priority must be a number`);
      } else {
        issues.push(`legacy circles[${index}].priority must be a number`);
      }
    }

    const account = optionalText(
      row.account,
      `legacy circles[${index}].account`,
      issues,
    );
    const tweet = optionalText(
      row.tweet,
      `legacy circles[${index}].tweet`,
      issues,
    );
    const memo = optionalText(
      row.memo,
      `legacy circles[${index}].memo`,
      issues,
    );
    const isSale = optionalText(
      row.isSale,
      `legacy circles[${index}].isSale`,
      issues,
    );
    if (issues.some((issue) => issue.startsWith(`legacy circles[${index}]`)))
      return;

    circles.push({ space, priority, account, tweet, memo, isSale });
    spaces.add(space);
  });

  return { value: circles, issues };
}

/** Decode a legacy string list and report malformed or duplicate entries. */
export function decodeLegacyStringList(
  value: unknown,
  name: string,
): DecodeResult<string[]> {
  const issues: string[] = [];
  if (!Array.isArray(value))
    return { value: [], issues: [`${name} must be an array`] };
  const result: string[] = [];
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      issues.push(`${name}[${index}] must be a non-empty string`);
      return;
    }
    const space = item.trim();
    if (seen.has(space)) {
      issues.push(`${name}[${index}] duplicates ${space}`);
      return;
    }
    seen.add(space);
    result.push(space);
  });
  return { value: result, issues };
}

/** Decode legacy history rows, filling the timestamp only when the old format omitted it. */
export function decodeLegacyHistory(
  value: unknown,
  name: string,
  fallbackTimestamp: string,
): DecodeResult<HistoryEntry[]> {
  const issues: string[] = [];
  if (!Array.isArray(value))
    return { value: [], issues: [`${name} must be an array`] };
  const result: HistoryEntry[] = [];
  value.forEach((item, index) => {
    const row = asRecord(item);
    if (!row) {
      issues.push(`${name}[${index}] must contain purchase/hold and a space`);
      return;
    }
    const type = row.type;
    const space = row.space;
    if (
      (type !== "purchase" && type !== "hold") ||
      typeof space !== "string" ||
      !space.trim()
    ) {
      issues.push(`${name}[${index}] must contain purchase/hold and a space`);
      return;
    }
    const timestamp = row.timestamp;
    if (timestamp !== undefined && typeof timestamp !== "string") {
      issues.push(`${name}[${index}].timestamp must be a string`);
      return;
    }
    result.push({
      type: type as ActionType,
      space: space.trim(),
      timestamp: timestamp || fallbackTimestamp,
    });
  });
  return { value: result, issues };
}

/** Extract the old `wantToBuy` array while keeping all legacy access explicit. */
export function extractLegacyCircleRows(value: unknown): DecodeResult<unknown> {
  if (Array.isArray(value)) return { value, issues: [] };
  const record = asRecord(value);
  if (record && Array.isArray(record.wantToBuy)) {
    return { value: record.wantToBuy, issues: [] };
  }
  return {
    value: [],
    issues: ["legacy comiketData.wantToBuy must be an array"],
  };
}

export function readRouteMotionPreference(
  storage: RouteMotionPreferenceStorage = new StorageService(),
): RouteMotionPreference {
  try {
    return normalizeRouteMotionPreference(
      storage.getString(ROUTE_MOTION_PREFERENCE_KEY, "system"),
    );
  } catch {
    return "system";
  }
}

export function writeRouteMotionPreference(
  value: RouteMotionPreference,
  storage: RouteMotionPreferenceStorage = new StorageService(),
): void {
  try {
    storage.setString(
      ROUTE_MOTION_PREFERENCE_KEY,
      normalizeRouteMotionPreference(value),
    );
  } catch {
    // Storage failures must not prevent route guidance from starting.
  }
}

export function readFirstUseGuideSeen(
  storage: FirstUseGuideStorage = new StorageService(),
): boolean {
  try {
    return storage.getString(FIRST_USE_GUIDE_SEEN_KEY, "") === "1";
  } catch {
    return true;
  }
}

export function markFirstUseGuideSeen(
  storage: FirstUseGuideStorage = new StorageService(),
): void {
  try {
    storage.setString(FIRST_USE_GUIDE_SEEN_KEY, "1");
  } catch {
    // First-use UI persistence must never block application startup.
  }
}
