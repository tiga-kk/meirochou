import type { EventDayRef, LocalEventDayState } from "./event-day-types";

export interface EventRegistryDay {
  readonly dayId: string;
  readonly displayName: string;
  readonly date?: string;
}

export interface EventRegistryEntry {
  readonly eventId: string;
  readonly displayName: string;
  readonly mapBundle: string;
  readonly days: readonly EventRegistryDay[];
}

export interface EventRegistry {
  readonly schemaVersion: 1;
  readonly events: readonly EventRegistryEntry[];
}

export interface MapBundleManifest {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly displayName: string;
  readonly bundleVersion?: string;
  readonly areas: readonly Record<string, unknown>[];
}

export interface PreparedEventDaySwitch {
  readonly token: string;
  readonly ref: EventDayRef;
  readonly event: EventRegistryEntry;
  readonly manifest: MapBundleManifest;
  readonly state: LocalEventDayState;
  readonly createsState: boolean;
}
