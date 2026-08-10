import { describe, expect, it } from "vitest";
import { calculateMapViewportLayout } from "../apps/webapp/js/features/route-guidance/ui/route-map-pin-model";

describe("calculateMapViewportLayout", () => {
  it("uses the natural aspect ratio when it fits the interaction range", () => {
    const layout = calculateMapViewportLayout({
      viewportWidth: 390,
      viewportMaxHeight: 520,
      minimumInteractiveHeight: 220,
      imageWidth: 2904,
      imageHeight: 2166,
    });

    expect(layout.viewportHeight).toBeGreaterThan(220);
    expect(layout.stageWidth).toBe(390);
    expect(layout.stageWidth / layout.stageHeight).toBeCloseTo(2904 / 2166);
    expect(layout.initialX).toBe(0);
    expect(layout.initialY).toBe(0);
  });

  it("covers a minimum-height viewport for an extremely wide map", () => {
    const layout = calculateMapViewportLayout({
      viewportWidth: 390,
      viewportMaxHeight: 520,
      minimumInteractiveHeight: 220,
      imageWidth: 4096,
      imageHeight: 1438,
    });

    expect(layout.viewportHeight).toBe(220);
    expect(layout.stageWidth).toBeGreaterThan(390);
    expect(layout.stageHeight).toBe(220);
    expect(layout.initialX).toBeLessThan(0);
    expect(layout.initialY).toBe(0);
  });

  it("clips and vertically centers an extremely tall map", () => {
    const layout = calculateMapViewportLayout({
      viewportWidth: 390,
      viewportMaxHeight: 520,
      minimumInteractiveHeight: 220,
      imageWidth: 1000,
      imageHeight: 2000,
    });

    expect(layout.viewportHeight).toBe(520);
    expect(layout.stageWidth).toBe(390);
    expect(layout.stageHeight).toBe(780);
    expect(layout.initialX).toBe(0);
    expect(layout.initialY).toBe(-130);
  });
});
