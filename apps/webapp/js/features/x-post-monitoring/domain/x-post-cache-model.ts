import type { EventDayRef } from "../../event-day/public-api";
import type {
  XPost,
  XPostApiErrorCode,
} from "./x-post-types";

export const RECENT_POST_LIMIT = 200;
export const MATCHED_POST_LIMIT = 50;

export interface XPostCacheEntry {
  readonly key: string;
  readonly eventId: string;
  readonly dayId: string;
  readonly handle: string;
  readonly eventDate: string | null;
  readonly recentPosts: readonly XPost[];
  readonly matchedPosts: readonly XPost[];
  readonly recentNextCursor: string | null;
  readonly lastRecentFetchAt: string | null;
  readonly dayScan: {
    readonly state:
      | "not-started"
      | "scanning"
      | "complete"
      | "partial"
      | "error";
    readonly scannedAt: string | null;
    readonly lastRefreshAt: string | null;
    readonly newestPostId: string | null;
    readonly resumeCursor: string | null;
    readonly errorCode: XPostApiErrorCode | null;
  };
}

export interface XPostCache {
  get(ref: EventDayRef, handle: string): Promise<XPostCacheEntry | null>;
  put(entry: XPostCacheEntry): Promise<void>;
  deleteEventDay(ref: EventDayRef): Promise<void>;
  clear(): Promise<void>;
  dispose(): void;
}

export function buildXPostCacheKey(ref: EventDayRef, handle: string): string {
  return `${ref.eventId}:${ref.dayId}:${handle.toLowerCase()}`;
}

export function createEmptyXPostCacheEntry(
  ref: EventDayRef,
  handle: string,
  eventDate: string | null = null,
): XPostCacheEntry {
  return {
    key: buildXPostCacheKey(ref, handle),
    eventId: ref.eventId,
    dayId: ref.dayId,
    handle,
    eventDate,
    recentPosts: [],
    matchedPosts: [],
    recentNextCursor: null,
    lastRecentFetchAt: null,
    dayScan: {
      state: "not-started",
      scannedAt: null,
      lastRefreshAt: null,
      newestPostId: null,
      resumeCursor: null,
      errorCode: null,
    },
  };
}

function newestFirst(posts: readonly XPost[]): readonly XPost[] {
  return [...posts].sort((a, b) => {
    const timeDifference = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return timeDifference || b.id.localeCompare(a.id);
  });
}

function mergePosts(
  current: readonly XPost[],
  incoming: readonly XPost[],
  limit: number,
): readonly XPost[] {
  const byId = new Map<string, XPost>();
  for (const post of current) byId.set(post.id, post);
  for (const post of incoming) byId.set(post.id, post);
  return newestFirst([...byId.values()]).slice(0, limit);
}

export function mergeRecentPosts(
  current: readonly XPost[],
  incoming: readonly XPost[],
  limit = RECENT_POST_LIMIT,
): readonly XPost[] {
  return mergePosts(current, incoming, limit);
}

export function mergeMatchedPosts(
  current: readonly XPost[],
  incoming: readonly XPost[],
  limit = MATCHED_POST_LIMIT,
): readonly XPost[] {
  return mergePosts(current, incoming, limit);
}
