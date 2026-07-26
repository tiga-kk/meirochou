import assert from "node:assert/strict";
import { test } from "vitest";
import { createBenchmarkStartSpace } from "../scripts/benchmark-c108-routing.mjs";

test("benchmark start space uses the configured area prefix and point label", () => {
  assert.equal(
    createBenchmarkStartSpace(
      { displayName: "東456ホール" },
      { identifier: "ア", number: "71" },
    ),
    "東ア71",
  );
  assert.equal(
    createBenchmarkStartSpace(
      { displayName: "南12ホール" },
      { identifier: "a", number: 8 },
    ),
    "南a8",
  );
});
