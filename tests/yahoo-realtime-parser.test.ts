import { describe, expect, it } from "vitest";
import fixture from "./fixtures/yahoo-realtime-page.json";
import {
  buildYahooRealtimeRequest,
  parseYahooRealtimeResponse,
} from "../functions/_lib/yahoo-realtime";

describe("Yahoo realtime adapter", () => {
  it("builds a constrained request for feed and pagination", () => {
    const request = buildYahooRealtimeRequest({ handle: "circle_1", cursor: "123", day: null });
    const url = new URL(request.url);
    expect(url.pathname).toBe("/realtime/api/v1/pagination");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      p: "ID:circle_1",
      results: "20",
      oldestTweetId: "123",
    });
    expect(request.headers.get("Referer")).toBe("https://search.yahoo.co.jp/realtime/search");
  });

  it("uses fixed JST unix boundaries and the day page size", () => {
    const request = buildYahooRealtimeRequest({ handle: "circle_1", cursor: null, day: "2026-08-15" });
    const url = new URL(request.url);
    expect(url.searchParams.get("results")).toBe("40");
    expect(url.searchParams.get("since")).toBe(String(Date.UTC(2026, 7, 14, 15) / 1000));
    expect(url.searchParams.get("until")).toBe(String(Date.UTC(2026, 7, 15, 15) / 1000));
  });

  it("maps only post id/text/time and returns the provider cursor", () => {
    const page = parseYahooRealtimeResponse(fixture, {
      handle: "circle_1",
      day: null,
      fetchedAt: "2026-08-14T00:00:00.000Z",
    });
    expect(page.posts).toEqual([
      { id: "2088219081719840913", text: "完売しました https://example.invalid/post", createdAt: "2026-08-14T11:00:00.000Z" },
      { id: "2088173781000859898", text: "次の投稿", createdAt: "2026-08-14T08:00:00.000Z" },
    ]);
    expect(page.nextCursor).toBe("2088173781000859898");
  });

  it("filters posts outside the requested JST day without treating the page as complete", () => {
    const page = parseYahooRealtimeResponse({
      timeline: {
        head: { totalResultsAvailable: 2, totalResultsReturned: 2 },
        entry: [
          { id: "1", displayText: "前日", createdAt: 1786705199 },
          { id: "2", displayText: "当日", createdAt: 1786728000 },
        ],
      },
    }, { handle: "circle_1", day: "2026-08-15", fetchedAt: "2026-08-14T00:00:00.000Z" });
    expect(page.posts).toEqual([{ id: "2", text: "当日", createdAt: "2026-08-14T17:20:00.000Z" }]);
    expect(page.nextCursor).toBe("2");
  });

  it("rejects schema changes instead of returning empty success", () => {
    expect(() => parseYahooRealtimeResponse({ timeline: {} }, {
      handle: "circle_1", day: null, fetchedAt: "2026-08-14T00:00:00.000Z",
    })).toThrow(/schema/i);
  });
});
