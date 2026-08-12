import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

test("background probe and catalog messages use the configured shared POST transport", async () => {
  const listeners = [];
  const requests = [];
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  globalThis.chrome = {
    storage: {
      sync: {
        get(_defaults, callback) {
          callback({
            gasUrl: "https://script.google.com/macros/s/example-id/exec",
            sheetName: "day1",
          });
        },
      },
    },
    runtime: {
      lastError: null,
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
    },
    tabs: { sendMessage() {} },
    commands: { onCommand: { addListener() {} } },
    action: { setBadgeText() {} },
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () =>
        body.action === "probe"
          ? { ok: true, status: "success", kind: "probe" }
          : { ok: true, status: "success" },
    };
  };

  try {
    await import(`../apps/catalog-extension/background.js?test=${Date.now()}`);
    assert.equal(listeners.length, 2);

    const send = (message) =>
      new Promise((resolve) => {
        const keepAlive = listeners[0](message, {}, resolve);
        assert.equal(keepAlive, true);
      });

    const probe = await send({ type: "COMIPATH_PROBE_GAS" });
    const draftProbe = await send({
      type: "COMIPATH_PROBE_GAS",
      payload: {
        gasUrl: "https://script.google.com/macros/s/draft-id/exec",
        sheetName: "draft-day",
      },
    });
    const catalog = await send({
      type: "COMIPATH_SEND_CATALOG",
      payload: { space: "東A01a" },
    });

    assert.equal(probe.ok, true);
    assert.equal(probe.kind, "probe");
    assert.equal(draftProbe.ok, true);
    assert.equal(catalog.ok, true);
    assert.equal(catalog.kind, "catalog");
    assert.deepEqual(
      requests.map(({ url, options }) => ({
        url,
        method: options.method,
        headers: options.headers,
      })),
      [
        {
          url: "https://script.google.com/macros/s/example-id/exec",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
        {
          url: "https://script.google.com/macros/s/draft-id/exec",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
        {
          url: "https://script.google.com/macros/s/example-id/exec",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      ],
    );
    assert.equal(JSON.parse(requests[0].options.body).action, "probe");
    assert.equal(JSON.parse(requests[1].options.body).action, "probe");
    assert.equal(JSON.parse(requests[2].options.body).action, "upsertCatalog");
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test("options connection button calls the background probe message", () => {
  const source = readFileSync(
    new URL("../apps/catalog-extension/options.js", import.meta.url),
    "utf8",
  ).replace(/^import .*\n/, "");
  const elements = new Map(
    [
      "#settings-form",
      "#gas-url",
      "#sheet-name",
      "#check-connection",
      "#status",
    ].map((selector) => [
      selector,
      { value: "", textContent: "", listeners: {} },
    ]),
  );
  for (const element of elements.values()) {
    element.addEventListener = (type, listener) => {
      element.listeners[type] = listener;
    };
  }
  const messages = [];
  const context = {
    document: { querySelector: (selector) => elements.get(selector) },
    chrome: {
      storage: {
        sync: {
          get(_defaults, callback) {
            callback({
              gasUrl: "https://script.google.com/macros/s/id/exec",
              sheetName: "day1",
            });
          },
        },
      },
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          callback({
            ok: true,
            kind: "probe",
            message: "GAS接続を確認しました",
          });
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  elements.get("#gas-url").value =
    "https://script.google.com/macros/s/draft-id/exec";
  elements.get("#sheet-name").value = "draft-day";
  elements.get("#check-connection").listeners.click({
    preventDefault() {},
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "COMIPATH_PROBE_GAS");
  assert.equal(messages[0].payload.gasUrl, "https://script.google.com/macros/s/draft-id/exec");
  assert.equal(messages[0].payload.sheetName, "draft-day");
  assert.equal(elements.get("#status").textContent, "GAS接続を確認しました");
});
