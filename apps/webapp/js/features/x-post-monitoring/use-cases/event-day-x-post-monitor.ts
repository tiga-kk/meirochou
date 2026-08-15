import type {
  ActiveEventDayReader,
  Circle,
  EventDayRef,
} from "../../event-day/public-api";
import { extractXHandle } from "../domain/x-account";
import {
  createEmptyXPostCacheEntry,
  mergeMatchedPosts,
  mergeRecentPosts,
  type XPostCache,
  type XPostCacheEntry,
} from "../domain/x-post-cache-model";
import { detectSaleMentions } from "../domain/sale-mention-detector";
import type {
  SaleMentionState,
  XPostApiErrorCode,
  XPostClient,
  XPostPage,
} from "../domain/x-post-types";

interface MonitorDocument {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

interface MonitorOnlineTarget {
  readonly navigator?: { readonly onLine?: boolean };
  addEventListener(type: "online", listener: () => void): void;
  removeEventListener(type: "online", listener: () => void): void;
}

interface HandleJob {
  readonly handle: string;
  readonly spaces: Set<string>;
  rank: number;
  generation: number;
  inFlight: boolean;
  retryAt: number;
  retryCount: number;
  timer: unknown;
  forceRefresh: boolean;
}

export interface EventDayXPostMonitor {
  start(input: { readonly ref: EventDayRef; readonly eventDate: string | null }): void;
  stop(): void;
  prioritizeCircle(circle: Circle | null): void;
  refreshCircleAccounts(): void;
  getSaleMention(space: string): SaleMentionState;
  getMentionSpaces(): ReadonlySet<string>;
  subscribe(listener: () => void): () => void;
}

export interface EventDayXPostMonitorOptions {
  readonly client: XPostClient;
  readonly cache: XPostCache;
  readonly activeEventDayReader: ActiveEventDayReader;
  readonly document: MonitorDocument;
  readonly onlineTarget: MonitorOnlineTarget;
  readonly now?: () => Date;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (timer: unknown) => void;
}

const REQUEST_INTERVAL_MS = 1000;
const CURRENT_DAY_REFRESH_MS = 10 * 60 * 1000;
const CONTINUATION_DELAY_MS = 60 * 1000;
const MAX_PAGES_PER_SLICE = 50;
const MAX_POSTS_PER_SLICE = 2000;
const BACKOFF_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function tokyoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function errorCode(error: unknown): XPostApiErrorCode | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" && [
    "invalid_request",
    "upstream_rate_limited",
    "upstream_unavailable",
    "upstream_schema_changed",
  ].includes(code) ? code as XPostApiErrorCode : null;
}

function retryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { readonly retryAfterMs?: unknown }).retryAfterMs;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
}

/** Monitors active event-day X accounts without mutating route or business state. */
export class DefaultEventDayXPostMonitor implements EventDayXPostMonitor {
  private readonly client: XPostClient;
  private readonly cache: XPostCache;
  private readonly reader: ActiveEventDayReader;
  private readonly document: MonitorDocument;
  private readonly onlineTarget: MonitorOnlineTarget;
  private readonly now: () => Date;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private readonly listeners = new Set<() => void>();
  private readonly states = new Map<string, SaleMentionState>();
  private readonly jobs = new Map<string, HandleJob>();
  private readonly abortControllers = new Map<string, AbortController>();
  private ref: EventDayRef | null = null;
  private eventDate: string | null = null;
  private generation = 0;
  private started = false;
  private stopped = false;
  private activeRequests = 0;
  private lastRequestStartedAt = -Infinity;
  private globalBackoffUntil = 0;
  private globalFailureCount = 0;
  private pumpTimer: unknown = null;

