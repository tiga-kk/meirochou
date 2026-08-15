import type {
  XPostClient,
  XPostApiErrorCode,
  XPostApiErrorBody,
  XPostPage,
} from "../domain/x-post-types";

function isXPostApiErrorBody(input: unknown): input is XPostApiErrorBody {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  const error = value.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  const body = error as Record<string, unknown>;
  return value.schemaVersion === 1 &&
    ["invalid_request", "upstream_rate_limited", "upstream_unavailable", "upstream_schema_changed"].includes(String(body.code)) &&
    typeof body.message === "string";
}

export class XPostRequestError extends Error {
  readonly code: XPostApiErrorCode;
  readonly retryAfterMs: number | null;

  constructor(code: XPostApiErrorCode, retryAfterMs: number | null, message = "X投稿を取得できません") {
    super(message);
    this.name = "XPostRequestError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function parseXPostPage(input: unknown): XPostPage {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new XPostRequestError("upstream_schema_changed", null);
  }
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== 1 || typeof value.handle !== "string" || !Array.isArray(value.posts) ||
      (value.nextCursor !== null && (typeof value.nextCursor !== "string" || !/^\d{1,32}$/.test(value.nextCursor))) ||
      !validIso(value.fetchedAt)) {
    throw new XPostRequestError("upstream_schema_changed", null);
  }
  const posts = value.posts.map((post) => {
    if (!post || typeof post !== "object" || Array.isArray(post)) {
      throw new XPostRequestError("upstream_schema_changed", null);
    }
    const item = post as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id || typeof item.text !== "string" || !validIso(item.createdAt)) {
      throw new XPostRequestError("upstream_schema_changed", null);
    }
    return { id: item.id, text: item.text, createdAt: item.createdAt };
  });
  return {
    schemaVersion: 1,
    handle: value.handle,
    posts,
    nextCursor: value.nextCursor as string | null,
    fetchedAt: value.fetchedAt,
  };
}

function retryAfterMs(value: string | null, now: () => number): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - now());
}

export class HttpXPostClient implements XPostClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly now: () => number;

  constructor(options: { readonly fetcher?: typeof fetch; readonly baseUrl?: string; readonly now?: () => number } = {}) {
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = options.baseUrl ?? "/api/x-posts";
    this.now = options.now ?? Date.now;
  }

  async fetchPage(input: {
    readonly handle: string;
    readonly cursor?: string | null;
    readonly day?: string | null;
    readonly signal?: AbortSignal;
  }): Promise<XPostPage> {
    const url = new URL(this.baseUrl, globalThis.location?.origin ?? "https://app.invalid");
    url.searchParams.set("handle", input.handle);
    if (input.cursor) url.searchParams.set("cursor", input.cursor);
    if (input.day) url.searchParams.set("day", input.day);
    const response = await this.fetcher(url, { signal: input.signal });
    const retryAfter = retryAfterMs(response.headers.get("Retry-After"), this.now);
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const code = isXPostApiErrorBody(body) ? body.error.code : "upstream_unavailable";
      throw new XPostRequestError(code, retryAfter);
    }
    const page = parseXPostPage(body);
    if (page.handle !== input.handle) throw new XPostRequestError("upstream_schema_changed", null);
    return page;
  }
}
