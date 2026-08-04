import type { EventDayRef } from "../../event-day/public-api";
import type { ConfirmedPosition } from "../domain/navigation-state";

export interface NavigationSnapshot {
  readonly eventId: string;
  readonly dayId: string;
  readonly mapAreaId: string;
  readonly startPosition: ConfirmedPosition;
  readonly targetSpace: string | null;
  readonly visitedSpaces: readonly string[];
}

export interface RouteGuidanceSnapshotRepository {
  loadSnapshot(eventDay: EventDayRef): NavigationSnapshot | null;
  saveSnapshot(eventDay: EventDayRef, snapshot: NavigationSnapshot): void;
  deleteSnapshot(eventDay: EventDayRef): void;
}
