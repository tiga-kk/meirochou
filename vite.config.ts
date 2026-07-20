import {
  cpSync,
  createReadStream,
  existsSync,
  readdirSync,
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

/** Select and validate the only map bundle exposed by the current Vite mode. */
export function selectMapBundleDirectory(
  options: MapBundleSelectionOptions,
): string {
  const configuredDirectory =
    options.mode === "private"
      ? options.privateBundleDirectory?.trim()
      : resolve(options.repositoryRoot, "apps/webapp/map-bundles/demo-v1");

  if (!configuredDirectory) {
    throw new Error(
      "COMIPATH_PRIVATE_MAP_BUNDLE_DIR is required in private mode",
    );
  }

  const configuredPath = resolve(configuredDirectory);
  if (!existsSync(configuredPath) || !statSync(configuredPath).isDirectory()) {
    throw new Error(`Map bundle directory does not exist: ${configuredPath}`);
  }
  const bundleDirectory = realpathSync(configuredPath);
  const manifestPath = resolve(bundleDirectory, "manifest.json");
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new Error(`Map bundle manifest.json does not exist: ${manifestPath}`);
  }
  if (
    options.mode === "private" &&
    isInside(realpathSync(options.repositoryRoot), bundleDirectory)
  ) {
    throw new Error("Private map bundle must be stored outside the repository");
  }
  assertNoSymbolicLinks(bundleDirectory);
  return bundleDirectory;
}

const contentTypes = new Map([
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".bin", "application/octet-stream"],
]);

function mapBundlePlugin(
  bundleDirectory: string,
  outputDirectory: string,
): Plugin {
  const bundlePrefix = `${bundleDirectory}${sep}`;
  return {
    name: "comipath-map-bundle",
    configureServer(server) {
      server.middlewares.use("/assets/maps", (request, response, next) => {
        let requestedPath: string;
        try {
          const pathname = new URL(request.url ?? "/", "http://localhost")
            .pathname;
          requestedPath = resolve(
            bundleDirectory,
            decodeURIComponent(pathname).replace(/^\/+/, ""),
          );
        } catch (error) {
          next(
            error instanceof Error ? error : new Error("Invalid map asset URL"),
          );
          return;
        }
        if (!requestedPath.startsWith(bundlePrefix)) {
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
      cpSync(bundleDirectory, resolve(outputDirectory, "assets/maps"), {
        recursive: true,
        force: true,
        preserveTimestamps: true,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const webappRoot = resolve(defaultRepositoryRoot, "apps/webapp");
  const webappOutput = resolve(defaultRepositoryRoot, "dist/webapp");
  const environment = loadEnv(mode, defaultRepositoryRoot, "");
  const bundleDirectory = selectMapBundleDirectory({
    mode,
    repositoryRoot: defaultRepositoryRoot,
    privateBundleDirectory: environment.COMIPATH_PRIVATE_MAP_BUNDLE_DIR,
  });

  return {
    root: webappRoot,
    base: "./",
    publicDir: false,
    plugins: [mapBundlePlugin(bundleDirectory, webappOutput)],
    build: {
      outDir: webappOutput,
      emptyOutDir: true,
    },
  };
});
