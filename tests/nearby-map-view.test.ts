// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { DomNearbyMapView } from "../apps/webapp/js/features/route-guidance/ui/dom-nearby-map-view";

const areas = [
  {
    id: "east",
    areaId: "east",
    name: "東123",
    prefixes: ["東"],
    labels: ["ア"],
    mapFile: "/maps/east.svg",
    assets: { points: "east-points", gridMeta: "east-meta", grid: "east-grid" },
  },
  {
    id: "west",
    areaId: "west",
    name: "西456",
    prefixes: ["西"],
    labels: ["あ"],
    mapFile: "/maps/west.svg",
    assets: { points: "west-points", gridMeta: "west-meta", grid: "west-grid" },
  },
];

function renderDom() {
  document.body.innerHTML = `
    <button id="open-map">地図</button>
    <div id="nearby-map-surface" class="hidden"></div>
  `;
}

function createView() {
  const loader = {
    loadMapAssets: vi.fn(async () => ({
      points: {
        image: { width: 1000, height: 500 },
        points: [],
      },
      gridMetadata: { cell_size: 10, cols: 1, rows: 1, width: 1000, height: 500 },
      gridBytes: new Uint8Array([1]),
    })),
    clearCachedMapAssets: vi.fn(),
  };
  const view = new DomNearbyMapView(
    { getAllMapAreas: () => areas },
    loader,
    { getAllCircles: () => [{ space: "西あ01" }], getCircleStatus: () => "pending" },
  );
  return { view, loader };
}

describe("DomNearbyMapView", () => {
  it("opens without route guidance, selects the current form area, and changes assets", async () => {
    renderDom();
    const opener = document.getElementById("open-map") as HTMLButtonElement;
    const { view, loader } = createView();

    view.open(opener, "east");
    expect(view.isOpen()).toBe(true);
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect((document.getElementById("nearby-map-area") as HTMLSelectElement).value).toBe("east");

    const select = document.getElementById("nearby-map-area") as HTMLSelectElement;
    select.value = "west";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(loader.loadMapAssets).toHaveBeenCalledWith(areas[1]));
    expect(document.getElementById("nearby-map-image")?.getAttribute("src")).toBe("/maps/west.svg");
  });

  it("closes on Escape and returns focus without touching route state", () => {
    renderDom();
    const opener = document.getElementById("open-map") as HTMLButtonElement;
    const { view } = createView();
    view.open(opener, "west");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(view.isOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});
