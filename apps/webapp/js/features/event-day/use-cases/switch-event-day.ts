import type {
  EventRegistry,
  EventRegistryEntry,
  MapBundleManifest,
  PreparedEventDaySwitch,
} from "../domain/event-day-contracts";
import type {
  EventDayRef,
  LocalEventDayState,
} from "../domain/event-day-types";
import type { EventDayRepository } from "./event-day-repository";

function createEmptyState(
  sourceGeneration: string,
  now: string,
): LocalEventDayState {
  return {
    schemaVersion: 2,
    source: { type: "csv", fileName: "empty.csv" },
    sourceGeneration,
    circles: [],
    circleStates: {},
    gasOutbox: [],
    timestamps: { createdAt: now, updatedAt: now, sourceUpdatedAt: now },
  };
}

export interface SwitchEventDayInput {
  readonly eventId: string;
  readonly dayId: string;
}

export interface SwitchEventDayCollaborators {
  beforeSwitch?: (currentRef: EventDayRef) => Promise<void>;
  afterSwitch?: (
    newRef: EventDayRef,
    manifest: MapBundleManifest,
  ) => Promise<void>;
  onSwitchFailure?: (requestedRef: EventDayRef, error: unknown) => void;
}

export interface SwitchEventDayOptions {
  readonly now?: () => string;
  readonly createSourceGeneration?: () => string;
  readonly currentManifest?: MapBundleManifest | null;
  readonly createToken?: () => string;
  readonly fetcher?: typeof fetch;
  readonly loadManifest?: (
    event: EventRegistryEntry,
    signal?: AbortSignal,
  ) => Promise<MapBundleManifest>;
  readonly resolveManifestUrl?: (
    registryUrl: string,
    event: EventRegistryEntry,
  ) => string;
}

export interface SwitchEventDayDependencies extends SwitchEventDayOptions {
  readonly repository: EventDayRepository;
  readonly registry: EventRegistry;
  readonly registryUrl?: string;
  readonly collaborators?: SwitchEventDayCollaborators;
}

export interface SwitchEventDayOperation {
  execute(input: SwitchEventDayInput): Promise<void>;
}

function parseRef(input: SwitchEventDayInput): EventDayRef {
  if (
    typeof input?.eventId !== "string" ||
    input.eventId.trim() === "" ||
    typeof input.dayId !== "string" ||
    input.dayId.trim() === ""
  ) {
    throw new Error("Invalid event/day selection");
  }
  return Object.freeze({ eventId: input.eventId, dayId: input.dayId });
}

/** Owns event/day validation, manifest preparation, durable commit and UI switching. */
export class SwitchEventDayUseCase implements SwitchEventDayOperation {
  private readonly repository: EventDayRepository;
  private switching = false;
  private currentManifest: MapBundleManifest | null;
  private activeToken: string | null = null;
  private prepareSequence = 0;
  private activePrepareSequence = 0;
  private tokenSequence = 0;
  private sourceGenerationSequence = 0;
  private readonly now: () => string;
  private readonly createSourceGeneration: () => string;
  private readonly createToken: () => string;
  private readonly fetcher: typeof fetch | null;
  private readonly loadManifest:
    | ((
        event: EventRegistryEntry,
        signal?: AbortSignal,
      ) => Promise<MapBundleManifest>)
    | null;
  private readonly registry: EventRegistry;
  private readonly collaborators: SwitchEventDayCollaborators;
  private readonly registryUrl: string | null;
  private readonly resolveManifestUrl:
    | ((registryUrl: string, event: EventRegistryEntry) => string)
    | null;

  constructor(dependencies: SwitchEventDayDependencies) {
    this.repository = dependencies.repository;
    this.registry = dependencies.registry;
    this.registryUrl = dependencies.registryUrl ?? null;
    this.collaborators = dependencies.collaborators ?? {};
    const resolvedOptions = dependencies;
    this.currentManifest = resolvedOptions.currentManifest ?? null;
    this.now = resolvedOptions.now ?? (() => new Date().toISOString());
    this.createSourceGeneration =
      resolvedOptions.createSourceGeneration ??
      (() =>
        `source-${Date.now()}-${++this.sourceGenerationSequence}`.slice(0, 64));
    this.createToken =
      resolvedOptions.createToken ??
      (() => `event-day-token-${Date.now()}-${++this.tokenSequence}`);
    this.fetcher =
      resolvedOptions.fetcher ??
      (globalThis.fetch ? globalThis.fetch.bind(globalThis) : null);
    this.loadManifest = resolvedOptions.loadManifest ?? null;
    this.resolveManifestUrl =
      resolvedOptions.resolveManifestUrl ??
      ((url, event) => new URL(event.mapBundle, url).href);
  }

