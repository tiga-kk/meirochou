import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "vitest";
import { buildPublicGas } from "../scripts/build-public-gas.mjs";

test("buildPublicGas output matches the actual tracked Code.gs file", () => {
  const rootUrl = new URL("../", import.meta.url);
  const codePath = new URL("integrations/gas-spreadsheet/Code.gs", rootUrl);

  const generated = buildPublicGas({ repositoryRoot: rootUrl });

  assert.ok(existsSync(codePath), "Code.gs should exist");
  const actual = readFileSync(codePath, "utf8");

  assert.equal(generated, actual);
});
