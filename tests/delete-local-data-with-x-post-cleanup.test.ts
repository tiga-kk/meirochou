import { describe, expect, it, vi } from "vitest";
import { DeleteLocalDataWithXPostCleanup } from "../apps/webapp/js/app/delete-local-data-with-x-post-cleanup";
import type { LocalDataDeletionScope } from "../apps/webapp/js/features/local-data-deletion/public-api";
import type { XPostCache } from "../apps/webapp/js/features/x-post-monitoring/public-api";

const ref = { eventId: "event", dayId: "day1" };

function makeCache(): XPostCache & {
  deleteEventDay: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    put: vi.fn(),
    deleteEventDay: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
}

describe("DeleteLocalDataWithXPostCleanup", () => {
  it.each<LocalDataDeletionScope>([
    { kind: "circle-source", eventDay: ref },
    { kind: "event-day", eventDay: ref },
  ])("removes the event/day cache for %s", async (scope) => {
    const cache = makeCache();
    const inner = { execute: vi.fn(async () => {}) };

    await new DeleteLocalDataWithXPostCleanup(inner, cache).execute(scope);

    expect(inner.execute).toHaveBeenCalledWith(scope);
    expect(cache.deleteEventDay).toHaveBeenCalledWith(ref);
    expect(cache.clear).not.toHaveBeenCalled();
  });

  it("preserves X-post cache for activity deletion and clears all data globally", async () => {
    const cache = makeCache();
    const inner = { execute: vi.fn(async () => {}) };
    const operation = new DeleteLocalDataWithXPostCleanup(inner, cache);

    await operation.execute({ kind: "activity", eventDay: ref });
    expect(cache.deleteEventDay).not.toHaveBeenCalled();
    expect(cache.clear).not.toHaveBeenCalled();

    await operation.execute({ kind: "all-event-days" });
    expect(cache.clear).toHaveBeenCalledOnce();
  });

  it("does not touch cache after formal deletion failure and keeps cleanup nonfatal", async () => {
    const cache = makeCache();
    const inner = { execute: vi.fn(async () => { throw new Error("formal failure"); }) };
    await expect(
      new DeleteLocalDataWithXPostCleanup(inner, cache).execute({ kind: "event-day", eventDay: ref }),
    ).rejects.toThrow("formal failure");
    expect(cache.deleteEventDay).not.toHaveBeenCalled();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    cache.deleteEventDay.mockRejectedValueOnce(new Error("cache failure"));
    await expect(
      new DeleteLocalDataWithXPostCleanup({ execute: vi.fn(async () => {}) }, cache)
        .execute({ kind: "event-day", eventDay: ref }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
