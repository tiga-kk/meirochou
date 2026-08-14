import { describe, expect, it } from "vitest";
import { buildNearbyPerimeterLayout } from "../apps/webapp/js/features/route-guidance/ui/nearby-catalog-perimeter-layout";

function area(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

describe("buildNearbyPerimeterLayout", () => {
  it("keeps ten narrow cards outside a positive map rectangle", () => {
    const layout = buildNearbyPerimeterLayout({
      workspaceWidth: 390,
      workspaceHeight: 844,
      itemCount: 10,
      mode: "narrow",
    });

    expect(layout.slots).toHaveLength(10);
    expect(layout.mapRect.width).toBeGreaterThan(0);
    expect(layout.mapRect.height).toBeGreaterThan(0);
    expect(layout.slots.every((slot) => area(slot, layout.mapRect) === 0)).toBe(true);
    for (const left of layout.slots) {
      for (const right of layout.slots) {
        if (left.index < right.index) expect(area(left, right)).toBe(0);
      }
    }
  });

  it("uses all four edges for a wide workspace", () => {
    const layout = buildNearbyPerimeterLayout({
      workspaceWidth: 1024,
      workspaceHeight: 900,
      itemCount: 10,
      mode: "wide",
    });

    expect(new Set(layout.slots.map((slot) => slot.edge))).toEqual(
      new Set(["top", "right", "bottom", "left"]),
    );
    expect(layout.slots.every((slot) => area(slot, layout.mapRect) === 0)).toBe(true);
  });

  it("reserves the pager area below the bottom cards", () => {
    const layout = buildNearbyPerimeterLayout({
      workspaceWidth: 390,
      workspaceHeight: 844,
      itemCount: 10,
      mode: "narrow",
      paginationHeight: 60,
    });

    expect(Math.max(...layout.slots.map((slot) => slot.y + slot.height))).toBeLessThanOrEqual(784);
  });

  it("gives selected cards enough perimeter height without entering the map", () => {
    const layout = buildNearbyPerimeterLayout({
      workspaceWidth: 390,
      workspaceHeight: 844,
      itemCount: 10,
      mode: "narrow",
      minimumCardHeight: 136,
    });

    expect(Math.min(...layout.slots.map((slot) => slot.height))).toBeGreaterThanOrEqual(136);
    expect(layout.slots.every((slot) => area(slot, layout.mapRect) === 0)).toBe(true);
  });
});
