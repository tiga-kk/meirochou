import type { EventRegistryV1 } from "../domain/application-contract-types";
import { parseEventRegistry } from "./application-boundary-parsers";

export { parseEventRegistry };

/** A parsed event registry together with its resolved request URL. */
export interface LoadedEventRegistry {
  readonly registry: EventRegistryV1;
  readonly registryUrl: string;
}

/** Fetch and parse the event registry while retaining its URL for bundle resolution. */
export async function loadEventRegistryWithUrl(
  baseUrl?: string,
  fetcher?: typeof fetch,
): Promise<LoadedEventRegistry> {
  const url = baseUrl
    ? new URL("assets/events/manifest.json", baseUrl).href
    : typeof document !== "undefined" && document.baseURI
      ? new URL("/assets/events/manifest.json", document.baseURI).href
      : "/assets/events/manifest.json";

  const request =
    fetcher ??
    (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
  if (!request) {
    throw new Error("Event registry request failed: fetch is unavailable");
  }
  const response = await request(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load event registry: ${response.status} ${response.statusText}`,
    );
  }
  const data = await response.json();
  const registry = parseEventRegistry(data);
  return { registry, registryUrl: url };
}

/** Backward-compatible registry loader that returns only the parsed registry. */
export async function loadEventRegistry(
  baseUrl?: string,
): Promise<EventRegistryV1> {
  const loaded = await loadEventRegistryWithUrl(baseUrl);
  return loaded.registry;
}
