import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanWebappArchitecture } from "../scripts/check-webapp-architecture.mjs";

const temporaryDirectories = [];

function scanFixture(files, options = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "comipath-architecture-"));
  temporaryDirectories.push(rootDir);
  for (const [relativePath, source] of Object.entries(files)) {
    const target = join(rootDir, relativePath);
    const directory = target.slice(0, target.lastIndexOf("/"));
    mkdirSync(directory, { recursive: true });
    writeFileSync(target, source, "utf8");
  }
  return scanWebappArchitecture({ rootDir, sourceRoot: rootDir, ...options });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("webapp architecture boundaries", () => {
  it("rejects a use case import from infrastructure", () => {
    const result = scanFixture({
      "features/route-guidance/use-cases/bad.ts":
        'import "../infrastructure/web-worker-route-optimizer";',
    });

    expect(result.violations.map((item) => item.ruleId)).toContain(
      "use-case-imports-infrastructure",
    );
  });

  it("rejects use cases importing concrete storage modules directly", () => {
    const result = scanFixture({
      "features/example/use-cases/read.ts":
        'import { StorageService } from "../../../state/storage-service";',
    });

    expect(result.violations.map((item) => item.ruleId)).toContain(
      "use-case-imports-concrete-module",
    );
  });

  it("rejects a use case import outside the allowed dependency directories", () => {
    const result = scanFixture({
      "features/example/use-cases/read.ts":
        'import { parse } from "../../../data/legacy-parser";',
    });

    expect(result.violations.map((item) => item.ruleId)).toContain(
      "use-case-imports-concrete-module",
    );
  });

  it("rejects public API exporting concrete infrastructure", () => {
    const result = scanFixture({
      "features/example/public-api.ts":
        'export { LocalStorageExampleRepository } from "./infrastructure/local-storage-example-repository";',
    });

    expect(result.violations.map((item) => item.ruleId)).toContain(
      "public-api-exports-concrete-infrastructure",
    );
  });

  it("rejects concrete infrastructure names even when the path is generic", () => {
    const result = scanFixture({
      "features/example/public-api.ts":
        'export { LocalStorageExampleRepository } from "./repository";',
    });

    expect(result.violations.map((item) => item.ruleId)).toContain(
      "public-api-exports-concrete-infrastructure",
    );
  });

  it("rejects vague new names", () => {
    const result = scanFixture({
      "features/event-day/use-cases/event-day-manager.ts":
        "export class EventDayManager {}",
    });

    expect(result.violations.map((item) => item.ruleId)).toContain(
      "vague-name",
    );
  });

  it("allows a cross-feature public api import", () => {
    const result = scanFixture({
      "features/event-day/use-cases/switch-event-day.ts":
        'import type { CircleStatus } from "../../circle-status/public-api";',
    });

    expect(result.violations).toEqual([]);
  });

  it("rejects cross-feature deep imports", () => {
    const result = scanFixture({
      "features/event-day/use-cases/switch-event-day.ts":
        'import { ChangeCircleStatus } from "../../circle-status/use-cases/change-circle-status";',
    });

    expect(result.violations.map((item) => item.ruleId)).toContain(
      "cross-feature-deep-import",
    );
  });

  it("rejects non-literal dynamic imports", () => {
    const result = scanFixture({
      "features/route-guidance/ui/load-screen.ts":
        "const moduleName = './route-guidance-screen-model'; import(moduleName);",
    });

    expect(result.violations.map((item) => item.ruleId)).toContain(
      "non-literal-dynamic-import",
    );
  });

  it("scans export-from and literal dynamic imports", () => {
    const result = scanFixture({
      "features/event-day/use-cases/exported.ts":
        'export { x } from "../../circle-status/private"; void import("../../circle-status/private");',
    });

    expect(result.imports.map((item) => item.kind)).toEqual([
      "static",
      "dynamic-literal",
    ]);
    expect(result.violations.map((item) => item.ruleId)).toContain(
      "cross-feature-deep-import",
    );
  });

  it("rejects browser APIs and shared browser imports from a domain without imports", () => {
    const result = scanFixture({
      "features/event-day/domain/state.ts":
        "const storage = localStorage; void document;",
      "features/event-day/domain/clock.ts":
        'import { browserClock } from "../../../shared/browser/browser-clock";',
      "features/event-day/domain/ui.ts":
        'import { notify } from "../../../shared/ui/user-notification";',
    });

    expect(
      result.violations.filter(
        (item) => item.ruleId === "domain-imports-browser",
      ),
    ).toHaveLength(3);
  });

  it("checks browser tokens case-insensitively even when there are no imports", () => {
    const result = scanFixture({
      "features/event-day/domain/state.ts":
        "const storage = LocalStorage; const element = HTMLElement;",
    });
    expect(result.violations.map((item) => item.ruleId)).toContain(
      "domain-imports-browser",
    );
  });

  it("ignores import-looking text inside strings and templates", () => {
    const result = scanFixture({
      "features/event-day/use-cases/read.ts":
        'const text = "import x from \\"../../circle-status/private\\""; const template = `import("../../circle-status/private")`;',
    });

    expect(result.imports).toEqual([]);
    expect(result.violations).toEqual([]);
  });

  it("does not reject a composition root because of its length", () => {
    const longApplication = `${"const line = 1;\n".repeat(201)}export class ComipathApplication {}`;
    const result = scanFixture({ "app/comipath-application.ts": longApplication });
    expect(result.violations).toEqual([]);
  });

  it("reports duplicate, wildcard, stale, and malformed allowlist entries in a focused fixture", () => {
    const allowlistDirectory = mkdtempSync(
      join(tmpdir(), "comipath-allowlist-duplicates-"),
    );
    const allowlistPath = join(allowlistDirectory, "allowlist.json");
    writeFileSync(
      allowlistPath,
      JSON.stringify([
        {
          ruleId: "domain-imports-browser",
          importer: "features/event-day/domain/state.ts",
          imported: null,
        },
        {
          ruleId: "domain-imports-browser",
          importer: "features/event-day/domain/state.ts",
          imported: null,
        },
        {
          ruleId: "domain-imports-browser",
          importer: "features/*/domain/state.ts",
          imported: null,
        },
        {
          ruleId: "domain-imports-browser",
          importer: "features/event-day/domain/missing.ts",
          imported: null,
        },
        {
          ruleId: "domain-imports-browser",
          importer: "features/event-day/domain/state.ts",
          imported: null,
          message: "extra fields are not part of the allowlist contract",
        },
      ]),
      "utf8",
    );

    const result = scanFixture(
      {
        "features/event-day/domain/state.ts": "const storage = localStorage;",
      },
      { allowlistPath },
    );
    const allowlistViolations = result.violations.filter((item) =>
      [
        "duplicate-allowlist-entry",
        "invalid-allowlist-entry",
        "stale-allowlist-entry",
      ].includes(item.ruleId),
    );

    expect(allowlistViolations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "duplicate-allowlist-entry",
          importer: "features/event-day/domain/state.ts",
          imported: null,
        }),
        expect.objectContaining({
          ruleId: "invalid-allowlist-entry",
          importer: "features/*/domain/state.ts",
          imported: null,
        }),
        expect.objectContaining({
          ruleId: "invalid-allowlist-entry",
          importer: "features/event-day/domain/state.ts",
          imported: null,
        }),
        expect.objectContaining({
          ruleId: "stale-allowlist-entry",
          importer: "features/event-day/domain/missing.ts",
          imported: null,
        }),
      ]),
    );
    expect(
      allowlistViolations.some(
        (item) => item.ruleId === "domain-imports-browser",
      ),
    ).toBe(false);
  });

  it("rejects composition-root responsibilities beyond assembly", () => {
    const result = scanFixture({
      "app/comipath-application.ts":
        "export const app = { routePlanner: true, csvCircleCodec: true, storageSchema: true, gasProtocol: true };",
    });
    expect(
      result.violations.filter(
        (item) => item.ruleId === "application-imports-forbidden-concern",
      ),
    ).toHaveLength(4);
  });

  it("rejects concrete infrastructure APIs from app binders", () => {
    const result = scanFixture({
      "app/bind-route-guidance-events.ts": `
        import { LocalStorageDistanceMatrixRepository } from "../features/route-guidance/infrastructure/local-storage-distance-matrix-repository";
        import { MatrixRepository } from "../features/route-guidance/repository";
        import { OptimizerClient } from "../features/route-guidance/client";
        import { RouteMapAssetsLoader } from "../features/route-guidance/loader";
        import { RouteOptimizer } from "../features/route-guidance/optimizer";
        const storage = localStorage;
        const worker = new Worker("optimizer.js");
        void LocalStorageDistanceMatrixRepository;
        void MatrixRepository;
        void OptimizerClient;
        void RouteMapAssetsLoader;
        void RouteOptimizer;
        void storage;
        void worker;
      `,
    });

    expect(
      result.violations.filter(
        (item) => item.ruleId === "application-imports-concrete-infrastructure",
      ),
    ).toHaveLength(7);
  });

  it("keeps browser-application runtime imports outside the binder guardrail", () => {
    const result = scanFixture({
      "app/browser-application.ts":
        'import { HttpRouteMapAssetsLoader } from "../features/route-guidance/infrastructure/http-route-map-assets-loader";',
    });

    expect(result.violations).toEqual([]);
  });

  it("allows DOM listeners and feature public APIs from app binders", () => {
    const result = scanFixture({
      "features/route-guidance/public-api.ts":
        "export type RouteGuidanceAction = () => void;",
      "app/bind-route-guidance-events.ts": `
        import type { RouteGuidanceAction } from "../features/route-guidance/public-api";
        export function bind(document: Document, action: RouteGuidanceAction) {
          document.addEventListener("click", action);
        }
      `,
    });

    expect(result.violations).toEqual([]);
  });
});
