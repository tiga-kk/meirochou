import { describe, expect, it } from "vitest";
import { classifyCatalogOrientation } from "../apps/webapp/js/features/route-guidance/ui/catalog-orientation";

describe("classifyCatalogOrientation", () => {
  it("classifies portrait and landscape catalogs", () => {
    expect(classifyCatalogOrientation({ width: 700, height: 1200 })).toBe(
      "portrait",
    );
    expect(classifyCatalogOrientation({ width: 1200, height: 700 })).toBe(
      "landscape",
    );
  });

  it("keeps near-square and invalid dimensions explicit", () => {
    expect(classifyCatalogOrientation({ width: 100, height: 100 })).toBe(
      "square",
    );
    expect(classifyCatalogOrientation({ width: 0, height: 100 })).toBe("none");
    expect(classifyCatalogOrientation({ width: Number.NaN, height: 100 })).toBe(
      "none",
    );
  });
});
