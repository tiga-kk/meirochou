function asHttpUrl(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw clientError("画像URLが不正です。", "invalid-input");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw clientError("画像URLはHTTP(S)にしてください。", "invalid-input");
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
    throw clientError("Twitter/XまたはPixiv URLが不正です。", "invalid-input");
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    (hostname !== "twitter.com" &&
      hostname !== "x.com" &&
      hostname !== "pixiv.net") ||
    (hostname === "pixiv.net"
      ? !/^\/users\/[^/]+(?:\/|$)/i.test(url.pathname)
      : url.pathname.length <= 1 || /^\/intent\//i.test(url.pathname))
  ) {
    throw clientError("Twitter/XまたはPixiv URLが不正です。", "invalid-input");
  }
  return url.href;
}

function clientError(message, kind) {
  const error = new Error(message);
  error.kind = kind;
  return error;
}

function normalizeGasUrl(value) {
  const gasUrl = typeof value === "string" ? value.trim() : "";
  let url;
  try {
    url = new URL(gasUrl);
  } catch {
    throw clientError("GAS Web App URLが不正です。", "invalid-url");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw clientError(
      "GAS Web App URLはHTTPSの/exec URLにしてください。",
      "invalid-url",
    );
  }
  return gasUrl;
}

export function normalizeSettings(settings) {
  const gasUrl = normalizeGasUrl(settings?.gasUrl);
  const sheetName =
    typeof settings?.sheetName === "string" ? settings.sheetName.trim() : "";
  if (!sheetName) {
    throw clientError("シート名を入力してください。", "invalid-settings");
  }
  return { gasUrl, sheetName };
}

export function buildCatalogRequest(settings, payload) {
  const normalized = normalizeSettings(settings);
  const space = typeof payload?.space === "string" ? payload.space.trim() : "";
  if (!space) {
    throw clientError("スペースを取得できませんでした。", "invalid-input");
  }
  const tweet = asHttpUrl(payload?.tweet);
  const account = asAccountUrl(payload?.account);
  const body = {
    action: "upsertCatalog",
    sheetName: normalized.sheetName,
    space,
  };
  if (account) body.account = account;
  if (tweet) body.tweet = tweet;
  return {
    url: normalized.gasUrl,
    body,
  };
}

export function buildProbeRequest(settings) {
  return {
    url: normalizeGasUrl(settings?.gasUrl),
    body: { action: "probe" },
  };
}

async function postGas(request, expectedKind, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
      redirect: "follow",
    });
  } catch {
    return {
      ok: false,
      kind: "network",
      message: "GASへの接続に失敗しました。",
    };
  }
  if (!response.ok) {
    const status = Number.isInteger(response.status)
      ? response.status
      : "unknown";
    return {
      ok: false,
      kind: "http",
      message: `GAS通信に失敗しました（HTTP ${status}）`,
    };
  }

  let result;
  try {
    result = await response.json();
  } catch {
    return {
      ok: false,
      kind: "non-json",
      message: "GASからJSONではない応答を受け取りました。",
    };
  }
  if (
    result?.ok !== true ||
    result.status !== "success" ||
    (expectedKind === "probe" && result.kind !== "probe")
  ) {
    return {
      ok: false,
      kind: "gas-error",
      message:
        expectedKind === "probe"
          ? "GASからprobe成功応答を受け取れませんでした。"
          : "GAS側で保存できませんでした。",
    };
  }
  return { ok: true, status: "success" };
}

function validationFailure(error) {
  return {
    ok: false,
    kind: error?.kind || "invalid-input",
    message:
      error instanceof Error
        ? error.message
        : "設定または入力を確認してください。",
  };
}

export async function sendCatalog(settings, payload, fetchImpl = fetch) {
  let request;
  try {
    request = buildCatalogRequest(settings, payload);
  } catch (error) {
    return validationFailure(error);
  }
  const result = await postGas(request, "catalog", fetchImpl);
  if (!result.ok) return result;
  return {
    ...result,
    kind: "catalog",
    message: `${request.body.space}を保存しました`,
  };
}

export async function sendProbe(settings, fetchImpl = fetch) {
  let request;
  try {
    request = buildProbeRequest(settings);
  } catch (error) {
    return validationFailure(error);
  }
  const result = await postGas(request, "probe", fetchImpl);
  if (!result.ok) return result;
  return { ...result, kind: "probe", message: "GAS接続を確認しました" };
}
