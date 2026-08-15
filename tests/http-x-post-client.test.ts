import { describe, expect, it, vi } from "vitest";
import { HttpXPostClient, XPostRequestError, parseXPostPage } from "../apps/webapp/js/features/x-post-monitoring/infrastructure/http-x-post-client";

const page = {
  schemaVersion: 1,
  handle: "circle_1",
  posts: [{ id: "2", text: "本文", createdAt: "2026-08-15T00:00:00.000Z" }],
  nextCursor: null,
  fetchedAt: "2026-08-15T00:00:00.000Z",
};

describe("HttpXPostClient", () => {
  it("validates normalized success responses", () => {
    expect(parseXPostPage(page)).toEqual(page);
    expect(() => parseXPostPage({ ...page, posts: [{ id: "", text: "", createdAt: "bad" }] })).toThrow(XPostRequestError);
  });

  it("sends only supported query parameters and preserves AbortSignal", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(page));
    const signal = new AbortController().signal;
    await new HttpXPostClient({ fetcher, baseUrl: "https://app.test/api/x-posts" }).fetchPage({
      handle: "circle_1", cursor: "123", day: "2026-08-15", signal,
    });
    const [request, options] = fetcher.mock.calls[0];
    expect(new URL(request).search).toBe("?handle=circle_1&cursor=123&day=2026-08-15");
    expect(options.signal).toBe(signal);
  });

  it("validates error bodies and normalizes Retry-After seconds and dates", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 1,
      error: { code: "upstream_rate_limited", message: "rate" },
    }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "30" } }));
    await expect(new HttpXPostClient({ fetcher }).fetchPage({ handle: "circle_1" })).rejects.toMatchObject({
      code: "upstream_rate_limited", retryAfterMs: 30000,
    });
    const date = new Date(Date.now() + 5000).toUTCString();
    const dateFetcher = vi.fn().mockResolvedValue(new Response("bad", { status: 503, headers: { "Retry-After": date } }));
    await expect(new HttpXPostClient({ fetcher: dateFetcher, now: () => Date.now() }).fetchPage({ handle: "circle_1" })).rejects.toMatchObject({ code: "upstream_unavailable" });
  });
});
