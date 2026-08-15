import type { Circle, EventDayRef } from "../../event-day/public-api";
import { extractXHandle } from "../domain/x-account";
import {
  buildXPostCacheKey,
  createEmptyXPostCacheEntry,
  mergeRecentPosts,
  type XPostCache,
  type XPostCacheEntry,
} from "../domain/x-post-cache-model";
import type { XPost, XPostClient } from "../domain/x-post-types";

export interface XPostPanelTarget {
  readonly ref: EventDayRef;
  readonly circle: Circle;
}

export interface XPostPanel {
  show(target: XPostPanelTarget): Promise<void>;
  hide(): void;
  dispose(): void;
}

type XPostPanelState = "unsupported" | "loading" | "ready" | "empty" | "error";

const PAGINATION_THRESHOLD_PX = 48;

function formatTokyoTime(createdAt: string): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(createdAt))
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

/** Renders the current target's small, cache-first X post list. */
export class DomXPostPanel implements XPostPanel {
  private readonly document: Document;
  private readonly client: XPostClient;
  private readonly cache: XPostCache;
  private readonly section: HTMLElement | null;
  private readonly message: HTMLElement | null;
  private readonly list: HTMLElement | null;
  private generation = 0;
  private abortController: AbortController | null = null;
  private current: { ref: EventDayRef; handle: string } | null = null;
  private currentEntry: XPostCacheEntry | null = null;
  private nextCursor: string | null = null;
  private loadingMore = false;
  private disposed = false;

  constructor(options: {
    readonly document: Document;
    readonly client: XPostClient;
    readonly cache: XPostCache;
  }) {
    this.document = options.document;
    this.client = options.client;
    this.cache = options.cache;
    const getElementById = typeof this.document?.getElementById === "function"
      ? this.document.getElementById.bind(this.document)
      : () => null;
    this.section = getElementById("target-x-posts");
    this.message = getElementById("target-x-post-message");
    this.list = getElementById("target-x-post-list");
    this.list?.addEventListener("scroll", this.handleScroll);
  }

  async show(target: XPostPanelTarget): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.current = null;
    this.currentEntry = null;
    this.nextCursor = null;
    this.loadingMore = false;
    this.section?.removeAttribute("hidden");
    this.renderState("loading", []);

    const handle = extractXHandle(target.circle.account);
    if (!handle) {
      this.renderState("unsupported", []);
      return;
    }

    this.current = { ref: target.ref, handle };
    let cached: XPostCacheEntry | null = null;
    try {
      cached = await this.cache.get(target.ref, handle);
    } catch {
      cached = null;
    }
    if (!this.isCurrent(generation)) return;
    if (cached) {
      this.currentEntry = cached;
      this.nextCursor = cached.recentNextCursor;
      this.renderPosts(cached.recentPosts);
      this.setMessage(cached.recentPosts.length > 0 ? "投稿を取得中…" : "投稿を取得中…");
    }

    try {
      const page = await this.client.fetchPage({
        handle,
        signal: this.abortController.signal,
      });
      if (!this.isCurrent(generation)) return;
      const entry = this.mergeEntry(target.ref, handle, cached, page.posts, page.nextCursor, page.fetchedAt);
      this.currentEntry = entry;
      this.nextCursor = entry.recentNextCursor;
      this.renderState(entry.recentPosts.length > 0 ? "ready" : "empty", entry.recentPosts);
      try {
        await this.cache.put(entry);
      } catch {
        // IndexedDB is an optional offline enhancement; the network result remains visible.
      }
    } catch (error) {
      if (!this.isCurrent(generation) || (error instanceof DOMException && error.name === "AbortError")) return;
      const posts = cached?.recentPosts ?? [];
      this.renderState(posts.length > 0 ? "error" : "error", posts);
    }
  }

  hide(): void {
    this.generation += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.current = null;
    this.currentEntry = null;
    this.nextCursor = null;
    this.loadingMore = false;
    this.section?.setAttribute("hidden", "");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.list?.removeEventListener("scroll", this.handleScroll);
    this.hide();
  }

  private readonly handleScroll = (): void => {
    if (!this.current || this.loadingMore || !this.nextCursor || !this.list) return;
    if (this.list.scrollTop + this.list.clientHeight < this.list.scrollHeight - PAGINATION_THRESHOLD_PX) return;
    void this.loadMore(this.current, this.nextCursor, this.generation);
  };

  private async loadMore(
    current: { readonly ref: EventDayRef; readonly handle: string },
    cursor: string,
    generation: number,
  ): Promise<void> {
    this.loadingMore = true;
    try {
      const page = await this.client.fetchPage({
        handle: current.handle,
        cursor,
        signal: this.abortController?.signal,
      });
      if (!this.isCurrent(generation)) return;
      const entry = this.mergeEntry(current.ref, current.handle, this.currentEntry, page.posts, page.nextCursor, page.fetchedAt);
      this.currentEntry = entry;
      this.nextCursor = entry.recentNextCursor;
      this.renderState(entry.recentPosts.length > 0 ? "ready" : "empty", entry.recentPosts);
      await this.cache.put(entry).catch(() => {});
    } catch (error) {
      if (this.isCurrent(generation) && !(error instanceof DOMException && error.name === "AbortError")) {
        this.setMessage("投稿を取得できません");
      }
    } finally {
      if (this.isCurrent(generation)) this.loadingMore = false;
    }
  }

  private mergeEntry(
    ref: EventDayRef,
    handle: string,
    existing: XPostCacheEntry | null,
    posts: readonly XPost[],
    nextCursor: string | null,
    fetchedAt: string,
  ): XPostCacheEntry {
    const base = existing ?? createEmptyXPostCacheEntry(ref, handle);
    return {
      ...base,
      key: buildXPostCacheKey(ref, handle),
      recentPosts: mergeRecentPosts(base.recentPosts, posts),
      recentNextCursor: nextCursor,
      lastRecentFetchAt: fetchedAt,
    };
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private renderState(state: XPostPanelState, posts: readonly XPost[]): void {
    this.renderPosts(posts);
    this.setMessage(
      state === "unsupported"
        ? "投稿情報なし"
        : state === "loading"
          ? "投稿を取得中…"
          : state === "empty"
            ? "投稿なし"
            : state === "error"
              ? "投稿を取得できません"
              : "",
    );
  }

  private renderPosts(posts: readonly XPost[]): void {
    if (!this.list) return;
    this.list.replaceChildren(
      ...posts.map((post) => {
        const item = this.document.createElement("div");
        item.className = "x-post-item";
        const time = this.document.createElement("time");
        time.dateTime = post.createdAt;
        time.textContent = formatTokyoTime(post.createdAt);
        const body = this.document.createElement("p");
        body.textContent = post.text;
        item.append(time, body);
        return item;
      }),
    );
  }

  private setMessage(message: string): void {
    if (this.message) this.message.textContent = message;
  }
}
