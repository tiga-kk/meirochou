// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DefaultEventDayXPostMonitor,
  type XPostCache,
  type XPostCacheEntry,
  type XPostClient,
  type XPostPage,
} from "../apps/webapp/js/features/x-post-monitoring/public-api";

const ref = { eventId: "event", dayId: "day1" };

function makeReader(circles: readonly { space: string; account: string; status?: "pending" | "held" }[]) {
  return {
    getAllCircles: () => circles,
    getPendingCircles: () => circles.filter((circle) => circle.status !== "held"),
    getPurchasedCircleSpaces: () => [],
    getHeldCircleSpaces: () => circles.filter((circle) => circle.status === "held").map((circle) => circle.space),
    getCircleStatus: (space: string) => circles.find((circle) => circle.space === space)?.status ?? "pending",
  };
}

function makePage(posts: XPostPage["posts"], nextCursor: string | null): XPostPage {
  return { schemaVersion: 1, handle: "circle_1", posts, nextCursor, fetchedAt: "2026-08-15T01:00:00.000Z" };
}

function makeCache(initial: readonly XPostCacheEntry[] = []): XPostCache {
  const entries = new Map(initial.map((entry) => [entry.key, entry]));
  return {
    get: vi.fn(async (eventRef, handle) => entries.get(`${eventRef.eventId}:${eventRef.dayId}:${handle.toLowerCase()}`) ?? null),
    put: vi.fn(async (entry) => { entries.set(entry.key, entry); }),
    deleteEventDay: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
}

function makeEnvironment() {
  let nowMs = Date.parse("2026-08-15T01:00:00.000Z");
  const timers = new Set<() => void>();
  const onlineTarget = {
    navigator: { onLine: true },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const monitorClock = {
    now: () => new Date(nowMs),
    advance: (delayMs: number) => { nowMs += delayMs; },
    setTimer: (callback: () => void, delayMs: number) => {
      nowMs += delayMs;
      timers.add(callback);
      queueMicrotask(() => {
        timers.delete(callback);
        callback();
      });
      return callback;
    },
    clearTimer: (timer: unknown) => timers.delete(timer as () => void),
  };
  return { onlineTarget, monitorClock };
}

describe("DefaultEventDayXPostMonitor", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("shares one day scan across duplicate handles and only completes at null cursor", async () => {
    const reader = makeReader([
      { space: "東A01", account: "https://x.com/circle_1" },
      { space: "東A02", account: "https://x.com/circle_1", status: "held" },
    ]);
    const client: XPostClient = {
      fetchPage: vi.fn()
        .mockResolvedValueOnce(makePage([{ id: "1", text: "まだ完売していません", createdAt: "2026-08-15T00:00:00.000Z" }], "2"))
        .mockResolvedValueOnce(makePage([], null)),
    };
    const cache = makeCache();
    const { onlineTarget, monitorClock } = makeEnvironment();
    const monitor = new DefaultEventDayXPostMonitor({
      client,
      cache,
      activeEventDayReader: reader,
      document,
      onlineTarget,
      now: monitorClock.now,
      setTimer: monitorClock.setTimer,
      clearTimer: monitorClock.clearTimer,
    });

    monitor.start({ ref, eventDate: "2026-08-14" });
    await vi.waitFor(() => expect(client.fetchPage).toHaveBeenCalledTimes(2));

    expect(client.fetchPage).toHaveBeenCalledWith(expect.objectContaining({ handle: "circle_1", day: "2026-08-14" }));
    expect(monitor.getSaleMention("東A01").status).toBe("mention");
    expect(monitor.getSaleMention("東A02").status).toBe("mention");
    expect(monitor.getMentionSpaces()).toEqual(new Set(["東A01", "東A02"]));
    expect(monitorClock.now().getTime()).toBeGreaterThan(Date.parse("2026-08-15T01:00:00.000Z"));
  });

  it("keeps no-date scans unknown and does not call the client", async () => {
    const client: XPostClient = { fetchPage: vi.fn() };
    const { onlineTarget, monitorClock } = makeEnvironment();
    const monitor = new DefaultEventDayXPostMonitor({
      client,
      cache: makeCache(),
      activeEventDayReader: makeReader([{ space: "東A01", account: "https://x.com/circle_1" }]),
      document,
      onlineTarget,
      now: monitorClock.now,
      setTimer: monitorClock.setTimer,
      clearTimer: monitorClock.clearTimer,
    });

    monitor.start({ ref, eventDate: null });
    await Promise.resolve();
    expect(monitor.getSaleMention("東A01")).toEqual({ status: "unknown" });
    expect(client.fetchPage).not.toHaveBeenCalled();
  });

  it("stops repeated cursors as an error instead of retrying forever", async () => {
    const client: XPostClient = {
      fetchPage: vi.fn()
        .mockResolvedValueOnce(makePage([], "1"))
        .mockResolvedValueOnce(makePage([], "1")),
    };
    const { onlineTarget, monitorClock } = makeEnvironment();
    const monitor = new DefaultEventDayXPostMonitor({
      client,
      cache: makeCache(),
      activeEventDayReader: makeReader([{ space: "東A01", account: "https://x.com/circle_1" }]),
      document,
      onlineTarget,
      now: monitorClock.now,
      setTimer: monitorClock.setTimer,
      clearTimer: monitorClock.clearTimer,
    });

    monitor.start({ ref, eventDate: "2026-08-15" });
    await vi.waitFor(() => expect(client.fetchPage).toHaveBeenCalledTimes(2));
    expect(monitor.getSaleMention("東A01")).toEqual({ status: "unknown" });
    await Promise.resolve();
    expect(client.fetchPage).toHaveBeenCalledTimes(2);
  });
});
