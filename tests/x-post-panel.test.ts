// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomXPostPanel } from "../apps/webapp/js/features/x-post-monitoring/public-api";
import type {
  XPostCache,
  XPostCacheEntry,
} from "../apps/webapp/js/features/x-post-monitoring/public-api";
import type { XPostClient, XPostPage } from "../apps/webapp/js/features/x-post-monitoring/public-api";

const ref = { eventId: "event", dayId: "day1" };

function page(posts: XPostPage["posts"], nextCursor: string | null = null): XPostPage {
  return {
    schemaVersion: 1,
    handle: "circle_1",
    posts,
    nextCursor,
    fetchedAt: "2026-08-15T01:00:00.000Z",
  };
}

function makeCache(entry: XPostCacheEntry | null = null): XPostCache & {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(async () => entry),
    put: vi.fn(async () => {}),
    deleteEventDay: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
}

function setup() {
  document.body.innerHTML = `
    <section id="target-x-posts">
      <strong class="x-post-panel-title">最近の投稿</strong>
      <p id="target-x-post-message"></p>
      <div id="target-x-post-list"></div>
    </section>`;
}

describe("DomXPostPanel", () => {
  beforeEach(setup);

  it("does not request or read cache for non-X accounts", async () => {
    const client = { fetchPage: vi.fn() } as unknown as XPostClient;
    const cache = makeCache();
    const panel = new DomXPostPanel({ document, client, cache });

    await panel.show({ ref, circle: { space: "東A01", account: "https://pixiv.net/users/1" } });

    expect(document.querySelector("#target-x-post-message")?.textContent).toBe("投稿情報なし");
    expect(client.fetchPage).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
  });

  it("renders cache first and formats timestamps in Asia/Tokyo", async () => {
    const cached: XPostCacheEntry = {
      key: "event:day1:circle_1",
      eventId: "event",
      dayId: "day1",
      handle: "circle_1",
      eventDate: null,
      recentPosts: [{ id: "cached", text: "キャッシュ", createdAt: "2026-08-15T00:31:00.000Z" }],
      matchedPosts: [],
      recentNextCursor: null,
      lastRecentFetchAt: "2026-08-15T00:40:00.000Z",
      dayScan: {
        state: "not-started",
        scannedAt: null,
        lastRefreshAt: null,
        newestPostId: null,
        resumeCursor: null,
        errorCode: null,
      },
    };
    const cache = makeCache(cached);
    const client: XPostClient = {
      fetchPage: vi.fn(async () => page([
        { id: "new", text: "<img onerror=alert(1)>", createdAt: "2026-08-15T01:00:00.000Z" },
      ])),
    };
    const panel = new DomXPostPanel({ document, client, cache });

    await panel.show({ ref, circle: { space: "東A01", account: "https://x.com/circle_1" } });

    const items = [...document.querySelectorAll(".x-post-item")];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector("time")?.textContent).toBe("8/15 10:00");
    expect(items[0].querySelector("time")?.getAttribute("datetime")).toBe("2026-08-15T01:00:00.000Z");
    expect(items[0].querySelector("p")?.textContent).toBe("<img onerror=alert(1)>");
    expect(items[0].querySelector("img")).toBeNull();
    expect(document.querySelector("#target-x-post-message")?.textContent).toBe("");
  });

  it("loads one next page only at the scroll end", async () => {
    const cache = makeCache();
    let resolveMore!: (value: XPostPage) => void;
    const client: XPostClient = {
      fetchPage: vi.fn()
        .mockResolvedValueOnce(page([{ id: "1", text: "one", createdAt: "2026-08-15T01:00:00.000Z" }], "2"))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveMore = resolve; })),
    };
    const panel = new DomXPostPanel({ document, client, cache });
    await panel.show({ ref, circle: { space: "東A01", account: "https://x.com/circle_1" } });

    const list = document.querySelector("#target-x-post-list") as HTMLElement;
    Object.defineProperties(list, {
      scrollTop: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
    });
    list.dispatchEvent(new Event("scroll"));
    list.dispatchEvent(new Event("scroll"));
    expect(client.fetchPage).toHaveBeenCalledTimes(2);
    expect(client.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "2" }));

    resolveMore(page([{ id: "2", text: "two", createdAt: "2026-08-15T00:59:00.000Z" }], null));
    await vi.waitFor(() => expect(document.querySelectorAll(".x-post-item")).toHaveLength(2));
  });

  it("does not let an old target response overwrite the new target", async () => {
    let resolveOld!: (value: XPostPage) => void;
    const client: XPostClient = {
      fetchPage: vi.fn()
        .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
        .mockResolvedValueOnce(page([{ id: "new", text: "新しい対象", createdAt: "2026-08-15T01:00:00.000Z" }])),
    };
    const panel = new DomXPostPanel({ document, client, cache: makeCache() });
    const oldShow = panel.show({ ref, circle: { space: "東A01", account: "https://x.com/old" } });
    await vi.waitFor(() => expect(client.fetchPage).toHaveBeenCalledTimes(1));
    await panel.show({ ref, circle: { space: "東A02", account: "https://x.com/new" } });
    resolveOld(page([{ id: "old", text: "古い対象", createdAt: "2026-08-15T00:00:00.000Z" }]));
    await oldShow;

    expect(document.querySelector("#target-x-post-list")?.textContent).toContain("新しい対象");
    expect(document.querySelector("#target-x-post-list")?.textContent).not.toContain("古い対象");
  });
});
