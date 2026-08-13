import { describe, expect, it } from "vitest";
import { layoutNearbyCatalogCards } from "../apps/webapp/js/features/route-guidance/ui/nearby-catalog-layout";

describe("layoutNearbyCatalogCards", () => {
  it("is deterministic and preserves anchor correspondence", () => {
    const input = {
      stageWidth: 800,
      stageHeight: 500,
      anchors: [
        { space: "東ア01", position: { x: 50, y: 50 } },
        { space: "東ア02", position: { x: 52, y: 50 } },
      ],
    } as const;
    const first = layoutNearbyCatalogCards(input);
    expect(layoutNearbyCatalogCards(input)).toEqual(first);
    expect(first.map(({ space, anchor }) => [space, anchor])).toEqual([
      ["東ア01", { x: 50, y: 50 }],
      ["東ア02", { x: 52, y: 50 }],
    ]);
    expect(first[0].x + first[0].width).toBeLessThanOrEqual(800);
  });

  it("keeps the requested candidate count", () => {
    const cards = layoutNearbyCatalogCards({
      stageWidth: 390,
      stageHeight: 300,
      anchors: Array.from({ length: 20 }, (_, index) => ({
        space: `東ア${index + 1}`,
        position: { x: 50, y: 50 },
      })),
    });
    expect(cards).toHaveLength(20);
  });
});
