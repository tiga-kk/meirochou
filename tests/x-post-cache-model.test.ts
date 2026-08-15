import { describe, expect, it } from "vitest";
import {
  buildXPostCacheKey,
  mergeMatchedPosts,
  mergeRecentPosts,
} from "../apps/webapp/js/features/x-post-monitoring/domain/x-post-cache-model";

const post = (id: string, createdAt: string) => ({ id, text: id, createdAt });

describe("X post cache model", () => {
  it("keeps recent posts deduped, newest first, and bounded at 200", () => {
    const current = Array.from({ length: 200 }, (_, index) => post(String(index), `2026-08-15T00:${String(index % 60).padStart(2, "0")}:00.000Z`));
    const merged = mergeRecentPosts(current, [post("new", "2026-08-16T00:00:00.000Z"), current[0]]);
    expect(merged).toHaveLength(200);
    expect(merged[0].id).toBe("new");
    expect(new Set(merged.map(({ id }) => id)).size).toBe(200);
  });

  it("bounds matched evidence independently at 50", () => {
    const merged = mergeMatchedPosts([], Array.from({ length: 60 }, (_, index) => post(String(index), new Date(Date.UTC(2026, 7, 15, 0, 0, index)).toISOString())));
    expect(merged).toHaveLength(50);
    expect(merged[0].id).toBe("59");
  });

  it("separates event/day and normalizes handle identity", () => {
    expect(buildXPostCacheKey({ eventId: "C108", dayId: "day1" }, "User")).toBe("C108:day1:user");
    expect(buildXPostCacheKey({ eventId: "C108", dayId: "day2" }, "User")).not.toBe(buildXPostCacheKey({ eventId: "C108", dayId: "day1" }, "User"));
  });
});
