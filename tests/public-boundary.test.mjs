import assert from "node:assert/strict";
import { test } from "vitest";
import { auditPublicTree } from "../scripts/audit-public-tree.mjs";

test("tracked public tree excludes private projects and credentials", () => {
  const result = auditPublicTree(new URL("../", import.meta.url));
  assert.ok(result.files.includes("apps/webapp/index.html"));
  assert.ok(
    result.files.includes("apps/webapp/map-bundles/demo-v1/manifest.json"),
  );
});
