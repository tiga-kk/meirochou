// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DefaultEventDayXPostMonitor,
  DomXPostPanel,
  type XPostCache,
  type XPostClient,
} from "../apps/webapp/js/features/x-post-monitoring/public-api";

const ref = { eventId: "event", dayId: "day1" };

function cache(): XPostCache {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    deleteEventDay: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
}

describe("X-post runtime lifecycle", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="target-x-posts">
        <p id="target-x-post-message"></p>
        <div id="target-x-post-list"></div>
      </section>`;
  });

  it("ignores a panel response that completes after dispose", async () => {
    let resolve!: (page: { schemaVersion: 1; handle: string; posts: []; nextCursor: null; fetchedAt: string }) => void;
    const client: XPostClient = {
      fetchPage: vi.fn(() => new Promise((done) => { resolve = done; })),
    };
    const panel = new DomXPostPanel({ document, client, cache: cache() });
    const pending = panel.show({ ref, circle: { space: "東A01", account: "https://x.com/circle" } });
    await vi.waitFor(() => expect(client.fetchPage).toHaveBeenCalledOnce());

    panel.dispose();
    resolve({ schemaVersion: 1, handle: "circle", posts: [], nextCursor: null, fetchedAt: "2026-08-15T00:00:00.000Z" });
    await pending;

    expect(document.querySelector("#target-x-posts")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector("#target-x-post-list")?.textContent).toBe("");
    await panel.show({ ref, circle: { space: "東A02", account: "https://x.com/another" } });
    expect(client.fetchPage).toHaveBeenCalledOnce();
  });

  it("removes monitor lifecycle listeners and rejects stale completion after stop", async () => {
    let resolve!: (page: any) => void;
    const client: XPostClient = {
      fetchPage: vi.fn(() => new Promise((done) => { resolve = done; })),
    };
    const onlineTarget = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const reader = {
      getAllCircles: () => [{ space: "東A01", account: "https://x.com/circle" }],
      getCircleStatus: () => "pending" as const,
    };
    const monitor = new DefaultEventDayXPostMonitor({
      client,
      cache: cache(),
      activeEventDayReader: reader,
      document,
      onlineTarget,
    });

    monitor.start({ ref, eventDate: "2026-08-15" });
    await vi.waitFor(() => expect(client.fetchPage).toHaveBeenCalledOnce());
    monitor.stop();
    resolve({ schemaVersion: 1, handle: "circle", posts: [], nextCursor: null, fetchedAt: "2026-08-15T00:00:00.000Z" });
    await Promise.resolve();

    expect(onlineTarget.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(monitor.getMentionSpaces()).toEqual(new Set());
  });
});
