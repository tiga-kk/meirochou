import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCatalogRequest,
  buildProbeRequest,
  normalizeSettings,
  sendCatalog,
  sendProbe,
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

test("builds the side-effect-free probe request with only a GAS URL", () => {
  assert.deepEqual(buildProbeRequest({ gasUrl: settings.gasUrl }), {
    url: settings.gasUrl,
    body: { action: "probe" },
  });
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

test("sends a Pixiv profile URL as the shared account field", async () => {
  let request;
  const result = await sendCatalog(
    settings,
    {
      space: "東ア01a",
      account: "https://www.pixiv.net/users/123",
    },
    async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({ ok: true, status: "success" }),
      };
    },
  );

  assert.equal(result.ok, true);
  assert.equal(request.url, settings.gasUrl);
  assert.equal(
    request.options.body,
    JSON.stringify({
      action: "upsertCatalog",
      sheetName: "day1",
      space: "東ア01a",
      account: "https://www.pixiv.net/users/123",
    }),
  );
});

test("rejects Pixiv artwork, search, and non-HTTP(S) URLs as accounts", () => {
  for (const account of [
    "https://www.pixiv.net/artworks/123",
    "https://www.pixiv.net/search.php?word=circle",
    "javascript:alert(1)",
  ]) {
    assert.throws(
      () =>
        buildCatalogRequest(settings, {
          space: "東ア01a",
          account,
        }),
      /Twitter\/XまたはPixiv URLが不正です。/,
    );
  }
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
      redirect: "follow",
    },
  });
  assert.deepEqual(result, {
    ok: true,
    status: "success",
    kind: "catalog",
    message: "東ア01aを保存しました",
  });
});

test("probe follows redirects and returns the safe probe contract", async () => {
  let request;
  const result = await sendProbe(settings, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      redirected: true,
      json: async () => ({ ok: true, status: "success", kind: "probe" }),
    };
  });

  assert.equal(request.url, settings.gasUrl);
  assert.equal(request.options.redirect, "follow");
  assert.equal(request.options.body, JSON.stringify({ action: "probe" }));
  assert.deepEqual(result, {
    ok: true,
    status: "success",
    kind: "probe",
    message: "GAS接続を確認しました",
  });
});

test("classifies URL, network, HTTP, non-JSON, and GAS errors without raw details", async () => {
  assert.deepEqual(
    await sendProbe({ gasUrl: "not-a-url" }, async () => {
      throw new Error("should not fetch");
    }),
    {
      ok: false,
      kind: "invalid-url",
      message: "GAS Web App URLが不正です。",
    },
  );

  const network = await sendCatalog(
    settings,
    {
      space: "東ア01a",
      account: "https://twitter.com/mignon",
      tweet: "https://example.invalid/catalog.jpg",
    },
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
  );
  assert.deepEqual(network, {
    ok: false,
    kind: "http",
    message: "GAS通信に失敗しました（HTTP 503）",
  });

  const fetchFailure = await sendCatalog(
    settings,
    {
      space: "東ア01a",
      account: "https://twitter.com/mignon",
    },
    async () => {
      throw new Error("Failed to fetch");
    },
  );
  assert.deepEqual(fetchFailure, {
    ok: false,
    kind: "network",
    message: "GASへの接続に失敗しました。",
  });

  const httpError = await sendCatalog(
    settings,
    {
      space: "東ア01a",
      account: "https://twitter.com/mignon",
    },
    async () => ({ ok: false, status: 403 }),
  );
  assert.deepEqual(httpError, {
    ok: false,
    kind: "http",
    message: "GAS通信に失敗しました（HTTP 403）",
  });

  const html = await sendProbe(settings, async () => ({
    ok: true,
    text: async () => "<html>secret HTML</html>",
    json: async () => {
      throw new Error("Unexpected token < in JSON");
    },
  }));
  assert.deepEqual(html, {
    ok: false,
    kind: "non-json",
    message: "GASからJSONではない応答を受け取りました。",
  });

  const gasError = await sendCatalog(
    settings,
    {
      space: "東ア01a",
      account: "https://twitter.com/mignon",
      tweet: "https://example.invalid/catalog.jpg",
    },
    async () => ({
      ok: true,
      json: async () => ({
        ok: false,
        message: "credential and personal data should not be shown",
      }),
    }),
  );
  assert.deepEqual(gasError, {
    ok: false,
    kind: "gas-error",
    message: "GAS側で保存できませんでした。",
  });

  const catalogStatusError = await sendCatalog(
    settings,
    {
      space: "東ア01a",
      account: "https://twitter.com/mignon",
      tweet: "https://example.invalid/catalog.jpg",
    },
    async () => ({
      ok: true,
      json: async () => ({ ok: true, status: "error" }),
    }),
  );
  assert.deepEqual(catalogStatusError, {
    ok: false,
    kind: "gas-error",
    message: "GAS側で保存できませんでした。",
  });
});
