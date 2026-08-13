import { describe, expect, it } from "vitest";
import { findNearestMapViewportPoint } from "../apps/webapp/js/features/route-guidance/ui/route-map-pin-model";

const points = [
  { identifier: "J", number: 23, x: 500, y: 500 },
  { identifier: "K", number: 24, x: 750, y: 500 },
  { identifier: "A", number: 1, x: 0, y: 0 },
];

describe("findNearestMapViewportPoint", () => {
  it("finds the point under the viewport center at scale one", () => {
    expect(findNearestMapViewportPoint({
      viewportWidth: 400,
      viewportHeight: 400,
      stageWidth: 1000,
      stageHeight: 1000,
      imageWidth: 1000,
      imageHeight: 1000,
      transform: { scale: 1, x: -300, y: -300 },
      points,
    })).toEqual(points[0]);
  });

  it("follows zoom and pan in source-image coordinates", () => {
    expect(findNearestMapViewportPoint({
      viewportWidth: 400,
      viewportHeight: 400,
      stageWidth: 1000,
      stageHeight: 1000,
      imageWidth: 1000,
      imageHeight: 1000,
      transform: { scale: 2, x: -1200, y: -800 },
      points,
    })).toEqual(points[1]);
  });

  it("clamps overscrolled center coordinates to the image boundary", () => {
    expect(findNearestMapViewportPoint({
      viewportWidth: 400,
      viewportHeight: 400,
      stageWidth: 1000,
      stageHeight: 1000,
      imageWidth: 1000,
      imageHeight: 1000,
      transform: { scale: 1, x: 900, y: 900 },
      points,
    })).toEqual(points[2]);
  });
});
