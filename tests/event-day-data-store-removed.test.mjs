import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "vitest";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("production event-day wiring does not depend on EventDayDataStore", () => {
  assert.equal(
    existsSync(new URL("../apps/webapp/js/event-day-data-store.ts", import.meta.url)),
    false,
  );
  const runtime = read("apps/webapp/js/comipath-browser-runtime.js");
  const assembly = read("apps/webapp/js/app/assemble-comipath-application.ts");
  assert.doesNotMatch(runtime, /EventDayDataStore|DataManagerOptions/);
  assert.doesNotMatch(assembly, /EventDayDataStore|DataManagerOptions/);
});
