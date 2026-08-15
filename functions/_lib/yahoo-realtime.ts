import type { XPost, XPostPage } from "./x-post-contract";

const YAHOO_REALTIME_URL = "https://search.yahoo.co.jp/realtime/api/v1/pagination";
const YAHOO_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://search.yahoo.co.jp/realtime/search",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

function assertHandle(handle: string): void {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error("invalid handle");
}

function dayBounds(day: string): readonly [number, number] {
  const start = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
  ) - 9 * 60 * 60 * 1000;
  return [start / 1000, (start + 24 * 60 * 60 * 1000) / 1000];
}

export function buildYahooRealtimeRequest(input: {
  readonly handle: string;
  readonly cursor: string | null;
  readonly day: string | null;
}): Request {
  assertHandle(input.handle);
  const params = new URLSearchParams({
    p: `ID:${input.handle}`,
    results: input.day ? "40" : "20",
  });
  if (input.cursor) params.set("oldestTweetId", input.cursor);
  if (input.day) {
    const [since, until] = dayBounds(input.day);
    params.set("since", String(since));
    params.set("until", String(until));
  }
  return new Request(`${YAHOO_REALTIME_URL}?${params}`, { headers: YAHOO_HEADERS });
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("upstream schema changed");
  return input as Record<string, unknown>;
}

function parseCreatedAt(value: unknown): { seconds: number; iso: string } {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("upstream schema changed");
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) throw new Error("upstream schema changed");
  return { seconds, iso: date.toISOString() };
}

export function parseYahooRealtimeResponse(
  input: unknown,
  options: { readonly handle: string; readonly day: string | null; readonly fetchedAt: string },
): XPostPage {
  assertHandle(options.handle);
  if (Number.isNaN(new Date(options.fetchedAt).getTime())) throw new Error("invalid fetchedAt");
  const root = record(input);
  const timeline = record(root.timeline);
  const head = record(timeline.head);
  const entries = timeline.entry;
  const totalResultsAvailable = head.totalResultsAvailable;
  const totalResultsReturned = head.totalResultsReturned;
  if (!Array.isArray(entries) ||
      typeof totalResultsAvailable !== "number" || !Number.isInteger(totalResultsAvailable) || totalResultsAvailable < 0 ||
      typeof totalResultsReturned !== "number" || !Number.isInteger(totalResultsReturned) || totalResultsReturned < 0) {
    throw new Error("upstream schema changed");
  }

  const bounds = options.day ? dayBounds(options.day) : null;
  const rawPosts: Array<{ post: XPost; seconds: number }> = entries.map((entry) => {
    const value = record(entry);
    const id = typeof value.id === "string" ? value.id : String(value.id ?? "");
    if (!/^[0-9]{1,32}$/.test(id) || typeof value.displayText !== "string") {
      throw new Error("upstream schema changed");
    }
    const createdAt = parseCreatedAt(value.createdAt);
    return { seconds: createdAt.seconds, post: { id, text: value.displayText, createdAt: createdAt.iso } };
  });
  const posts = rawPosts
    .filter(({ seconds }) => !bounds || (seconds >= bounds[0] && seconds < bounds[1]))
    .map(({ post }) => post);
  const lastId = rawPosts.at(-1)?.post.id ?? null;
  const nextCursor = totalResultsReturned < totalResultsAvailable || (bounds !== null && posts.length !== rawPosts.length)
    ? lastId
    : null;
  return { schemaVersion: 1, handle: options.handle, posts, nextCursor, fetchedAt: options.fetchedAt };
}
