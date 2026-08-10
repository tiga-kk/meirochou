// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import { DomRouteGuidanceView } from "../apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view";

const elementIds = [
  "target-loading",
  "target-empty",
  "target-content",
  "target-space-heading",
  "target-status-label",
  "selected-target-space",
  "target-sheet-name",
  "target-start-space",
  "target-route-log",
  "target-dist",
  "target-priority",
  "sub-target-space",
  "target-tweet-link",
  "tweet-embed-container",
  "route-selection-controls",
  "route-selection-message",
  "btn-preview-route",
  "btn-close-route-selection",
  "route-change-confirmation",
  "route-change-current",
  "route-change-current-distance",
  "route-change-candidate",
  "route-change-candidate-distance",
  "btn-confirm-route-change",
  "btn-cancel-route-change",
  "btn-purchased",
  "btn-hold",
  "toast",
];

function makeArea(
  id: string,
  prefixes: string[],
  labels: string[],
  metersPerPixel?: number,
) {
  return { id, name: id, prefixes, labels, metersPerPixel };
}

function makeCatalog(areas: ReturnType<typeof makeArea>[]) {
  return {
    getAllMapAreas: () => areas,
    findMapAreaForCircleSpace: (space: string) =>
      areas.find(
        (area) =>
          area.prefixes.includes(space[0]) && area.labels.includes(space[1]),
      ) ?? null,
  };
}

function makeView(areas: ReturnType<typeof makeArea>[]) {
  const view = new DomRouteGuidanceView(makeCatalog(areas));
  view.mapRenderer.renderNavigation = () => {};
  return view;
}

describe("DomRouteGuidanceView distance fallbacks", () => {
  beforeEach(() => {
    document.body.innerHTML = elementIds
      .map((id) => `<div id="${id}"></div>`)
      .join("");
  });

  it("hides grid distance for every uncomputed scaled-area route label", () => {
    const scaledArea = makeArea("scaled", ["東"], ["A"], 270 / 4096);
    const view = makeView([scaledArea]);
    const currentTarget = { space: "東A01", gridDistance: 928.4, priority: 1 };
    const candidateTarget = { space: "東A02", gridDistance: 42.3, priority: 2 };

    view.showNavigation({
      currentTarget,
      selectedTarget: candidateTarget,
      currentRoute: null,
      selectedRoute: null,
      selectionState: "comparing",
      startSpace: "東A00",
    });

    expect(document.querySelector("#target-route-log")?.textContent).toBe(
      "距離 - / 次 なし",
    );
    expect(document.querySelector("#target-dist")?.textContent).toBe("距離 -");
    expect(
      document.querySelector("#route-change-current-distance")?.textContent,
    ).toBe("距離 -");
    expect(
      document.querySelector("#route-change-candidate-distance")?.textContent,
    ).toBe("距離 -");
  });

  it("keeps grid distance for every uncomputed fictional-area route label", () => {
    const fictionalArea = makeArea("fictional", ["西"], ["A"]);
    const view = makeView([fictionalArea]);
    const currentTarget = { space: "西A01", gridDistance: 18.4, priority: 1 };
    const candidateTarget = { space: "西A02", gridDistance: 42.3, priority: 2 };

    view.showNavigation({
      currentTarget,
      selectedTarget: candidateTarget,
      currentRoute: null,
      selectedRoute: null,
      selectionState: "comparing",
      startSpace: "西A00",
    });

    expect(document.querySelector("#target-route-log")?.textContent).toBe(
      "距離 18 / 次 なし",
    );
    expect(document.querySelector("#target-dist")?.textContent).toBe("距離 42");
    expect(
      document.querySelector("#route-change-current-distance")?.textContent,
    ).toBe("距離 18");
    expect(
      document.querySelector("#route-change-candidate-distance")?.textContent,
    ).toBe("距離 42");
  });
});
