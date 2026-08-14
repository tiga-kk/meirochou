// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { DomRouteMapView } from "../apps/webapp/js/features/route-guidance/ui/dom-route-map-view";
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
    expect(layout.stageHeight).toBeCloseTo(176);
    expect(layout.initialX).toBeLessThan(0);
    expect(layout.initialY).toBeCloseTo(22);
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
    expect(layout.stageWidth).toBeCloseTo(312);
    expect(layout.stageHeight).toBeCloseTo(624);
    expect(layout.initialX).toBeCloseTo(39);
    expect(layout.initialY).toBeCloseTo(-52);
  });
});

describe("DomRouteMapView map gesture tuning", () => {
  it("uses the map-only 18px overscroll limit", () => {
    document.body.innerHTML = `
      <div id="target-map-container">
        <div id="navigation-map">
          <div id="navigation-map-layer"></div>
        </div>
      </div>
      <div id="navigation-map-image"></div>
      <div id="navigation-pin-layer"></div>
      <div id="map-links-container"></div>
    `;

    const view = new DomRouteMapView(
      { dataManager: {} },
      { getAllMapAreas: () => [] },
    );

    expect(view.zoomHelper.overscrollLimit).toBe(18);
  });
});
