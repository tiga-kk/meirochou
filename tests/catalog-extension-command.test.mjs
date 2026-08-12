import assert from "node:assert/strict";
import { test } from "node:test";
import { sendActiveCatalog } from "../apps/catalog-extension/lib/catalog-command.js";

test("shortcut sends the active tab catalog payload through the existing sender", async () => {
  const calls = [];
  const result = await sendActiveCatalog({
    tabId: 42,
    sendTabMessage: async (tabId, message) => {
      calls.push(["extract", tabId, message]);
      return {
        ok: true,
        payload: {
          space: "東ア01a",
          tweet: "https://example.test/catalog.jpg",
        },
      };
    },
    sendCatalogPayload: async (payload) => {
      calls.push(["send", payload]);
      return { ok: true, message: "東ア01aを保存しました" };
    },
  });

  assert.deepEqual(result, { ok: true, message: "東ア01aを保存しました" });
  assert.deepEqual(calls, [
    ["extract", 42, { type: "COMIPATH_EXTRACT_CATALOG" }],
    ["send", { space: "東ア01a", tweet: "https://example.test/catalog.jpg" }],
  ]);
});

test("shortcut does not send when the active tab has no catalog payload", async () => {
  let sendCount = 0;
  const result = await sendActiveCatalog({
    tabId: 42,
    sendTabMessage: async () => ({ ok: false }),
    sendCatalogPayload: async () => {
      sendCount += 1;
      return { ok: true };
    },
  });

  assert.deepEqual(result, {
    ok: false,
    message: "対応するカタログページを開いてください",
  });
  assert.equal(sendCount, 0);
});
