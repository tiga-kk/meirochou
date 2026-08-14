import { describe, expect, test } from "vitest";
import { buildOptimizationPreviewPoints } from "../apps/webapp/js/features/route-guidance/ui/optimization-preview-model";

describe("buildOptimizationPreviewPoints", () => {
  test("builds start and available circle anchors in best order", () => {
    const points = buildOptimizationPreviewPoints({
      currentPosition: { svgX: 5, svgY: 6 },
      bestOrder: ["東A02b", "東A-missing", "東A01a"],
      pointIndex: new Map([
        ["東A01a", [{ center_x: 10, center_y: 20 }]],
        ["東A02b", [{ center_x: 30, center_y: 40 }]],
      ]),
    });

    expect(points).toEqual([
      { space: null, x: 5, y: 6 },
      { space: "東A02b", x: 30, y: 40 },
      { space: "東A01a", x: 10, y: 20 },
    ]);
  });

  test("skips invalid anchors and does not produce a drawable line below two points", () => {
    expect(buildOptimizationPreviewPoints({
      currentPosition: null,
      bestOrder: ["東A-missing"],
      pointIndex: new Map(),
    })).toEqual([]);
  });
});
