import { describe, expect, it, vi } from "vitest";
import { handleXPostRequest } from "../functions/api/x-posts";

describe("x-post Pages Function", () => {
  it("rejects invalid input without contacting Yahoo", async () => {
    const fetchYahoo = vi.fn();
    const response = await handleXPostRequest(
      new Request("https://app.example/api/x-posts?handle=bad-handle&since=1"),
      { fetchYahoo },
    );
    expect(response.status).toBe(400);
    expect(fetchYahoo).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  });

  it("maps upstream errors without exposing raw response", async () => {
    const response = await handleXPostRequest(
      new Request("https://app.example/api/x-posts?handle=good"),
      { fetchYahoo: vi.fn().mockResolvedValue(new Response("no", { status: 429, headers: { "Retry-After": "30" } })) },
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toEqual({ schemaVersion: 1, error: { code: "upstream_rate_limited", message: "上流サービスがレート制限を返しました" } });
  });

  it("returns normalized posts only", async () => {
    const response = await handleXPostRequest(
      new Request("https://app.example/api/x-posts?handle=good"),
      { fetchYahoo: vi.fn().mockResolvedValue(Response.json({ timeline: { head: { totalResultsAvailable: 1, totalResultsReturned: 1 }, entry: [{ id: "1", displayText: "本文", createdAt: 1786705200, media: [{ secret: "drop" }] }] } })) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ handle: "good", posts: [{ id: "1", text: "本文" }] });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
