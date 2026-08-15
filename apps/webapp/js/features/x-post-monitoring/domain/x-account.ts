const X_PROFILE_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

const RESERVED_X_ROUTES = new Set([
  "home",
  "search",
  "explore",
  "notifications",
  "messages",
  "compose",
  "settings",
  "i",
  "intent",
  "share",
]);

export function extractXHandle(account: unknown): string | null {
  if (typeof account !== "string" || !account) return null;

  let url: URL;
  try {
    url = new URL(account);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || !X_PROFILE_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  const pathSegments = url.pathname.slice(1).split("/");
  if (pathSegments.length > 2 || (pathSegments.length === 2 && pathSegments[1] !== "")) {
    return null;
  }
  const handle = pathSegments[0] ?? "";
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  if (RESERVED_X_ROUTES.has(handle.toLowerCase())) return null;
  return handle;
}
