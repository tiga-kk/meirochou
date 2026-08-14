// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { calculateMapStageLayout } from "../apps/webapp/js/features/route-guidance/ui/map-stage-layout";
import { calculateMapViewportLayout } from "../apps/webapp/js/features/route-guidance/ui/route-map-pin-model";
import { DomRouteMapView } from "../apps/webapp/js/features/route-guidance/ui/dom-route-map-view";

describe("route map stage contract", () => {
  it("uses the shared stage geometry for the measured route viewport", () => {
    const input = {
      viewportWidth: 390,
      viewportHeight: 520,
      imageWidth: 1000,
      imageHeight: 2000,
    };
    const shared = calculateMapStageLayout(input);
    const route = calculateMapViewportLayout({
      ...input,
      viewportMaxHeight: input.viewportHeight,
      minimumInteractiveHeight: 220,
    });

    expect(shared).not.toBeNull();
    expect(route.viewportWidth).toBe(shared?.viewportWidth);
    expect(route.viewportHeight).toBe(shared?.viewportHeight);
    expect(route.stageWidth).toBeCloseTo(shared?.stageWidth ?? 0);
    expect(route.stageHeight).toBeCloseTo(shared?.stageHeight ?? 0);
    expect(route.initialX).toBeCloseTo(shared?.initialX ?? 0);
    expect(route.initialY).toBeCloseTo(shared?.initialY ?? 0);
  });

  it("reuses one optimization preview overlay and defers updates during gestures", () => {
    const pinLayer = document.createElement("div");
    const view = Object.create(DomRouteMapView.prototype) as any;
    view.els = {
      pinLayer,
      navigationMap: document.createElement("div"),
    };
    view.lastNavigationContext = {
      currentPosition: { svgX: 5, svgY: 5 },
      currentRoute: { image: { width: 100, height: 100 } },
    };
    view.optimizationPreviewPointIndex = new Map([
      ["東A01a", [{ x: 20, y: 20 }]],
      ["東A02b", [{ x: 80, y: 80 }]],
    ]);

    view.showOptimizationPreview({
      jobId: "job-1",
      generation: 1,
      elapsedMs: 250,
      searchTimeLimitMs: 5000,
      bestOrder: ["東A01a"],
      score: 1,
    });
    const overlay = pinLayer.querySelector(".optimization-preview-overlay") as SVGElement;
    const firstPoints = overlay.querySelector("polyline")?.getAttribute("points");
    view.showOptimizationPreview({
      jobId: "job-1",
      generation: 1,
      elapsedMs: 500,
      searchTimeLimitMs: 5000,
      bestOrder: ["東A02b"],
      score: 2,
    });
    expect(pinLayer.querySelectorAll(".optimization-preview-overlay")).toHaveLength(1);
    expect(overlay.querySelector("polyline")?.getAttribute("points")).not.toBe(firstPoints);

    view.setOptimizationPreviewGestureActive(true);
    const frozenPoints = overlay.querySelector("polyline")?.getAttribute("points");
    view.showOptimizationPreview({
      jobId: "job-1",
      generation: 1,
      elapsedMs: 750,
      searchTimeLimitMs: 5000,
      bestOrder: ["東A01a"],
      score: 3,
    });
    expect(overlay.querySelector("polyline")?.getAttribute("points")).toBe(frozenPoints);
    view.setOptimizationPreviewGestureActive(false);
    expect(overlay.querySelector("polyline")?.getAttribute("points")).not.toBe(frozenPoints);

    view.clearOptimizationPreview();
    expect(pinLayer.querySelector(".optimization-preview-overlay")).toBeNull();
    expect(view.els.navigationMap.querySelector(".optimization-preview-status")).toBeNull();
  });
});
