import { describe, expect, it } from "vitest";
import { resolveNearestMapPin } from "../apps/webapp/js/features/route-guidance/ui/route-map-pin-model";

const pins = [
  { space: "東ア31b", centerX: 100, centerY: 100, selectable: true },
  { space: "東ア41a", centerX: 118, centerY: 100, selectable: true },
];

describe("resolveNearestMapPin", () => {
  it("chooses the selectable pin nearest to the pointer", () => {
    expect(
      resolveNearestMapPin({
        clientX: 102,
        clientY: 100,
        candidates: pins,
      })?.space,
    ).toBe("東ア31b");
    expect(
      resolveNearestMapPin({
        clientX: 116,
        clientY: 100,
        candidates: pins,
      })?.space,
    ).toBe("東ア41a");
  });

  it("uses space as a deterministic tie-breaker and ignores unavailable pins", () => {
    expect(
      resolveNearestMapPin({
        clientX: 109,
        clientY: 100,
        candidates: [
          { ...pins[1], selectable: false },
          pins[0],
          { space: "東ア20a", centerX: 100, centerY: 100, selectable: true },
        ],
      })?.space,
    ).toBe("東ア20a");
  });
});
