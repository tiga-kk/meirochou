import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../apps/catalog-extension/lib/catalog-shortcut.js", import.meta.url),
  "utf8",
);

function shortcut() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.ComiPathCatalogShortcut;
}

test("recognizes Option+S by physical key and ignores editable fields", () => {
  const { isSendShortcut } = shortcut();
  assert.equal(
    isSendShortcut({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      code: "KeyS",
    }),
    true,
  );
  assert.equal(
    isSendShortcut({
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      code: "KeyS",
    }),
    false,
  );
});
