import { describe, expect, it } from "vitest";
import {
  buildRouteGuidanceScreenModel,
  formatRouteDistance,
} from "../apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model";

describe("RouteGuidanceScreenModel", () => {
  it("formats physical route distance separately from weighted routing cost", () => {
    expect(
      formatRouteDistance({ cost: 900, physicalPixelLength: 100 }, 270 / 4096),
    ).toBe("約 7 m");
  });

  it("keeps the legacy cost label when a fictional area has no scale", () => {
    expect(formatRouteDistance({ cost: 900, physicalPixelLength: 100 })).toBe(
      "距離 900",
    );
  });

  it("does not use routing cost when scale exists without physical length", () => {
    expect(
      formatRouteDistance(
        { cost: 900 } as Parameters<typeof formatRouteDistance>[0],
        270 / 4096,
      ),
    ).toBe("距離 -");
    expect(
      formatRouteDistance({ cost: 900, physicalPixelLength: Number.NaN }, 0.1),
    ).toBe("距離 -");
  });

  it("formats an active destination and the next destination without exposing raw URLs", () => {
    const model = buildRouteGuidanceScreenModel({
      currentDestination: {
        space: "A01",
        priority: 3,
        account: "https://example.test/@circle",
        tweet: "https://example.test/catalog",
      },
      nextDestination: { space: "A02" },
      startSpace: "A00",
    });

    expect(model).toMatchObject({
      statusLabel: "次の目的地",
      space: "A01",
      nextLabel: "次 A02",
      priorityLabel: "優先度 3",
      accountUrl: "https://example.test/@circle",
      catalogUrl: "https://example.test/catalog",
    });
  });

  it("returns a safe completed model when there is no active destination", () => {
    expect(
      buildRouteGuidanceScreenModel({
        currentDestination: null,
        nextDestination: null,
        startSpace: "",
      }),
    ).toEqual({
      statusLabel: "完了",
      space: "COMPLETE",
      distanceLabel: "-",
      priorityLabel: "-",
      sheetNameLabel: "",
      nextLabel: "次 なし",
      accountLabel: "",
      accountUrl: "",
      catalogUrl: "",
      hasCatalogImage: false,
    });
  });
});
