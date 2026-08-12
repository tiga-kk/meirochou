import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCatalogRequest,
  normalizeSettings,
  sendCatalog,
} from "../apps/catalog-extension/lib/catalog-client.js";

const settings = {
  gasUrl: "https://script.google.com/macros/s/example-id/exec",
  sheetName: "day1",
};

test("builds the exact upsertCatalog request body", () => {
  assert.deepEqual(
    buildCatalogRequest(settings, {
      space: " 東ア01a ",
      account: "https://twitter.com/mignon",
      tweet: "https://catalog.youyou.co.jp/images/catalog.jpg",
    }),
    {
      url: settings.gasUrl,
      body: {
        action: "upsertCatalog",
        sheetName: "day1",
        space: "東ア01a",
        account: "https://twitter.com/mignon",
        tweet: "https://catalog.youyou.co.jp/images/catalog.jpg",
      },
    },
  );
});

test("does not add a tweet field when the catalog page has no tweet URL", () => {
  assert.deepEqual(
    buildCatalogRequest(settings, {
      space: "東ア01a",
      account: "https://twitter.com/mignon",
    }).body,
    {
      action: "upsertCatalog",
      sheetName: "day1",
      space: "東ア01a",
      account: "https://twitter.com/mignon",
    },
  );
});

test("validates GAS URL and sheet settings", () => {
  assert.deepEqual(normalizeSettings(settings), settings);
  assert.throws(
    () =>
      normalizeSettings({
        ...settings,
        gasUrl: "http://script.google.com/macros/s/id/exec",
      }),
    /HTTPS/,
  );
  assert.throws(
    () => normalizeSettings({ ...settings, sheetName: "  " }),
    /シート/,
  );
});

test("sends exact JSON and returns a safe success message", async () => {
  let request;
  const result = await sendCatalog(
    settings,
    {
      space: "東ア01a",
      account: "https://twitter.com/mignon",
      tweet: "https://example.invalid/catalog.jpg",
    },
    async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          ok: true,
          status: "success",
          stored: { space: "東ア01a" },
        }),
      };
    },
  );

  assert.deepEqual(request, {
    url: settings.gasUrl,
    options: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsertCatalog",
        sheetName: "day1",
        space: "東ア01a",
        account: "https://twitter.com/mignon",
        tweet: "https://example.invalid/catalog.jpg",
      }),
    },
  });
  assert.deepEqual(result, { ok: true, message: "東ア01aを保存しました" });
});

test("distinguishes network and GAS response errors without exposing raw HTML", async () => {
  const network = await sendCatalog(
    settings,
    {
      space: "東ア01a",
      account: "https://twitter.com/mignon",
      tweet: "https://example.invalid/catalog.jpg",
    },
    async () => ({ ok: false, json: async () => ({}) }),
  );
  assert.deepEqual(network, { ok: false, message: "GAS通信に失敗しました" });

  const gasError = await sendCatalog(
    settings,
    {
      space: "東ア01a",
      account: "https://twitter.com/mignon",
      tweet: "https://example.invalid/catalog.jpg",
    },
    async () => ({
      ok: true,
      json: async () => ({ ok: false, message: "bad sheet" }),
    }),
  );
  assert.deepEqual(gasError, { ok: false, message: "bad sheet" });
});
