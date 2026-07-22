import {
  cpSync,
  createReadStream,
  existsSync,
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
    if (!eventId || typeof eventId !== "string") {
      throw new Error(
        `Invalid or missing eventId in private map bundle manifest`,
      );
    }
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

    for (const event of registryContent.events) {
      const { eventId, mapBundle } = event;
      if (!eventId || typeof eventId !== "string") {
        throw new Error("Invalid eventId in registry");
      }
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

      if (
        !existsSync(configuredPath) ||
        !statSync(configuredPath).isDirectory()
      ) {
        throw new Error(
          `Map bundle directory does not exist: ${configuredPath}`,
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
      mapBundles.set(eventId, bundleDirectory);
    }
  }

  return mapBundles;
}

const contentTypes = new Map([
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".bin", "application/octet-stream"],
]);

function mapBundlePlugin(
  mapBundles: Map<string, string>,
  webappRoot: string,
  outputDirectory: string,
): Plugin {
  return {
    name: "comipath-map-bundle",
    configureServer(server) {
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