  constructor(options: EventDayXPostMonitorOptions) {
    this.client = options.client;
    this.cache = options.cache;
    this.reader = options.activeEventDayReader;
    this.document = options.document;
    this.onlineTarget = options.onlineTarget;
    this.now = options.now ?? (() => new Date());
    this.setTimer = options.setTimer ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  /** Starts monitoring one event/day and rebuilds its handle queue. */
  start(input: { readonly ref: EventDayRef; readonly eventDate: string | null }): void {
    this.stop();
    this.stopped = false;
    this.started = true;
    this.ref = { ...input.ref };
    this.eventDate = validDate(input.eventDate) ? input.eventDate : null;
    this.generation += 1;
    this.document.addEventListener("visibilitychange", this.handleLifecycleChange);
    this.onlineTarget.addEventListener("online", this.handleLifecycleChange);
    this.refreshCircleAccounts();
    this.pump();
  }

  /** Stops all timers, listeners, requests, and stale completions. */
  stop(): void {
    this.generation += 1;
    this.started = false;
    this.stopped = true;
    this.document.removeEventListener("visibilitychange", this.handleLifecycleChange);
    this.onlineTarget.removeEventListener("online", this.handleLifecycleChange);
    if (this.pumpTimer !== null) this.clearTimer(this.pumpTimer);
    this.pumpTimer = null;
    for (const timer of this.jobs.values()) {
      if (timer.timer !== null) this.clearTimer(timer.timer);
    }
    for (const controller of this.abortControllers.values()) controller.abort();
    this.abortControllers.clear();
    this.jobs.clear();
    this.states.clear();
    this.activeRequests = 0;
    this.ref = null;
    this.eventDate = null;
  }

  /** Raises an unstarted account job without aborting work already in flight. */
  prioritizeCircle(circle: Circle | null): void {
    const handle = extractXHandle(circle?.account);
    if (!handle) return;
    const job = this.jobs.get(handle);
    if (!job || job.inFlight) return;
    job.rank = -1;
    job.forceRefresh = true;
    job.retryAt = 0;
    this.pump();
  }

  /** Rebuilds eligible pending/held account mappings after source changes. */
  refreshCircleAccounts(): void {
    if (!this.ref) return;
    const circles = this.reader.getAllCircles();
    const next = new Map<string, Set<string>>();
    for (const circle of circles) {
      const status = this.reader.getCircleStatus(circle.space);
      if (status !== "pending" && status !== "held") continue;
      const handle = extractXHandle(circle.account);
      if (!handle) {
        this.states.set(circle.space, { status: "unknown" });
        continue;
      }
      const spaces = next.get(handle) ?? new Set<string>();
      spaces.add(circle.space);
      next.set(handle, spaces);
      if (!this.states.has(circle.space)) this.states.set(circle.space, { status: "unknown" });
    }
    for (const [handle, job] of this.jobs) {
      const spaces = next.get(handle);
      if (!spaces) {
        this.abortControllers.get(handle)?.abort();
        this.jobs.delete(handle);
        continue;
      }
      job.spaces.clear();
      for (const space of spaces) job.spaces.add(space);
    }
    let rank = 0;
    for (const [handle, spaces] of next) {
      const job = this.jobs.get(handle);
      if (job) {
        job.rank = Math.min(job.rank, rank++);
        continue;
      }
      this.jobs.set(handle, {
        handle,
        spaces: new Set(spaces),
        rank: rank++,
        generation: this.generation,
        inFlight: false,
        retryAt: 0,
        retryCount: 0,
        timer: null,
        forceRefresh: false,
      });
    }
    this.notify();
  }

  /** Returns the current derived warning state for one circle space. */
  getSaleMention(space: string): SaleMentionState {
    return this.states.get(space) ?? { status: "unknown" };
  }

  /** Returns spaces with retained sale-mention evidence. */
  getMentionSpaces(): ReadonlySet<string> {
    return new Set([...this.states].filter(([, state]) => state.status === "mention").map(([space]) => space));
  }

  /** Subscribes a UI adapter to warning-state changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readonly handleLifecycleChange = (): void => {
    this.pump();
  };

  private pump(): void {
    if (!this.started || this.stopped || !this.canStartRequests()) return;
    const now = this.now().getTime();
    if (now < this.globalBackoffUntil) {
      this.schedulePump(this.globalBackoffUntil - now);
      return;
    }
    const available = [...this.jobs.values()]
      .filter((job) => !job.inFlight && job.retryAt <= now)
      .sort((a, b) => a.rank - b.rank);
    while (this.activeRequests < 2 && available.length > 0) {
      const job = available.shift();
      if (!job) break;
      job.inFlight = true;
      this.activeRequests += 1;
      void this.runJob(job, this.generation);
    }
  }

  private async runJob(job: HandleJob, generation: number): Promise<void> {
    try {
      if (!this.ref || !this.eventDate || tokyoDate(this.now()) < this.eventDate) {
        if (this.eventDate && tokyoDate(this.now()) < this.eventDate) this.setUnknown(job);
        job.retryAt = Infinity;
        return;
      }
      let entry = await this.cache.get(this.ref, job.handle).catch(() => null);
      if (!this.isCurrent(job, generation)) return;
      if (!entry) entry = createEmptyXPostCacheEntry(this.ref, job.handle, this.eventDate);
      this.applyCachedState(job, entry);
      const today = tokyoDate(this.now()) === this.eventDate;
      const refreshAge = this.age(entry.dayScan.lastRefreshAt);
      const targetRefreshDue = job.forceRefresh && today && refreshAge >= 60 * 1000;
      job.forceRefresh = false;
      if (entry.dayScan.state === "complete" && (!today || (!targetRefreshDue && refreshAge < CURRENT_DAY_REFRESH_MS))) {
        job.retryAt = today ? this.now().getTime() + CURRENT_DAY_REFRESH_MS - refreshAge : Infinity;
        return;
      }
      if (entry.dayScan.state === "error" && entry.dayScan.errorCode !== "upstream_rate_limited" && entry.dayScan.errorCode !== "upstream_unavailable") {
        job.retryAt = Infinity;
        return;
      }

      let cursor = entry.dayScan.resumeCursor;
      const seenCursors = new Set<string>();
      let pages = 0;
      let normalizedPosts = 0;
      const knownNewest = today && entry.dayScan.state === "complete" ? entry.dayScan.newestPostId : null;
      await this.persistScan(entry, "scanning", cursor, null);
      while (this.isCurrent(job, generation) && this.canStartRequests()) {
        const cursorKey = cursor ?? "__first__";
        if (seenCursors.has(cursorKey)) {
          await this.persistScan(entry, "error", cursor, "upstream_schema_changed");
          this.setStates(job, entry);
          return;
        }
        seenCursors.add(cursorKey);
        if (!(await this.waitForRequestSlot(generation))) return;
        const controller = new AbortController();
        this.abortControllers.set(job.handle, controller);
        const page = await this.client.fetchPage({
          handle: job.handle,
          day: this.eventDate,
          cursor,
          signal: controller.signal,
        });
        this.globalFailureCount = 0;
        this.abortControllers.delete(job.handle);
        if (!this.isCurrent(job, generation)) return;
        const result = await this.applyPage(job, entry, page, cursor, today, knownNewest);
        entry = result.entry;
        pages += 1;
        normalizedPosts += page.posts.length;
        cursor = page.nextCursor;
        if (result.stoppedAtKnownNewest || cursor === null) {
          await this.persistScan(entry, "complete", null, null);
          this.setStates(job, entry);
          if (today) this.scheduleJob(job, CURRENT_DAY_REFRESH_MS);
          return;
        }
        if (pages >= MAX_PAGES_PER_SLICE || normalizedPosts >= MAX_POSTS_PER_SLICE) {
          await this.persistScan(entry, "partial", cursor, null);
          this.setStates(job, entry);
          this.scheduleJob(job, CONTINUATION_DELAY_MS);
          return;
        }
      }
    } catch (error) {
      if (!this.isCurrent(job, generation)) return;
      const code = errorCode(error) ?? "upstream_unavailable";
      const existing = (await this.cache.get(this.ref!, job.handle).catch(() => null)) ??
        createEmptyXPostCacheEntry(this.ref!, job.handle, this.eventDate);
      await this.persistScan(existing, "error", existing.dayScan.resumeCursor, code);
      this.setStates(job, existing);
      if (code !== "upstream_schema_changed") {
        this.globalFailureCount += 1;
        const backoff = BACKOFF_MS[Math.min(this.globalFailureCount - 1, BACKOFF_MS.length - 1)];
        this.globalBackoffUntil = Math.max(this.globalBackoffUntil, this.now().getTime() + Math.max(backoff, retryAfterMs(error) ?? 0));
        this.scheduleJob(job, Math.max(backoff, retryAfterMs(error) ?? 0));
      }
    } finally {
      if (generation === this.generation && this.started && !this.stopped) {
        this.activeRequests = Math.max(0, this.activeRequests - 1);
      }
      if (this.isCurrent(job, generation)) {
        job.inFlight = false;
        this.pump();
      }
    }
  }

  private async applyPage(
    job: HandleJob,
    entry: XPostCacheEntry,
    page: XPostPage,
    cursor: string | null,
    today: boolean,
    knownNewest: string | null,
  ): Promise<{ readonly entry: XPostCacheEntry; readonly stoppedAtKnownNewest: boolean }> {
    const matches = detectSaleMentions(page.posts);
    const recentPosts = mergeRecentPosts(entry.recentPosts, page.posts);
    const matchedPosts = mergeMatchedPosts(entry.matchedPosts, matches.matchedPosts);
    const newestPostId = page.posts[0]?.id ?? entry.dayScan.newestPostId;
    const next: XPostCacheEntry = {
      ...entry,
      recentPosts,
      matchedPosts,
      recentNextCursor: page.nextCursor,
      lastRecentFetchAt: page.fetchedAt,
      dayScan: {
        ...entry.dayScan,
        state: "scanning",
        newestPostId,
        resumeCursor: page.nextCursor,
        errorCode: null,
      },
    };
      await this.cache.put(next).catch(() => {});
    this.setStates(job, next);
    return {
      entry: next,
      stoppedAtKnownNewest: Boolean(today && knownNewest && page.posts.some((post) => post.id === knownNewest) && cursor === null),
    };
  }

  private async persistScan(
    entry: XPostCacheEntry,
    state: XPostCacheEntry["dayScan"]["state"],
    resumeCursor: string | null,
    errorCodeValue: XPostCacheEntry["dayScan"]["errorCode"],
  ): Promise<void> {
    const checkedAt = this.now().toISOString();
    await this.cache.put({
      ...entry,
      eventDate: this.eventDate,
      dayScan: {
        ...entry.dayScan,
        state,
        resumeCursor,
        errorCode: errorCodeValue,
        scannedAt: state === "complete" ? checkedAt : entry.dayScan.scannedAt,
        lastRefreshAt: state === "complete" ? checkedAt : entry.dayScan.lastRefreshAt,
      },
    }).catch(() => {});
  }

  private applyCachedState(job: HandleJob, entry: XPostCacheEntry): void {
    this.setStates(job, entry);
  }

  private setStates(job: HandleJob, entry: XPostCacheEntry): void {
    const matches = detectSaleMentions(entry.matchedPosts);
    const checkedAt = entry.dayScan.scannedAt ?? this.now().toISOString();
    const state: SaleMentionState = matches.matchedPosts.length > 0
      ? { status: "mention", matchedPostIds: matches.matchedPosts.map((post) => post.id), matchedKeywords: matches.matchedKeywords, checkedAt }
      : entry.dayScan.state === "complete"
        ? { status: "no-mention", checkedAt }
        : { status: "unknown" };
    for (const space of job.spaces) this.states.set(space, state);
    this.notify();
  }

  private setUnknown(job: HandleJob): void {
    for (const space of job.spaces) this.states.set(space, { status: "unknown" });
    this.notify();
  }

  private age(value: string | null): number {
    if (!value) return Infinity;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(0, this.now().getTime() - timestamp) : Infinity;
  }

  private async waitForRequestSlot(generation: number): Promise<boolean> {
    const delay = Math.max(0, REQUEST_INTERVAL_MS - (this.now().getTime() - this.lastRequestStartedAt));
    if (delay > 0) await new Promise<void>((resolve) => this.setTimer(resolve, delay));
    if (!this.started || this.stopped || generation !== this.generation || !this.canStartRequests()) return false;
    this.lastRequestStartedAt = this.now().getTime();
    return true;
  }

  private scheduleJob(job: HandleJob, delayMs: number): void {
    if (job.timer !== null) this.clearTimer(job.timer);
    job.retryAt = this.now().getTime() + delayMs;
    job.timer = this.setTimer(() => {
      job.timer = null;
      this.pump();
    }, delayMs);
  }

  private schedulePump(delayMs: number): void {
    if (this.pumpTimer !== null) return;
    this.pumpTimer = this.setTimer(() => {
      this.pumpTimer = null;
      this.pump();
    }, delayMs);
  }

  private canStartRequests(): boolean {
    return this.document.visibilityState === "visible" && this.onlineTarget.navigator?.onLine !== false;
  }

  private isCurrent(job: HandleJob, generation: number): boolean {
    return this.started && !this.stopped && generation === this.generation && this.jobs.get(job.handle) === job;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
