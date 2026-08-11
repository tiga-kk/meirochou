import { describe, expect, it } from "vitest";
import {
  collectGalleryPriorities,
  galleryPriority,
  selectGalleryCircles,
} from "../apps/webapp/js/features/circle-status/ui/gallery-view-model";

const circles = [
  { space: "東A01", priority: 1 },
  { space: "東A02", priority: 12 },
  { space: "西A01", priority: 0 },
  { space: "西A02", priority: -1 },
  { space: "西A03", priority: undefined },
];

describe("gallery view model", () => {
  it("selects every unvisited circle for the global scope", () => {
    expect(
      selectGalleryCircles({
        scope: { kind: "all-unvisited" },
        unvisited: circles,
        wantToBuy: [],
        holdSpaces: new Set(),
        resolveAreaId: () => "east",
      }),
    ).toEqual(circles);
  });

  it("keeps area and hold scopes filtered", () => {
    expect(
      selectGalleryCircles({
        scope: { kind: "area", areaId: "west" },
        unvisited: circles,
        wantToBuy: [],
        holdSpaces: new Set(),
        resolveAreaId: (space) => (space.startsWith("西") ? "west" : "east"),
      }).map(({ space }) => space),
    ).toEqual(["西A01", "西A02", "西A03"]);

    expect(
      selectGalleryCircles({
        scope: { kind: "hold", areaId: "west" },
        unvisited: [],
        wantToBuy: circles,
        holdSpaces: new Set(["西A02", "東A01"]),
        resolveAreaId: (space) => (space.startsWith("西") ? "west" : "east"),
      }).map(({ space }) => space),
    ).toEqual(["西A02"]);
  });

  it("collects finite priorities without collapsing missing values into zero", () => {
    expect(collectGalleryPriorities(circles)).toEqual([12, 1, 0, -1]);
    expect(galleryPriority(undefined)).toBeNull();
    expect(galleryPriority("")).toBeNull();
    expect(galleryPriority("not-a-number")).toBeNull();
    expect(galleryPriority(0)).toBe(0);
  });
});