  async execute(input: SwitchEventDayInput): Promise<void> {
    const requestedRef = parseRef(input);
    if (this.switching)
      throw new Error("Event/day switch is already in progress");
    const currentRef = this.repository.getLastOpenedEventDay();
    if (
      currentRef &&
      currentRef.eventId === requestedRef.eventId &&
      currentRef.dayId === requestedRef.dayId
    )
      return;

    this.switching = true;
    try {
      const collaborators = this.getCollaborators();
      if (currentRef) await collaborators.beforeSwitch?.(currentRef);
      const prepared = await this.prepare(requestedRef);
      this.commit(prepared);
      await collaborators.afterSwitch?.(requestedRef, prepared.manifest);
    } catch (error: unknown) {
      this.getCollaborators().onSwitchFailure?.(requestedRef, error);
      throw error;
    } finally {
      this.switching = false;
    }
  }

  async prepare(
    ref: EventDayRef,
    signal?: AbortSignal,
  ): Promise<PreparedEventDaySwitch> {
    const registry = this.registry;
    if (!registry) throw new Error("Event registry is required");
    const event = registry.events.find(
      (entry) => entry.eventId === ref.eventId,
    );
    if (!event?.days.some((day) => day.dayId === ref.dayId))
      throw new Error("Event/Day not found in registry");
    const manifest = await this.resolveManifest(event, ref.eventId, signal);
    const existingState = this.repository.load(ref);
    const state =
      existingState ??
      createEmptyState(this.createSourceGeneration(), this.now());
    const prepared = Object.freeze({
      token: this.createToken(),
      ref: Object.freeze({ eventId: ref.eventId, dayId: ref.dayId }),
      event,
      manifest,
      state,
      createsState: !existingState,
    });
    this.activeToken = prepared.token;
    return prepared;
  }

  commit(prepared: PreparedEventDaySwitch): LocalEventDayState {
    if (!this.activeToken || prepared.token !== this.activeToken)
      throw new Error("Invalid or stale transition token");
    this.repository.saveAndRememberLastOpened(prepared.ref, prepared.state);
    this.currentManifest = prepared.manifest;
    this.activeToken = null;
    return prepared.state;
  }

  rollback(): void {
    this.activeToken = null;
  }

  private async resolveManifest(
    event: EventRegistryEntry,
    eventId: string,
    signal?: AbortSignal,
  ): Promise<MapBundleManifest> {
    if (this.currentManifest?.eventId === eventId) return this.currentManifest;
    if (!this.loadManifest && (!this.registryUrl || !this.fetcher))
      throw new Error("Event manifest loader is required");
    const sequence = ++this.prepareSequence;
    this.activePrepareSequence = sequence;
    const manifest = this.loadManifest
      ? await this.loadManifest(event, signal)
      : await this.fetchManifest(event, signal);
    if (manifest.eventId !== eventId)
      throw new Error(
        `Manifest eventId mismatch: expected '${eventId}', got '${manifest.eventId}'`,
      );
    if (sequence !== this.activePrepareSequence)
      throw new Error("Transition preparation was superseded");
    return manifest;
  }

  private async fetchManifest(
    event: EventRegistryEntry,
    signal?: AbortSignal,
  ): Promise<MapBundleManifest> {
    if (!this.registryUrl || !this.fetcher || !this.resolveManifestUrl)
      throw new Error("Event manifest loader is required");
    const response = await this.fetcher(
      this.resolveManifestUrl(this.registryUrl, event),
      { signal },
    );
    if (!response.ok)
      throw new Error(`Manifest request failed (${response.status})`);
    const manifest = (await response.json()) as MapBundleManifest;
    const base = new URL(".", this.resolveManifestUrl(this.registryUrl, event));
    return {
      ...manifest,
      areas: manifest.areas.map((area) => {
        const copy = { ...area };
        for (const key of [
          "mapFile",
          "pointsFile",
          "gridMetaFile",
          "gridFile",
        ]) {
          if (typeof copy[key] === "string")
            copy[key] = new URL(copy[key], base).href;
        }
        return copy;
      }),
    };
  }

  private getCollaborators(): SwitchEventDayCollaborators {
    return this.collaborators;
  }
}

export type PreparedEventDayTransition = PreparedEventDaySwitch;
