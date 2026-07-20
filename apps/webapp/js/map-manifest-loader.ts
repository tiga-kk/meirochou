import { parseMapBundleManifest } from "./types/boundary-parsers";
import type { MapBundleManifestV1 } from "./types/domain";

const MAP_MANIFEST_PATH = "./assets/maps/manifest.json";

interface LoadMapBundleManifestOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Fetch and validate the map manifest before application controllers are created. */
export async function loadMapBundleManifest(
  options: LoadMapBundleManifestOptions = {},
): Promise<MapBundleManifestV1> {
  const baseUrl = options.baseUrl ?? document.baseURI;
  const manifestUrl = new URL(MAP_MANIFEST_PATH, baseUrl).href;
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(manifestUrl, {
      headers: { Accept: "application/json" },
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
