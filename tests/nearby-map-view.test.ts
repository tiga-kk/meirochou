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
  it("keeps the catalog panel and leader layer outside the map viewport", () => {
    renderDom();
    createView();

    const viewport = document.getElementById("nearby-map-viewport");
    const cardLayer = document.getElementById("nearby-map-card-layer");
    const leaderLayer = document.getElementById("nearby-map-leader-layer");

    expect(viewport?.contains(cardLayer)).toBe(false);
    expect(viewport?.contains(leaderLayer)).toBe(false);
    expect(cardLayer?.closest("#nearby-map-catalog-panel")).not.toBeNull();
    expect(leaderLayer?.closest("#nearby-map-workspace")).not.toBeNull();
  });

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

  it("closes only when the nearby destination callback succeeds", async () => {
    const view = Object.create(DomNearbyMapView.prototype) as any;
    const close = vi.fn();
    const button = document.createElement("button");
    view.close = close;
    view.onSetNextTarget = vi.fn(async () => true);

    await view.selectNearbyTarget({ space: "東ア01" }, null, button);

    expect(view.onSetNextTarget).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(false);

    close.mockReset();
    view.onSetNextTarget = vi.fn(async () => false);
    await view.selectNearbyTarget({ space: "東ア02" }, null, button);

    expect(close).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
  });
});
