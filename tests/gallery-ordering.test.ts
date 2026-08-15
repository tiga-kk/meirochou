// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { DomCircleGalleryView } from "../apps/webapp/js/features/circle-status/ui/dom-circle-gallery-view";
import { sortGalleryCirclesByMapPosition } from "../apps/webapp/js/features/circle-status/ui/gallery-view-model";

const areas = [{ name: "東", prefixes: ["東"], labels: ["ア", "イ", "ウ"] }];
const context = {
  areas,
  resolveAreaId: () => "east",
  pointsByAreaId: new Map([
    ["east", [
      { group_id: "W_all", identifier: "ア", number: 90, center_x: 0, center_y: 0 },
      { group_id: "I_01", identifier: "イ", number: 10, center_x: 10, center_y: 0 },
      { group_id: "I_02", identifier: "ウ", number: 10, center_x: 100, center_y: 0 },
    ]],
  ]),
};

describe("gallery map ordering", () => {
  it("ignores priority and anchors a wall to its nearest normal point", () => {
    const result = sortGalleryCirclesByMapPosition([
      { space: "東ウ10", priority: 1 },
      { space: "東ア90", priority: 100 },
      { space: "東イ10", priority: 2 },
    ], context);

    expect(result.map((circle) => circle.space)).toEqual(["東イ10", "東ア90", "東ウ10"]);
  });

  it("falls back to the original space key and does not mutate input", () => {
    const circles = [{ space: "東ア90", priority: 1 }, { space: "西ア1", priority: 9 }];
    const result = sortGalleryCirclesByMapPosition(circles, {
      ...context,
      resolveAreaId: () => null,
    });

    expect(result.map((circle) => circle.space)).toEqual(["西ア1", "東ア90"]);
    expect(circles.map((circle) => circle.space)).toEqual(["東ア90", "西ア1"]);
  });

  it("never uses a cross-area point as a wall anchor", () => {
    const result = sortGalleryCirclesByMapPosition([
      { space: "東ア90" },
      { space: "東イ10" },
    ], {
      areas: [...areas, { name: "西", prefixes: ["西"], labels: ["ア"] }],
      resolveAreaId: (space) => space.startsWith("東") ? "east" : "west",
      pointsByAreaId: new Map([
        ["east", [{ group_id: "W_all", identifier: "ア", number: 90, center_x: 0, center_y: 0 }]],
        ["west", [{ group_id: "I_01", identifier: "ア", number: 1, center_x: 1, center_y: 1 }]],
      ]),
    });

    expect(result.map((circle) => circle.space)).toEqual(["東ア90", "東イ10"]);
  });
});

describe("DomCircleGalleryView gallery ordering", () => {
  function setup() {
    document.body.innerHTML = `
      <div id="gallery-modal" class="hidden">
        <div id="gallery-grid"></div>
      </div>`;
  }

  it("renders fallback space order first, then applies async wall anchors once", async () => {
    setup();
    let resolvePoints!: (value: unknown) => void;
    const loader = () => new Promise((resolve) => { resolvePoints = resolve; });
    const dataManager = {
      getUnvisited: () => [
        { space: "東ウ10", priority: 1 },
        { space: "東ア90", priority: 100 },
        { space: "東イ10", priority: 2 },
      ],
      wantToBuy: [],
      holdList: [],
    };
    const view = new DomCircleGalleryView({ getAllMapAreas: () => [{ id: "east", name: "東", prefixes: ["東"], labels: ["ア", "イ", "ウ"] }] }, loader);
    view.dataManager = dataManager;
    view.showGallery({ kind: "all-unvisited" });
    expect([...document.querySelectorAll(".gallery-item")].map((item) => item.dataset.space)).toEqual(["東ア90", "東イ10", "東ウ10"]);

    resolvePoints({ points: [
      { group_id: "W_all", identifier: "ア", number: 90, center_x: 0, center_y: 0 },
      { group_id: "I_01", identifier: "イ", number: 10, center_x: 10, center_y: 0 },
      { group_id: "I_02", identifier: "ウ", number: 10, center_x: 100, center_y: 0 },
    ] });
    await vi.waitFor(() => expect([...document.querySelectorAll(".gallery-item")].map((item) => item.dataset.space)).toEqual(["東イ10", "東ア90", "東ウ10"]));
    expect([...document.querySelectorAll(".gallery-item")].map((item) => item.dataset.space)).toEqual(["東イ10", "東ア90", "東ウ10"]);
  });

  it("updates sale badges in place without changing order or creating post content", () => {
    setup();
    const circles = [{ space: "東ア01", priority: 1 }, { space: "東ア02", priority: 2 }];
    const view = new DomCircleGalleryView({ getAllMapAreas: () => [] });
    view.dataManager = { getUnvisited: () => circles, wantToBuy: [], holdList: [] };
    view.showGallery({ kind: "all-unvisited" });
    const before = [...document.querySelectorAll(".gallery-item")].map((item) => item.dataset.space);
    view.setSaleMentionSpaces(new Set(["東ア02"]));
    expect([...document.querySelectorAll(".gallery-item")].map((item) => item.dataset.space)).toEqual(before);
    expect(document.querySelectorAll(".gallery-sale-mention")).toHaveLength(1);
    expect(document.querySelector("#gallery-grid")?.textContent).not.toContain("投稿");
    view.setSaleMentionSpaces(new Set());
    expect(document.querySelectorAll(".gallery-sale-mention")).toHaveLength(0);
  });

  it("invalidates a late point load after the gallery closes", async () => {
    setup();
    let resolvePoints!: (value: unknown) => void;
    const view = new DomCircleGalleryView(
      { getAllMapAreas: () => [{ id: "east", name: "東", prefixes: ["東"], labels: ["ア"] }] },
      () => new Promise((resolve) => { resolvePoints = resolve; }),
    );
    view.dataManager = { getUnvisited: () => [{ space: "東ア01" }], wantToBuy: [], holdList: [] };
    view.showGallery({ kind: "all-unvisited" });
    view.hideGalleryModal();
    resolvePoints({ points: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector("#gallery-modal")?.classList.contains("hidden")).toBe(true);
    expect(document.querySelectorAll(".gallery-item")).toHaveLength(0);
  });
});
