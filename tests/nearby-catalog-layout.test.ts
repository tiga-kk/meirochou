import { describe, expect, it } from "vitest";
import { layoutNearbyCatalogCards } from "../apps/webapp/js/features/route-guidance/ui/nearby-catalog-layout";

describe("layoutNearbyCatalogCards", () => {
  it("is deterministic and preserves anchor correspondence", () => {
    const input = {
      viewportWidth: 800,
      viewportHeight: 500,
      anchors: [
        { space: "東ア01", x: 400, y: 250 },
        { space: "東ア02", x: 416, y: 250 },
      ],
    } as const;
    const first = layoutNearbyCatalogCards(input);
    expect(layoutNearbyCatalogCards(input)).toEqual(first);
    expect(first.map(({ space, anchor }) => [space, anchor])).toEqual([
      ["東ア01", { x: 400, y: 250 }],
      ["東ア02", { x: 416, y: 250 }],
    ]);
    expect(first[0].x + first[0].width).toBeLessThanOrEqual(800);
  });

  it("keeps the requested candidate count", () => {
    const cards = layoutNearbyCatalogCards({
      viewportWidth: 390,
      viewportHeight: 300,
      anchors: Array.from({ length: 20 }, (_, index) => ({
        space: `東ア${index + 1}`,
        x: 195,
        y: 150,
      })),
    });
    expect(cards).toHaveLength(20);
  });

  it("places five dense screen-space cards without overlap", () => {
    const cards = layoutNearbyCatalogCards({
      viewportWidth: 390,
      viewportHeight: 520,
      anchors: [
        { space: "東ア01", x: 190, y: 250 },
        { space: "東ア02", x: 194, y: 254 },
        { space: "東ア03", x: 198, y: 258 },
        { space: "東ア04", x: 202, y: 262 },
        { space: "東ア05", x: 206, y: 266 },
      ],
      cardWidth: 120,
      cardHeight: 90,
    });

    expect(cards.map(({ space }) => space)).toEqual([
      "東ア01",
      "東ア02",
      "東ア03",
      "東ア04",
      "東ア05",
    ]);
    for (const card of cards) {
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(390);
      expect(card.y + card.height).toBeLessThanOrEqual(520);
    }
    for (let left = 0; left < cards.length; left += 1) {
      for (let right = left + 1; right < cards.length; right += 1) {
        const first = cards[left];
        const second = cards[right];
        expect(
          Math.max(
            0,
            Math.min(first.x + first.width, second.x + second.width) -
              Math.max(first.x, second.x),
          ) *
            Math.max(
              0,
              Math.min(first.y + first.height, second.y + second.height) -
                Math.max(first.y, second.y),
            ),
        ).toBe(0);
      }
    }
  });
});
