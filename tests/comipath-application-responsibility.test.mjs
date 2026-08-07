import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("keeps the application shell below 200 physical lines", () => {
  const lines = readFileSync(
    "apps/webapp/js/app/comipath-application.ts",
    "utf8",
  ).split("\n");

  assert.ok(
    lines.length <= 200,
    `comipath-application.ts has ${lines.length} lines, expected <= 200`,
  );
});
