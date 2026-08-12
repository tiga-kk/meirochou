import { canonicalizeSpace } from "../../../shared/domain/space-parser";
import type {
  CircleRecord,
  LocalEventDayState,
} from "../../event-day/public-api";
import type { SourceDiff } from "./circle-data-source-types";

function spaceKey(space: string): string {
  return canonicalizeSpace(space) ?? space;
}

/**
 * Calculates a pure diff between current active circles and incoming new ones.
 * Circles that are currently marked with `removedFromSource: true` in current circles
 * are ignored from the active baseline, meaning they will be classified as "added"
 * if they reappear in the incoming source.
 */
export function diffCircleSources(
  current: readonly CircleRecord[],
  incoming: readonly CircleRecord[],
): SourceDiff {
  const activeCurrent = current.filter((c) => !c.removedFromSource);

  const activeCurrentMap = new Map<string, CircleRecord>(
    activeCurrent.map((c) => [spaceKey(c.space), c]),
  );
  const incomingMap = new Map<string, CircleRecord>(
    incoming.map((c) => [spaceKey(c.space), c]),
  );

  const added: CircleRecord[] = [];
  const updated: Array<{ before: CircleRecord; after: CircleRecord }> = [];
  const unchanged: CircleRecord[] = [];
  const removed: CircleRecord[] = [];

  // Determine added, updated, unchanged based on incoming order
  for (const inc of incoming) {
    const cur = activeCurrentMap.get(spaceKey(inc.space));
    if (!cur) {
      added.push({ ...inc });
    } else {
      const isUpdated =
        cur.priority !== inc.priority ||
        cur.isSale !== inc.isSale ||
        cur.account !== inc.account ||
        cur.tweet !== inc.tweet ||
        cur.memo !== inc.memo;

      if (isUpdated) {
        updated.push({
          before: { ...cur },
          after: { ...inc },
        });
      } else {
        unchanged.push({ ...inc });
      }
    }
  }

  // Determine removed based on current order (active only)
  for (const cur of activeCurrent) {
    if (!incomingMap.has(spaceKey(cur.space))) {
      removed.push({ ...cur });
    }
  }

  return deepFreeze({
    added,
    updated,
    removed,
    unchanged,
  });
}

/**
 * Merges incoming circles into the local state, updating timestamps and preserving
 * user data (purchased, hold, history, redo, gasOutbox).
 *
 * Incoming circles with isSale="x" or "X" will automatically be marked as purchased
 * and record a purchase history entry if not already purchased.
 * Missing circles from the incoming source are marked with `removedFromSource: true`.
 * Returns a deep frozen state.
 */
export function applySourceDiff(
  current: LocalEventDayState,
  incoming: readonly CircleRecord[],
  now: string,
): LocalEventDayState {
  const incomingSpaces = new Set(incoming.map((c) => spaceKey(c.space)));

  // Build the new circles array with stable order:
  // 1. Incoming circles
  // 2. Circles in current but not in incoming, flagged with removedFromSource: true
  const nextCircles: CircleRecord[] = incoming.map((c) => {
    // Ensure we strip removedFromSource if it was somehow present
    const { removedFromSource, ...rest } = c;
    return rest;
  });

  for (const cur of current.circles) {
    if (!incomingSpaces.has(spaceKey(cur.space))) {
      nextCircles.push({
        ...cur,
        removedFromSource: true,
      });
    }
  }

  // Preserve and merge circle states
  const nextCircleStates: Record<string, "purchased" | "held" | "excluded"> = {};
  const incomingSpaceByIdentity = new Map(
    incoming.map((circle) => [spaceKey(circle.space), circle.space]),
  );
  const stateSpaceByIdentity = new Map<string, string>();

  // Keep an existing canonical key when a legacy and canonical key collide.
  for (const [space, state] of Object.entries(current.circleStates)) {
    const key = spaceKey(space);
    if (key === space) {
      nextCircleStates[key] = state;
      stateSpaceByIdentity.set(key, key);
    }
  }
  for (const [space, state] of Object.entries(current.circleStates)) {
    const key = spaceKey(space);
    if (key === space || stateSpaceByIdentity.has(key)) continue;
    const target = incomingSpaceByIdentity.get(key) ?? space;
    if (!(target in nextCircleStates)) {
      nextCircleStates[target] = state;
      stateSpaceByIdentity.set(key, target);
    }
  }

  // Check for auto-purchases (isSale=x or X in incoming)
  for (const inc of incoming) {
    const isSaleFlag = inc.isSale?.toLowerCase() === "x";
    const key = spaceKey(inc.space);
    const stateKey = stateSpaceByIdentity.get(key) ?? inc.space;
    if (isSaleFlag && nextCircleStates[stateKey] !== "purchased") {
      nextCircleStates[stateKey] = "purchased";
    }
  }

  const nextState: LocalEventDayState = {
    schemaVersion: 2,
    source: { ...current.source },
    sourceGeneration: current.sourceGeneration,
    circles: nextCircles,
    circleStates: Object.freeze(nextCircleStates),
    gasOutbox: current.gasOutbox.map((g) => ({ ...g })),
    timestamps: {
      createdAt: current.timestamps.createdAt,
      updatedAt: now,
      sourceUpdatedAt: now,
    },
  };

  return deepFreeze(nextState);
}

/**
 * Recursively freezes an object to guarantee immutability at runtime.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (typeof val === "object" && val !== null) {
      deepFreeze(val);
    }
  }
  return obj;
}
