import type { CircleVisitState, EventDayRef } from "../../event-day/public-api";
import type {
  ConfirmedPosition,
  LockedLeg,
  NavigationState,
  RouteEndpointId,
} from "../domain/route-guidance-types";

export interface NavigationSnapshot {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly dayId: string;
  readonly areaId: string;
  readonly bundleVersion: string;
  readonly matrixRef: string | null;
  readonly navState: NavigationState;
  readonly optimizationTimeLimitMs: 5000 | 10000 | 15000;
  readonly savedAt: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

function parsePosition(value: unknown): ConfirmedPosition | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.areaId) ||
    !isInteger(value.gridIndex) ||
    typeof value.svgX !== "number" ||
    !Number.isFinite(value.svgX) ||
    typeof value.svgY !== "number" ||
    !Number.isFinite(value.svgY) ||
    (value.source !== "manual-start" && value.source !== "arrived-circle")
  )
    return null;
  if (value.source === "arrived-circle" && !isString(value.circleSpace)) {
    return null;
  }
  return {
    areaId: value.areaId,
    gridIndex: value.gridIndex,
    svgX: value.svgX,
    svgY: value.svgY,
    source: value.source,
    ...(isString(value.circleSpace) ? { circleSpace: value.circleSpace } : {}),
  };
}

function parseEndpoint(value: unknown): RouteEndpointId | null {
  if (!isRecord(value) || value.type === undefined) return null;
  if (
    value.type === "start" &&
    isString(value.areaId) &&
    isInteger(value.gridIndex)
  ) {
    return { type: "start", areaId: value.areaId, gridIndex: value.gridIndex };
  }
  if (value.type === "circle" && isString(value.space)) {
    return { type: "circle", space: value.space };
  }
  return null;
}

function parseState(value: unknown): NavigationState | null {
  if (!isRecord(value)) return null;
  if (
    value.stage !== "idle" &&
    value.stage !== "navigating" &&
    value.stage !== "atTarget"
  )
    return null;
  const currentPosition =
    value.currentPosition === null
      ? null
      : parsePosition(value.currentPosition);
  const lockedFirstLeg =
    value.lockedFirstLeg === null
      ? null
      : isRecord(value.lockedFirstLeg) && isString(value.lockedFirstLeg.toSpace)
        ? (() => {
            const from = parseEndpoint(value.lockedFirstLeg.from);
            return from
              ? { from, toSpace: value.lockedFirstLeg.toSpace }
              : null;
          })()
        : null;
  if (
    (value.currentPosition !== null && !currentPosition) ||
    (value.lockedFirstLeg !== null && !lockedFirstLeg) ||
    (value.areaId !== null && !isString(value.areaId)) ||
    (value.targetSpace !== null && !isString(value.targetSpace)) ||
    !Array.isArray(value.provisionalOrder) ||
    !value.provisionalOrder.every(isString) ||
    !Array.isArray(value.bestOrder) ||
    !value.bestOrder.every(isString)
  )
    return null;
  return {
    stage: value.stage,
    areaId: value.areaId as string | null,
    currentPosition,
    targetSpace: value.targetSpace as string | null,
    lockedFirstLeg: lockedFirstLeg as LockedLeg | null,
    provisionalOrder: [...value.provisionalOrder],
    bestOrder: [...value.bestOrder],
    ...(isInteger(value.optimizationGeneration)
      ? { optimizationGeneration: value.optimizationGeneration }
      : {}),
  };
}

function parseSnapshot(value: unknown): NavigationSnapshot | null {
  if (!isRecord(value)) return null;
  const navState = parseState(value.navState);
  if (
    value.schemaVersion !== 1 ||
    !isString(value.eventId) ||
    !isString(value.dayId) ||
    !isString(value.areaId) ||
    !isString(value.bundleVersion) ||
    (value.matrixRef !== null && !isString(value.matrixRef)) ||
    ![5000, 10000, 15000].includes(value.optimizationTimeLimitMs as number) ||
    !isString(value.savedAt) ||
    !navState ||
    navState.areaId !== value.areaId
  )
    return null;
  return {
    schemaVersion: 1,
    eventId: value.eventId,
    dayId: value.dayId,
    areaId: value.areaId,
    bundleVersion: value.bundleVersion,
    matrixRef: value.matrixRef as string | null,
    navState,
    optimizationTimeLimitMs: value.optimizationTimeLimitMs as
      | 5000
      | 10000
      | 15000,
    savedAt: value.savedAt,
  };
}

