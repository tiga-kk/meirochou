import type {
  CircleVisitState,
  ConfirmedPosition,
  LockedLeg,
  NavigationState,
  RouteEndpointId,
} from "../types/domain";

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

export interface NavigationSnapshotRepository {
  load(eventId: string, dayId: string): NavigationSnapshot | null;
  save(eventId: string, dayId: string, snapshot: NavigationSnapshot): void;
  clear(eventId: string, dayId: string): void;
}

interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function parseConfirmedPosition(value: unknown): ConfirmedPosition | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.areaId) ||
    !isInteger(value.gridIndex) ||
    typeof value.svgX !== "number" ||
    !Number.isFinite(value.svgX) ||
    typeof value.svgY !== "number" ||
    !Number.isFinite(value.svgY) ||
    (value.source !== "manual-start" && value.source !== "arrived-circle")
  ) {
    return null;
  }
  if (value.circleSpace !== undefined && !isString(value.circleSpace)) {
    return null;
  }
  if (value.source === "arrived-circle" && !isString(value.circleSpace)) {
    return null;
  }
  return Object.freeze({
    areaId: value.areaId,
    gridIndex: value.gridIndex,
    svgX: value.svgX,
    svgY: value.svgY,
    source: value.source,
    ...(value.circleSpace ? { circleSpace: value.circleSpace } : {}),
  });
}

function parseEndpoint(value: unknown): RouteEndpointId | null {
  if (!isRecord(value) || !isString(value.type)) return null;
  if (value.type === "start") {
    if (!isString(value.areaId) || !isInteger(value.gridIndex)) {
      return null;
    }
    return Object.freeze({
      type: "start" as const,
      areaId: value.areaId,
      gridIndex: value.gridIndex,
    });
  }
  if (value.type === "circle" && isString(value.space)) {
    return Object.freeze({ type: "circle" as const, space: value.space });
  }
  return null;
}

function parseLockedLeg(value: unknown): LockedLeg | null {
  if (!isRecord(value) || !isString(value.toSpace)) return null;
  const from = parseEndpoint(value.from);
  return from ? Object.freeze({ from, toSpace: value.toSpace }) : null;
}

function parseNavigationState(value: unknown): NavigationState | null {
  if (!isRecord(value)) return null;
  if (
    value.stage !== "idle" &&
    value.stage !== "navigating" &&
    value.stage !== "atTarget"
  ) {
    return null;
  }
  if (value.areaId !== null && !isString(value.areaId)) return null;
  if (value.targetSpace !== null && !isString(value.targetSpace)) {
    return null;
  }
  if (
    !isStringArray(value.provisionalOrder) ||
    !isStringArray(value.bestOrder)
  ) {
    return null;
  }
  const currentPosition =
    value.currentPosition === null
      ? null
      : parseConfirmedPosition(value.currentPosition);
  if (value.currentPosition !== null && currentPosition === null) return null;
  const lockedFirstLeg =
    value.lockedFirstLeg === null ? null : parseLockedLeg(value.lockedFirstLeg);
  if (value.lockedFirstLeg !== null && lockedFirstLeg === null) return null;
  if (
    value.optimizationGeneration !== undefined &&
    (!isInteger(value.optimizationGeneration) ||
      value.optimizationGeneration < 0)
  ) {
    return null;
  }
  return Object.freeze({
    stage: value.stage,
    areaId: value.areaId,
    currentPosition,
    targetSpace: value.targetSpace,
    lockedFirstLeg,
    provisionalOrder: Object.freeze([...value.provisionalOrder]),
    bestOrder: Object.freeze([...value.bestOrder]),
    ...(value.optimizationGeneration !== undefined
      ? { optimizationGeneration: value.optimizationGeneration }
      : {}),
  });
}

function parseNavigationSnapshot(value: unknown): NavigationSnapshot | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== 1 ||
    !isString(value.eventId) ||
    !isString(value.dayId) ||
    !isString(value.areaId) ||
    !isString(value.bundleVersion) ||
    (value.matrixRef !== null && !isString(value.matrixRef)) ||
    ![5000, 10000, 15000].includes(value.optimizationTimeLimitMs as number) ||
    !isString(value.savedAt) ||
    !Number.isFinite(Date.parse(value.savedAt))
  ) {
    return null;
  }
  const navState = parseNavigationState(value.navState);
  if (!navState) return null;
  if (navState.areaId !== value.areaId) return null;
  return Object.freeze({
    schemaVersion: 1 as const,
    eventId: value.eventId,
    dayId: value.dayId,
    areaId: value.areaId,
    bundleVersion: value.bundleVersion,
    matrixRef: value.matrixRef,
    navState,
    optimizationTimeLimitMs: value.optimizationTimeLimitMs as
      | 5000
      | 10000
      | 15000,
    savedAt: value.savedAt,
  });
}

