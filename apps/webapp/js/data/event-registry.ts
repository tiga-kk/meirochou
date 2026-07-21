import { parseEventRegistry } from "../types/boundary-parsers";
import type { EventRegistryV1 } from "../types/domain";

export { parseEventRegistry };

export async function loadEventRegistry(
  baseUrl?: string,
): Promise<EventRegistryV1> {
  const url = baseUrl
    ? new URL("assets/events/manifest.json", baseUrl).href
    : "/assets/events/manifest.json";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load event registry: ${response.status} ${response.statusText}`,
    );
  }
  const data = await response.json();
  return parseEventRegistry(data);
}
