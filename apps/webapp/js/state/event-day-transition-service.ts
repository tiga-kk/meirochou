import {
  loadRuntimeMapBundleManifestFromUrl,
  resolveEventMapManifestUrl,
} from "../map-manifest-loader";
import type {
  EventDayRef,
  EventRegistryEntryV1,
  EventRegistryV1,
  LocalEventDayState,
  MapBundleManifestV1,
} from "../types/domain";
import type { EventDayRepository } from "./event-day-repository";
import { createEmptyEventDayState } from "./storage-schema";

/** Immutable data prepared without changing the active screen or storage. */
export interface PreparedEventDayTransition {
  readonly token: string;
  readonly ref: EventDayRef;
  readonly event: EventRegistryEntryV1;
  readonly manifest: MapBundleManifestV1;
  readonly state: LocalEventDayState;
  readonly createsState: boolean;
}

/** Injectable boundaries used to make transition preparation deterministic. */
export interface EventDayTransitionServiceOptions {
  readonly currentManifest?: MapBundleManifestV1 | null;
  readonly createToken?: () => string;
  readonly createSourceGeneration?: () => string;
  readonly fetcher?: typeof fetch;
  readonly now?: () => string;
}

/** Prepares registry-scoped map/state transitions and commits them atomically. */
export class EventDayTransitionService {
  private readonly repository: EventDayRepository;
  private readonly registryUrl: string;
  private readonly registry: EventRegistryV1;
  private currentManifest: MapBundleManifestV1 | null;
  private readonly createToken: () => string;
  private readonly createSourceGeneration: () => string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;
  private activeToken: string | null = null;
  private prepareSequence = 0;
  private activePrepareSequence = 0;
  private tokenSequence = 0;
  private sourceGenerationSequence = 0;

  constructor(
    repository: EventDayRepository,
    registryUrl: string,
    registry: EventRegistryV1,
    options?: EventDayTransitionServiceOptions,
  ) {
    this.repository = repository;
    this.registryUrl = registryUrl;
    this.registry = registry;
    this.currentManifest = options?.currentManifest ?? null;
    const defaultFetcher = globalThis.fetch
      ? globalThis.fetch.bind(globalThis)
      : null;
    const fetcher = options?.fetcher ?? defaultFetcher;
    if (!fetcher) {
      throw new Error("Event transition requires fetch support");
    }
    this.fetcher = fetcher;
    this.createToken =
      options?.createToken ??
      (() => `trans_token_${Date.now()}_${++this.tokenSequence}`);
    this.createSourceGeneration =
      options?.createSourceGeneration ??
      (() =>
        `source-${Date.now()}-${++this.sourceGenerationSequence}`.slice(0, 64));
    this.now = options?.now ?? (() => new Date().toISOString());
  }

  /** Resolve and validate a target without persisting or changing global UI state. */
  async prepare(
    ref: EventDayRef,
    signal?: AbortSignal,
  ): Promise<PreparedEventDayTransition> {
    const prepareSequence = ++this.prepareSequence;
    this.activePrepareSequence = prepareSequence;
    const event = this.registry.events.find((e) => e.eventId === ref.eventId);
    if (!event) {
      throw new Error("Event/Day not found in registry");
    }
    const dayExists = event.days.some((d) => d.dayId === ref.dayId);
    if (!dayExists) {
      throw new Error("Event/Day not found in registry");
    }

    let manifest: MapBundleManifestV1;
    if (this.currentManifest && this.currentManifest.eventId === ref.eventId) {
      manifest = this.currentManifest;
    } else {
      const manifestUrl = resolveEventMapManifestUrl(this.registryUrl, event);
      manifest = await loadRuntimeMapBundleManifestFromUrl(
        manifestUrl,
        ref.eventId,
        {
          fetcher: this.fetcher,
          signal,
        },
      );
      if (prepareSequence !== this.activePrepareSequence) {
        throw new Error("Transition preparation was superseded");
      }
      if (manifest.eventId !== ref.eventId) {
        throw new Error(
          `Manifest eventId mismatch: expected '${ref.eventId}', got '${manifest.eventId}'`,
        );
      }
    }

    const existingState = this.repository.load(ref);
    const createsState = !existingState;
    const state =
      existingState ??
      createEmptyEventDayState(
        { type: "csv", fileName: "empty.csv" },
        this.createSourceGeneration(),
        this.now(),
      );

    const token = this.createToken();
    this.activeToken = token;

    return Object.freeze({
      token,
      ref: Object.freeze({ eventId: ref.eventId, dayId: ref.dayId }),
      event,
      manifest,
      state,
      createsState,
    });
  }

  /** Persist a current prepared transition and reject stale or reused tokens. */
  commit(prepared: PreparedEventDayTransition): LocalEventDayState {
    if (!this.activeToken || prepared.token !== this.activeToken) {
      throw new Error("Invalid or stale transition token");
    }

    this.repository.saveWithLastOpened(prepared.ref, prepared.state);
    this.currentManifest = prepared.manifest;
    this.activeToken = null;
    return prepared.state;
  }
}
