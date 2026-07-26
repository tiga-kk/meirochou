import {
  parseEventMapBundleManifest,
  parseMapBundleManifest,
} from "./types/boundary-parsers";
import type {
  EventMapBundleManifest,
  EventRegistryEntryV1,
  MapBundleManifestV1,
} from "./types/domain";

const MAP_MANIFEST_PATH = "./assets/maps/manifest.json";

interface LoadMapBundleManifestOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Resolve an event's map bundle manifest URL relative to the event registry URL. */
export function resolveEventMapManifestUrl(
  registryUrl: string,
  event: EventRegistryEntryV1,
): string {
  const bundle = event.mapBundle;
  if (
    typeof bundle !== "string" ||
    !bundle ||
    !bundle.startsWith("../maps/") ||
    bundle.includes("\\") ||
    bundle.includes("?") ||
    bundle.includes("#") ||
    /^(?:[a-z]+:)?\/\//i.test(bundle)
  ) {
    throw new Error(`Invalid mapBundle '${bundle}' in event ${event.eventId}`);
  }

  try {
    const pathSegments = bundle.slice("../maps/".length).split("/");
    if (
      pathSegments.some((segment) => {
        const decoded = decodeURIComponent(segment);
        return (
          decoded.length === 0 ||
          decoded === "." ||
          decoded === ".." ||
          decoded.includes("/") ||
          decoded.includes("\\")
        );
      })
    ) {
      throw new Error("mapBundle contains a traversal segment");
    }
  } catch {
    throw new Error(`Invalid mapBundle '${bundle}' in event ${event.eventId}`);
  }

  const base = new URL(".", registryUrl);
  const resolved = new URL(bundle, base);
  const mapRoot = new URL("../maps/", base);

  if (
    resolved.origin !== base.origin ||
    resolved.origin !== mapRoot.origin ||
    !resolved.pathname.startsWith(mapRoot.pathname)
  ) {
    throw new Error(
      `Resolved manifest URL '${resolved.href}' is outside allowed map boundary`,
    );
  }

  return resolved.href;
}

/** Fetch and validate a C108 event map bundle manifest from an explicit URL. */
export async function loadEventMapBundleManifestFromUrl(
  manifestUrl: string,
  options: LoadMapBundleManifestOptions = {},
): Promise<EventMapBundleManifest> {
  const fetcher =
    options.fetcher ??
    (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
  if (!fetcher) {
    throw new Error("Map manifest request failed: fetch is unavailable");
  }
  let response: Response;
  try {
    response = await fetcher(manifestUrl, {
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    throw new Error(`Map manifest request failed: ${errorDetail(error)}`, {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new Error(`Map manifest request failed with HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(
      `Map manifest JSON could not be parsed: ${errorDetail(error)}`,
      { cause: error },
    );
  }
  return parseEventMapBundleManifest(payload);
}

/** Fetch and validate a map bundle manifest from an explicit URL. */
export async function loadMapBundleManifestFromUrl(
  manifestUrl: string,
  options: LoadMapBundleManifestOptions = {},
): Promise<MapBundleManifestV1> {
  const fetcher =
    options.fetcher ??
    (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
  if (!fetcher) {
    throw new Error("Map manifest request failed: fetch is unavailable");
  }
  let response: Response;
  try {
    response = await fetcher(manifestUrl, {
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    throw new Error(`Map manifest request failed: ${errorDetail(error)}`, {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new Error(`Map manifest request failed with HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(
      `Map manifest JSON could not be parsed: ${errorDetail(error)}`,
      { cause: error },
    );
  }
  return parseMapBundleManifest(payload, manifestUrl);
}

/** Fetch and validate the map manifest before application controllers are created. */
export async function loadMapBundleManifest(
  options: LoadMapBundleManifestOptions = {},
): Promise<MapBundleManifestV1> {
  const baseUrl = options.baseUrl ?? document.baseURI;
  const manifestUrl = new URL(MAP_MANIFEST_PATH, baseUrl).href;
  return loadMapBundleManifestFromUrl(manifestUrl, options);
}

/** Replace the unusable app shell with an accessible, diagnostic startup error. */
export function renderMapBootstrapError(
  targetDocument: Document,
  error: unknown,
): void {
  const page = targetDocument.createElement("main");
  page.className = "map-bootstrap-error";
  page.setAttribute("role", "alert");
  page.dataset.mapBootstrapError = "true";

  const title = targetDocument.createElement("h1");
  title.textContent = "地図設定を読み込めませんでした";
  const guidance = targetDocument.createElement("p");
  guidance.textContent =
    "地図バンドルの配置と manifest.json を確認してから再読み込みしてください。";
  const detail = targetDocument.createElement("pre");
  detail.textContent = errorDetail(error);
  page.append(title, guidance, detail);
  targetDocument.body.replaceChildren(page);
}
