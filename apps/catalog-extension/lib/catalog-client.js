function asHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("画像URLが不正です。");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("画像URLはHTTP(S)にしてください。");
  }
  return url.href;
}

function asAccountUrl(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error("Twitter URLが不正です。");
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    (hostname !== "twitter.com" && hostname !== "x.com") ||
    url.pathname.length <= 1 ||
    /^\/intent\//i.test(url.pathname)
  ) {
    throw new Error("Twitter URLが不正です。");
  }
  return url.href;
}

export function normalizeSettings(settings) {
  const gasUrl =
    typeof settings?.gasUrl === "string" ? settings.gasUrl.trim() : "";
  const sheetName =
    typeof settings?.sheetName === "string" ? settings.sheetName.trim() : "";
  let url;
  try {
    url = new URL(gasUrl);
  } catch {
    throw new Error("GAS Web App URLが不正です。");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error("GAS Web App URLはHTTPSの/exec URLにしてください。");
  }
  if (!sheetName) throw new Error("シート名を入力してください。");
  return { gasUrl, sheetName };
}

export function buildCatalogRequest(settings, payload) {
  const normalized = normalizeSettings(settings);
  const space = typeof payload?.space === "string" ? payload.space.trim() : "";
  if (!space) throw new Error("スペースを取得できませんでした。");
  const tweet = asHttpUrl(payload?.tweet || "");
  const account = asAccountUrl(payload?.account);
  const body = {
    action: "upsertCatalog",
    sheetName: normalized.sheetName,
    space,
  };
  if (account) body.account = account;
  body.tweet = tweet;
  return {
    url: normalized.gasUrl,
    body,
  };
}

export async function sendCatalog(settings, payload, fetchImpl = fetch) {
  const request = buildCatalogRequest(settings, payload);
  let response;
  try {
    response = await fetchImpl(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
    });
  } catch {
    return { ok: false, message: "GAS通信に失敗しました" };
  }
  if (!response.ok) return { ok: false, message: "GAS通信に失敗しました" };

  let result;
  try {
    result = await response.json();
  } catch {
    return { ok: false, message: "GASから不正な応答を受け取りました" };
  }
  if (!result?.ok) {
    return {
      ok: false,
      message:
        typeof result?.message === "string"
          ? result.message
          : "GAS側で保存できませんでした",
    };
  }
  return { ok: true, message: `${request.body.space}を保存しました` };
}