export class LocalStorageRouteGuidanceSnapshotRepository {
  private readonly prefix = "comipath:nav-snapshot:";

  constructor(private readonly storage: StorageLike = localStorage) {}

  private key(ref: EventDayRef): string {
    return `${this.prefix}${ref.eventId}:${ref.dayId}`;
  }

  load(ref: EventDayRef | string, dayId?: string): NavigationSnapshot | null {
    const eventDay =
      typeof ref === "string" ? { eventId: ref, dayId: dayId ?? "" } : ref;
    try {
      const raw = this.storage.getItem(this.key(eventDay));
      const snapshot = raw ? parseSnapshot(JSON.parse(raw)) : null;
      return snapshot &&
        snapshot.eventId === eventDay.eventId &&
        snapshot.dayId === eventDay.dayId
        ? snapshot
        : null;
    } catch {
      return null;
    }
  }

  loadByIds(eventId: string, dayId: string): NavigationSnapshot | null {
    return this.load({ eventId, dayId });
  }

  save(
    ref: EventDayRef | string,
    snapshotOrDayId: NavigationSnapshot | string,
    maybeSnapshot?: NavigationSnapshot,
  ): void {
    const eventDay =
      typeof ref === "string"
        ? { eventId: ref, dayId: snapshotOrDayId as string }
        : ref;
    const snapshot = (
      typeof ref === "string" ? maybeSnapshot : snapshotOrDayId
    ) as NavigationSnapshot;
    if (!parseSnapshot(snapshot)) return;
    try {
      this.storage.setItem(this.key(eventDay), JSON.stringify(snapshot));
    } catch {
      // Local storage is optional; navigation continues without persistence.
    }
  }

  saveByIds(
    eventId: string,
    dayId: string,
    snapshot: NavigationSnapshot,
  ): void {
    this.save({ eventId, dayId }, snapshot);
  }

  clear(ref: EventDayRef | string, dayId?: string): void {
    const eventDay =
      typeof ref === "string" ? { eventId: ref, dayId: dayId ?? "" } : ref;
    try {
      this.storage.removeItem(this.key(eventDay));
    } catch {
      // Ignore storage failures while clearing stale navigation state.
    }
  }

  clearByIds(eventId: string, dayId: string): void {
    this.clear({ eventId, dayId });
  }

  loadSnapshot(ref: EventDayRef): NavigationSnapshot | null {
    return this.load(ref);
  }

  saveSnapshot(ref: EventDayRef, snapshot: NavigationSnapshot): void {
    this.save(ref, snapshot);
  }

  deleteSnapshot(ref: EventDayRef): void {
    this.clear(ref);
  }
}

export interface ResumeValidationInput {
  readonly snapshot: NavigationSnapshot;
  readonly currentBundleVersion: string;
  readonly circleStates: Record<string, CircleVisitState>;
  readonly pendingCircleSpaces: readonly string[];
}

export function validateSnapshotForResume(
  input: ResumeValidationInput,
): boolean {
  const { snapshot, circleStates, pendingCircleSpaces } = input;
  if (snapshot.bundleVersion !== input.currentBundleVersion) return false;
  const pending = new Set([
    ...pendingCircleSpaces,
    ...Object.entries(circleStates)
      .filter(([, state]) => state === "pending")
      .map(([space]) => space),
  ]);
  const state = snapshot.navState;
  if (state.targetSpace && !pending.has(state.targetSpace)) return false;
  if (
    state.bestOrder.some((space) => !pending.has(space)) ||
    state.provisionalOrder.some((space) => !pending.has(space))
  )
    return false;
  if (
    state.targetSpace &&
    state.lockedFirstLeg?.toSpace !== state.targetSpace
  ) {
    return false;
  }
  if (state.lockedFirstLeg?.from.type === "circle") {
    return pending.has(state.lockedFirstLeg.from.space);
  }
  return (
    state.lockedFirstLeg?.from.type !== "start" ||
    state.lockedFirstLeg.from.areaId === snapshot.areaId
  );
}

export {
  LocalStorageRouteGuidanceSnapshotRepository as LocalStorageNavigationSnapshotRepository,
};
