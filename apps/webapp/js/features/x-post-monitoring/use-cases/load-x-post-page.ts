import type { EventDayRef } from "../../event-day/public-api";
import {
  createEmptyXPostCacheEntry,
  mergeRecentPosts,
  type XPostCache,
  type XPostCacheEntry,
} from "../domain/x-post-cache-model";
import type { XPostClient } from "../domain/x-post-types";

export class LoadXPostPageUseCase {
  constructor(
    private readonly client: XPostClient,
    private readonly cache: XPostCache,
  ) {}

  async execute(input: {
    readonly ref: EventDayRef;
    readonly handle: string;
    readonly eventDate?: string | null;
    readonly cursor?: string | null;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly page: Awaited<ReturnType<XPostClient["fetchPage"]>>; readonly entry: XPostCacheEntry }> {
    const existing = (await this.cache.get(input.ref, input.handle)) ??
      createEmptyXPostCacheEntry(input.ref, input.handle, input.eventDate ?? null);
    const page = await this.client.fetchPage({
      handle: input.handle,
      cursor: input.cursor,
      signal: input.signal,
    });
    const entry: XPostCacheEntry = {
      ...existing,
      eventDate: input.eventDate ?? existing.eventDate,
      recentPosts: mergeRecentPosts(existing.recentPosts, page.posts),
      recentNextCursor: page.nextCursor,
      lastRecentFetchAt: page.fetchedAt,
    };
    await this.cache.put(entry);
    return { page, entry };
  }
}
