import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "vitest";

test("removes all legacy application files", () => {
  for (const removedFacade of [
    "apps/webapp/js/comipath-browser-runtime.js",
    "apps/webapp/js/event-day-data-store.ts",
    "apps/webapp/js/comipath-dom-coordinator.js",
  ]) {
    assert.equal(existsSync(removedFacade), false);
  }
  assert.equal(existsSync("apps/webapp/js/app.js"), false);
  assert.equal(existsSync("apps/webapp/js/data-manager.ts"), false);
  assert.equal(existsSync("apps/webapp/js/ui-manager.js"), false);
  assert.equal(existsSync("apps/webapp/js/config.ts"), false);
  assert.equal(existsSync("apps/webapp/js/types/domain.ts"), false);
  assert.equal(existsSync("apps/webapp/js/types/boundary-parsers.ts"), false);
  assert.equal(
    existsSync("scripts/webapp-architecture-legacy-allowlist.json"),
    false,
  );
  assert.equal(
    existsSync("apps/webapp/js/data/gas-refresh-service.ts"),
    false,
  );
  assert.equal(
    existsSync("apps/webapp/js/state/source-settings-service.ts"),
    false,
  );
  assert.equal(
    existsSync("apps/webapp/js/ui/management-session.ts"),
    false,
  );
  assert.equal(
    existsSync("apps/webapp/js/ui/csv-download.ts"),
    false,
  );
  const assembly = readFileSync(
    "apps/webapp/js/app/assemble-comipath-application.ts",
    "utf8",
  );
  assert.doesNotMatch(assembly, /comipath-browser-runtime|event-day-data-store|comipath-dom-coordinator/);
  assert.doesNotMatch(assembly, /(?:navigation|routing)\/route-planner/);
});
