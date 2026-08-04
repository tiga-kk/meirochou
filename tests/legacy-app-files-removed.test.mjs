import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "vitest";

test("removes all legacy application files", () => {
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
});
