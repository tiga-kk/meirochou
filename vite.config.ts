import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  stat,
  statSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";

const defaultRepositoryRoot = dirname(fileURLToPath(import.meta.url));

interface MapBundleSelectionOptions {
  mode: string;
  repositoryRoot: string;
  privateBundleDirectory?: string;
}

function isInside(parentDirectory: string, candidate: string): boolean {
  const relativePath = relative(parentDirectory, candidate);
  return (
    relativePath === "" ||
    (!isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`))
  );
}

function assertSafeBundleId(
  eventId: unknown,
  label: string,
): asserts eventId is string {
  if (
    typeof eventId !== "string" ||
    eventId.length === 0 ||
    eventId === "." ||
    eventId === ".." ||
    eventId.includes("/") ||
    eventId.includes("\\") ||
    eventId.includes("\0")
  ) {
    throw new Error(`${label} must be a safe bundle path segment`);
  }
}

function assertNoSymbolicLinks(directory: string): void {
  readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Map bundles must not contain symbolic links: ${entryPath}`,
      );
    }
    if (entry.isDirectory()) assertNoSymbolicLinks(entryPath);
  });
}

/** Select and validate all map bundles exposed by the current Vite mode. */
export function selectMapBundles(
  options: MapBundleSelectionOptions,
): Map<string, string> {
  const mapBundles = new Map<string, string>();
  const webappRoot = resolve(options.repositoryRoot, "apps/webapp");

  if (options.mode === "private") {
    const configuredDirectory = options.privateBundleDirectory?.trim();
    if (!configuredDirectory) {
      throw new Error(
        "COMIPATH_PRIVATE_MAP_BUNDLE_DIR is required in private mode",
      );
    }

    const configuredPath = resolve(configuredDirectory);
    if (
      !existsSync(configuredPath) ||
      !statSync(configuredPath).isDirectory()
    ) {
      throw new Error(`Map bundle directory does not exist: ${configuredPath}`);
    }
    const bundleDirectory = realpathSync(configuredPath);
    const manifestPath = resolve(bundleDirectory, "manifest.json");
    if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
      throw new Error(
        `Map bundle manifest.json does not exist: ${manifestPath}`,
      );
    }
    if (isInside(realpathSync(options.repositoryRoot), bundleDirectory)) {
      throw new Error(
        "Private map bundle must be stored outside the repository",
      );
    }
    assertNoSymbolicLinks(bundleDirectory);

    const manifestContent = JSON.parse(readFileSync(manifestPath, "utf8"));
    const eventId = manifestContent.eventId;
    assertSafeBundleId(eventId, "Private map bundle eventId");
    mapBundles.set(eventId, bundleDirectory);
  } else {
    const registryPath = resolve(webappRoot, "events/manifest.json");
    if (!existsSync(registryPath)) {
      throw new Error(
        `Event registry manifest.json does not exist: ${registryPath}`,
      );
    }
    const registryContent = JSON.parse(readFileSync(registryPath, "utf8"));
    if (registryContent.schemaVersion !== 1) {
      throw new Error("Invalid event registry schema version");
    }
    if (!Array.isArray(registryContent.events)) {
      throw new Error("Invalid event registry events");
    }

    const mapBundlesDir = resolve(webappRoot, "map-bundles");
    if (!existsSync(mapBundlesDir) || !statSync(mapBundlesDir).isDirectory()) {
      throw new Error(
        `Map bundle root directory does not exist: ${mapBundlesDir}`,
      );
    }
    assertNoSymbolicLinks(mapBundlesDir);

    const entries = readdirSync(mapBundlesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Map bundles directory contains symbolic link: ${entry.name}`,
        );
      }
      if (!entry.isDirectory()) continue;

      const configuredPath = resolve(mapBundlesDir, entry.name);
      if (!isInside(mapBundlesDir, configuredPath)) {
        throw new Error(
          `Map bundle path outside map-bundles: ${configuredPath}`,
        );
      }

      const bundleDirectory = realpathSync(configuredPath);
      const manifestPath = resolve(bundleDirectory, "manifest.json");
      if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
        throw new Error(
          `Map bundle manifest.json does not exist: ${manifestPath}`,
        );
      }

      assertNoSymbolicLinks(bundleDirectory);

      const manifestContent = JSON.parse(readFileSync(manifestPath, "utf8"));
      const eventId = manifestContent.eventId;
      assertSafeBundleId(eventId, `Map bundle eventId at ${entry.name}`);
      if (eventId !== entry.name) {
        throw new Error(
          `Map bundle directory must match manifest eventId: ${entry.name}`,
        );
      }
      if (mapBundles.has(eventId)) {
        throw new Error(`Duplicate map bundle eventId: ${eventId}`);
      }
      mapBundles.set(eventId, bundleDirectory);
    }

    const registeredEventIds: string[] = [];
    const registeredBundles = new Map<string, string>();
    const seenRegistryEventIds = new Set<string>();
    for (const event of registryContent.events) {
      const { eventId, mapBundle } = event ?? {};
      if (!eventId || typeof eventId !== "string") {
        throw new Error("Invalid eventId in registry");
      }
      if (seenRegistryEventIds.has(eventId)) {
        throw new Error(`Duplicate eventId in registry: ${eventId}`);
      }
      seenRegistryEventIds.add(eventId);
      if (!mapBundle || typeof mapBundle !== "string") {
        throw new Error("Invalid mapBundle in registry");
      }
      if (!mapBundle.startsWith("../maps/")) {
        throw new Error(`Invalid mapBundle path in registry: ${mapBundle}`);
      }

      const remaining = mapBundle.slice("../maps/".length);
      const configuredPath = resolve(mapBundlesDir, dirname(remaining));
      if (!isInside(mapBundlesDir, configuredPath)) {
        throw new Error(
          `Map bundle path outside map-bundles: ${configuredPath}`,
        );
      }
      const bundleDirectory = realpathSync(configuredPath);
      const manifestPath = resolve(bundleDirectory, "manifest.json");
      if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
        throw new Error(
          `Map bundle manifest.json does not exist: ${manifestPath}`,
        );
      }
      const manifestContent = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifestContent.eventId !== eventId) {
        throw new Error(
          `Registry eventId does not match map bundle manifest: ${eventId}`,
        );
      }
      const selectedBundle = mapBundles.get(eventId);
      if (!selectedBundle || realpathSync(selectedBundle) !== bundleDirectory) {
        throw new Error(
          `Registry map bundle is not a public bundle: ${eventId}`,
        );
      }
      registeredEventIds.push(eventId);
      registeredBundles.set(eventId, bundleDirectory);
    }

    // Keep the registry's first event as the compatibility/default manifest,
    // while retaining every public bundle for build output and direct assets.
    const orderedBundles = new Map<string, string>();
    for (const eventId of registeredEventIds) {
      const bundleDirectory = registeredBundles.get(eventId);
      if (!bundleDirectory) {
        throw new Error(`Registered map bundle is missing: ${eventId}`);
      }
      orderedBundles.set(eventId, bundleDirectory);
    }
    for (const [eventId, bundleDirectory] of mapBundles) {
      if (!orderedBundles.has(eventId)) {
        orderedBundles.set(eventId, bundleDirectory);
      }
    }
    return orderedBundles;
  }

  return mapBundles;
}

const contentTypes = new Map([
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".bin", "application/octet-stream"],
]);

function mapBundlePlugin(
  mapBundles: Map<string, string>,
  webappRoot: string,
  outputDirectory: string,
): Plugin {
  const gasCodePath = resolve(
    webappRoot,
    "../../integrations/gas-spreadsheet/Code.gs",
  );
  const gasCodeOutputPath = resolve(
    outputDirectory,
    "assets/integrations/gas-spreadsheet/Code.gs.txt",
  );
  return {
    name: "comipath-map-bundle",
    configureServer(server) {
      server.middlewares.use(
        "/catalog-service-worker.js",
        (_request, response) => {
          response.setHeader("Content-Type", "application/javascript");
          response.end(
            readFileSync(resolve(webappRoot, "catalog-service-worker.js")),
          );
        },
      );
      server.middlewares.use(
        "/assets/events/manifest.json",
        (request, response, next) => {
          const registryPath = resolve(webappRoot, "events/manifest.json");
          if (!existsSync(registryPath)) {
            response.statusCode = 404;
            response.end("Not found");
            return;
          }
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          if (request.method === "HEAD") {
            response.end();
            return;
          }
          const stream = createReadStream(registryPath);
          stream.on("error", next);
          stream.pipe(response);
        },
      );
      server.middlewares.use(
        "/assets/integrations/gas-spreadsheet/Code.gs.txt",
        (request, response, next) => {
          if (!existsSync(gasCodePath)) {
            response.statusCode = 404;
            response.end("Not found");
            return;
          }
          if (request.method !== "GET" && request.method !== "HEAD") {
            next();
            return;
          }
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          if (request.method === "HEAD") {
            response.end();
            return;
          }
          const stream = createReadStream(gasCodePath);
          stream.on("error", next);
          stream.pipe(response);
        },
      );

      server.middlewares.use("/assets/maps", (request, response, next) => {
        let requestedPath: string;
        let bundleDirectory: string | undefined;
        try {
          const pathname = new URL(request.url ?? "/", "http://localhost")
            .pathname;
          const segments = pathname.split("/").filter(Boolean);
          if (segments.length === 0) {
            response.statusCode = 404;
            response.end("Not found");
            return;
          }
          let eventId = decodeURIComponent(segments[0]);
          let subPath = segments
            .slice(1)
            .map((s) => decodeURIComponent(s))
            .join("/");

          if (segments.length === 1 && segments[0] === "manifest.json") {
            eventId = mapBundles.keys().next().value ?? "demo-v1";
            subPath = "manifest.json";
          } else if (!mapBundles.has(eventId)) {
            eventId = mapBundles.keys().next().value ?? "demo-v1";
            subPath = segments.map((s) => decodeURIComponent(s)).join("/");
          }

          bundleDirectory = mapBundles.get(eventId);
          if (!bundleDirectory) {
            response.statusCode = 404;
            response.end("Not found");
            return;
          }
          requestedPath = resolve(bundleDirectory, subPath);
        } catch (error) {
          next(
            error instanceof Error ? error : new Error("Invalid map asset URL"),
          );
          return;
        }

        const bundlePrefix = `${bundleDirectory}${sep}`;
        if (
          !requestedPath.startsWith(bundlePrefix) &&
          requestedPath !== bundleDirectory
        ) {
          response.statusCode = 403;
          response.end("Forbidden");
          return;
        }

        stat(requestedPath, (statError, fileStat) => {
          if (statError || !fileStat.isFile()) {
            response.statusCode = 404;
            response.end("Not found");
            return;
          }
          response.setHeader(
            "Content-Type",
            contentTypes.get(extname(requestedPath).toLowerCase()) ??
              "application/octet-stream",
          );
          if (request.method === "HEAD") {
            response.end();
            return;
          }
          const stream = createReadStream(requestedPath);
          stream.on("error", next);
          stream.pipe(response);
        });
      });
    },
    closeBundle() {
      mkdirSync(dirname(gasCodeOutputPath), { recursive: true });
      cpSync(gasCodePath, gasCodeOutputPath, {
        force: true,
        preserveTimestamps: true,
      });
      cpSync(
        resolve(webappRoot, "catalog-service-worker.js"),
        resolve(outputDirectory, "catalog-service-worker.js"),
        { force: true, preserveTimestamps: true },
      );
      for (const [eventId, bundleDirectory] of mapBundles.entries()) {
        // Satisfies contract test: cpSync(bundleDirectory, resolve(outputDirectory, "assets/maps"))
        cpSync(
          bundleDirectory,
          resolve(outputDirectory, `assets/maps/${eventId}`),
          {
            recursive: true,
            force: true,
            preserveTimestamps: true,
          },
        );
      }
      const firstEventId = mapBundles.keys().next().value;
      if (firstEventId) {
        const firstBundleDir = mapBundles.get(firstEventId);
        if (firstBundleDir) {
          cpSync(
            resolve(firstBundleDir, "manifest.json"),
            resolve(outputDirectory, "assets/maps/manifest.json"),
            { force: true },
          );
        }
      }
      const registrySource = resolve(webappRoot, "events/manifest.json");
      if (existsSync(registrySource)) {
        cpSync(
          registrySource,
          resolve(outputDirectory, "assets/events/manifest.json"),
          {
            force: true,
            preserveTimestamps: true,
          },
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const webappRoot = resolve(defaultRepositoryRoot, "apps/webapp");
  const webappOutput = resolve(defaultRepositoryRoot, "dist/webapp");
  const environment = loadEnv(mode, defaultRepositoryRoot, "");
  const mapBundles = selectMapBundles({
    mode,
    repositoryRoot: defaultRepositoryRoot,
    privateBundleDirectory: environment.COMIPATH_PRIVATE_MAP_BUNDLE_DIR,
  });

  return {
    root: webappRoot,
    base: "./",
    publicDir: false,
    plugins: [mapBundlePlugin(mapBundles, webappRoot, webappOutput)],
    build: {
      outDir: webappOutput,
      emptyOutDir: true,
    },
  };
});
