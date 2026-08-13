import { describe, expect, it } from "vitest";

import { calculateStandaloneMapViewportLayout } from "../apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view";

describe("calculateStandaloneMapViewportLayout", () => {
  it("contains a tall map without cropping it", () => {
    const layout = calculateStandaloneMapViewportLayout({
      availableWidth: 390,
      availableHeight: 360,
      imageWidth: 1000,
      imageHeight: 2000,
    });

    expect(layout.stageWidth).toBe(180);
    expect(layout.stageHeight).toBe(360);
    expect(layout.initialX).toBe(105);
    expect(layout.initialY).toBe(0);
    expect(layout.stageWidth / layout.stageHeight).toBeCloseTo(0.5);
  });

  it("fits a wide map by width and keeps the full height visible", () => {
    const layout = calculateStandaloneMapViewportLayout({
      availableWidth: 390,
      availableHeight: 360,
      imageWidth: 2000,
      imageHeight: 1000,
    });

    expect(layout.stageWidth).toBe(390);
    expect(layout.stageHeight).toBe(195);
    expect(layout.initialX).toBe(0);
    expect(layout.initialY).toBe(82.5);
  });
});
