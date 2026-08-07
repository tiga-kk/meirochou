import { expect, test } from "vitest";
import { scanWebappArchitecture } from "../scripts/check-webapp-architecture.mjs";

test("route guidance modules do not depend on legacy route paths or event-day contracts", () => {
  const result = scanWebappArchitecture({ rootDir: "." });
  const routeImports = result.imports.filter(
    ({ importer }) =>
      importer.startsWith("apps/webapp/js/") &&
      importer.includes("features/route-guidance/"),
  );
  const productionImports = result.imports.filter(({ importer }) =>
    importer.startsWith("apps/webapp/js/"),
  );
  const legacyRouteImport =
    /^(?:\.\.\/|\.\/)*(?:route-planner|tsp-solver|navigation\/(?:optimization-input-adapter|map-session|start-selection)|routing\/(?:distance-matrix|alns|time-decayed))/;

  expect(
    productionImports.filter(({ imported }) =>
      legacyRouteImport.test(imported ?? ""),
    ),
  ).toEqual([]);
  expect(
    routeImports.filter(({ imported }) =>
      imported?.includes(
        "features/event-day/domain/application-contract-types",
      ),
    ),
  ).toEqual([]);
});
