import type { EventDayRef } from "../../event-day/public-api";
import type { NavigationState } from "../domain/route-guidance-types";

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

export interface RouteGuidanceSnapshotRepository {
  loadSnapshot(eventDay: EventDayRef): NavigationSnapshot | null;
  saveSnapshot(eventDay: EventDayRef, snapshot: NavigationSnapshot): void;
  deleteSnapshot(eventDay: EventDayRef): void;
}