export class LocalStorageNavigationSnapshotRepository
  implements NavigationSnapshotRepository
{
  private readonly PREFIX = "comipath:nav-snapshot:";

  constructor(private readonly storage: SnapshotStorage = localStorage) {}

  private key(eventId: string, dayId: string): string {
    return `${this.PREFIX}${eventId}:${dayId}`;
  }

  load(eventId: string, dayId: string): NavigationSnapshot | null {
    try {
      const raw = this.storage.getItem(this.key(eventId, dayId));
      if (!raw) return null;
      const snapshot = parseNavigationSnapshot(JSON.parse(raw) as unknown);
      if (
        !snapshot ||
        snapshot.eventId !== eventId ||
        snapshot.dayId !== dayId
      ) {
        return null;
      }
      return snapshot;
    } catch {
      return null;
    }
  }

  save(eventId: string, dayId: string, snapshot: NavigationSnapshot): void {
    const parsed = parseNavigationSnapshot(snapshot);
    if (!parsed || parsed.eventId !== eventId || parsed.dayId !== dayId) {
      return;
    }
    try {
      this.storage.setItem(this.key(eventId, dayId), JSON.stringify(parsed));
    } catch {
      // Ignore quota errors on snapshot save.
    }
  }

  clear(eventId: string, dayId: string): void {
    try {
      this.storage.removeItem(this.key(eventId, dayId));
    } catch {
      // Ignore errors on clear.
    }
  }
}

export interface ResumeValidationInput {
  readonly snapshot: NavigationSnapshot;
  readonly currentBundleVersion: string;
  readonly circleStates: Record<string, CircleVisitState>;
  readonly pendingCircleSpaces: readonly string[];
}

function hasKnownCircle(
  space: string,
  circleStates: Record<string, CircleVisitState>,
  pendingCircleSpaces: readonly string[],
): boolean {
  return space in circleStates || pendingCircleSpaces.includes(space);
}

function isEndpointConsistent(
  endpoint: RouteEndpointId,
  snapshot: NavigationSnapshot,
  circleStates: Record<string, CircleVisitState>,
  pendingCircleSpaces: readonly string[],
): boolean {
  if (endpoint.type === "start") {
    return endpoint.areaId === snapshot.areaId;
  }
  return hasKnownCircle(endpoint.space, circleStates, pendingCircleSpaces);
}

/** Validate a snapshot before exposing it to the resume flow. */
export function validateSnapshotForResume(
  input: ResumeValidationInput,
): boolean {
  const { snapshot, currentBundleVersion, circleStates, pendingCircleSpaces } =
    input;
  const parsed = parseNavigationSnapshot(snapshot);
  if (!parsed || parsed.bundleVersion !== currentBundleVersion) return false;

  const navState = parsed.navState;
  if (navState.areaId !== parsed.areaId) return false;
  if (
    navState.currentPosition &&
    (!isEndpointConsistent(
      navState.currentPosition.source === "arrived-circle" &&
        navState.currentPosition.circleSpace
        ? { type: "circle", space: navState.currentPosition.circleSpace }
        : {
            type: "start",
            areaId: navState.currentPosition.areaId,
            gridIndex: navState.currentPosition.gridIndex,
          },
      parsed,
      circleStates,
      pendingCircleSpaces,
    ) ||
      navState.currentPosition.areaId !== parsed.areaId)
  ) {
    return false;
  }

  if (navState.stage === "idle") {
    return navState.targetSpace === null && navState.lockedFirstLeg === null;
  }

  const target = navState.targetSpace;
  if (!target || !pendingCircleSpaces.includes(target)) return false;
  if ((circleStates[target] ?? "pending") !== "pending") return false;
  if (!navState.lockedFirstLeg || navState.lockedFirstLeg.toSpace !== target) {
    return false;
  }
  return isEndpointConsistent(
    navState.lockedFirstLeg.from,
    parsed,
    circleStates,
    pendingCircleSpaces,
  );
}
