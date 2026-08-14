import { describe, expect, it } from "vitest";
import { calculateMapStageLayout } from "../apps/webapp/js/features/route-guidance/ui/map-stage-layout";
import { calculateMapViewportLayout } from "../apps/webapp/js/features/route-guidance/ui/route-map-pin-model";

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
});
