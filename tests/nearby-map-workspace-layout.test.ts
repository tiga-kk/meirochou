import { describe, expect, it } from "vitest";
import { calculateNearbyMapWorkspaceLayout } from "../apps/webapp/js/features/route-guidance/ui/nearby-map-workspace-layout";

describe("calculateNearbyMapWorkspaceLayout", () => {
  it("uses a two-column catalog panel below the map on narrow phones", () => {
    const layout = calculateNearbyMapWorkspaceLayout({
      viewportWidth: 390,
      viewportHeight: 844,
      controlsHeight: 160,
      imageWidth: 2000,
      imageHeight: 1000,
    });

    expect(layout.mode).toBe("narrow");
    expect(layout.cardColumns).toBe(2);
    expect(layout.mapWidth).toBe(390);
    expect(layout.mapHeight).toBeGreaterThanOrEqual(320);
    expect(layout.panelHeight).toBeGreaterThan(0);
    expect(layout.initialMapScaleMode).toBe("bounded-cover");
  });

  it("gives a medium viewport a larger map and three-column wrapping panel", () => {
    const layout = calculateNearbyMapWorkspaceLayout({
      viewportWidth: 644,
      viewportHeight: 886,
      controlsHeight: 160,
      imageWidth: 1600,
      imageHeight: 1000,
    });

    expect(layout.mode).toBe("medium");
    expect(layout.cardColumns).toBe(3);
    expect(layout.mapHeight).toBeGreaterThanOrEqual(400);
    expect(layout.panelHeight).toBeGreaterThan(0);
  });

  it("uses a right panel on wide viewports", () => {
    const layout = calculateNearbyMapWorkspaceLayout({
      viewportWidth: 1024,
      viewportHeight: 700,
      controlsHeight: 140,
      imageWidth: 1600,
      imageHeight: 1000,
    });

    expect(layout.mode).toBe("wide");
    expect(layout.panelWidth).toBeGreaterThanOrEqual(280);
    expect(layout.panelWidth).toBeLessThanOrEqual(340);
    expect(layout.mapWidth).toBeGreaterThan(layout.panelWidth);
    expect(layout.mapHeight).toBe(560);
  });

  it("preserves aspect ratio when bounded-cover is selected", () => {
    const layout = calculateNearbyMapWorkspaceLayout({
      viewportWidth: 390,
      viewportHeight: 844,
      controlsHeight: 160,
      imageWidth: 2000,
      imageHeight: 1000,
    });

    const scale = Math.max(
      layout.mapWidth / 2000,
      layout.mapHeight / 1000,
    );
    expect(scale * 2000 / (scale * 1000)).toBe(2);
  });
});
