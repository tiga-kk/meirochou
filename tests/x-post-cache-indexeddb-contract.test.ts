import { describe, expect, it } from "vitest";
import { BrowserIndexedDbXPostCache } from "../apps/webapp/js/features/x-post-monitoring/infrastructure/browser-indexed-db-x-post-cache";

describe("BrowserIndexedDbXPostCache", () => {
  it("degrades cleanly when IndexedDB is unavailable and dispose is idempotent", async () => {
    const cache = new BrowserIndexedDbXPostCache({ indexedDB: undefined });
    await expect(cache.get({ eventId: "C108", dayId: "day1" }, "user")).rejects.toThrow(/IndexedDB/);
    expect(() => { cache.dispose(); cache.dispose(); }).not.toThrow();
    await expect(cache.get({ eventId: "C108", dayId: "day1" }, "user")).rejects.toThrow(/disposed/);
  });
});
