import type {
  EventRegistryEntry,
  MapBundleManifest,
} from "../domain/event-day-contracts";

export interface MapManifestLoader {
  load(
    event: EventRegistryEntry,
    signal?: AbortSignal,
  ): Promise<MapBundleManifest>;
}

/** Loads a validated event-scoped map manifest through an injected adapter. */
export class LoadMapManifestUseCase {
  constructor(private readonly loader: MapManifestLoader) {}
  execute(
    event: EventRegistryEntry,
    signal?: AbortSignal,
  ): Promise<MapBundleManifest> {
    return this.loader.load(event, signal);
  }
}
