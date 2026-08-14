import { describe, expect, it } from "vitest";
import { paginateNearbyCatalog } from "../apps/webapp/js/features/route-guidance/ui/nearby-catalog-pagination";

describe("paginateNearbyCatalog", () => {
  it.each([5, 10, 15, 20])("returns the requested page ranges for %i items", (total) => {
    const items = Array.from({ length: total }, (_, index) => index + 1);
    const first = paginateNearbyCatalog(items, 0);
    expect(first.pageCount).toBe(total > 10 ? 2 : 1);
    expect(first.startNumber).toBe(1);
    expect(first.endNumber).toBe(Math.min(10, total));
    expect(first.items).toEqual(items.slice(0, 10));

    if (total > 10) {
      const second = paginateNearbyCatalog(items, 1);
      expect(second.startNumber).toBe(11);
      expect(second.endNumber).toBe(total);
      expect(second.items).toEqual(items.slice(10));
    }
  });

  it("clamps an invalid page index and preserves an empty page", () => {
    expect(paginateNearbyCatalog([], 8)).toMatchObject({
      pageIndex: 0,
      pageCount: 1,
      startNumber: 0,
      endNumber: 0,
      total: 0,
      items: [],
    });
  });
});
