// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { DomRouteGuidanceView } from "../apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view";

const ids = [
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

function installDom() {
  document.body.innerHTML = `
    ${ids.map((id) => `<div id="${id}"></div>`).join("")}
    <div id="navigation-map">
      <div id="navigation-map-layer">
        <img id="navigation-map-image" />
        <div id="navigation-pin-layer"></div>
      </div>
    </div>
    <div id="map-links-container"></div>
    <div id="candidate-preview-surface" class="hidden"></div>
  `;
}

function makeCatalog() {
  const area = {
    id: "east",
    name: "東",
    prefixes: ["東"],
    labels: ["A"],
    mapFile: "east.svg",
  };
  return {
    getAllMapAreas: () => [area],
    findMapAreaForCircleSpace: (space: string) =>
      space.startsWith("東A") ? area : null,
  };
}

describe("production map pin candidate preview", () => {
  it("opens an independent surface from a real pin click and preserves current detail", () => {
    installDom();
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: undefined,
    });
    const current = { space: "東A01", priority: 1 };
    const candidate = {
      space: "東A02",
      priority: 8,
      gridDistance: 120,
      tweet: "https://example.test/catalog.jpg",
      account: "https://x.com/circle",
    };
    const view = new DomRouteGuidanceView(makeCatalog());
    const dataManager = {
      getUnvisited: () => [current, candidate],
      wantToBuy: [current, candidate],
      purchasedList: [],
      holdList: [],
    };
    view.dataManager = dataManager;
    view.onSelectTarget = () => undefined;
    view.onSetNextTarget = () => undefined;
    let cancelCalls = 0;
    view.onCloseRouteSelection = () => {
      cancelCalls += 1;
    };
    view.mapRenderer.pointIndexCache.set("east", new Map());

    view.showNavigation({
      currentTarget: current,
      selectedTarget: current,
      currentRoute: null,
      selectedRoute: null,
      startSpace: "東A00",
      selectionState: "idle",
    });

    const pin = document.querySelector<HTMLButtonElement>(
      '[data-space="東A02"]',
    );
    expect(pin).not.toBeNull();
    pin?.click();

    const surface = document.querySelector("#candidate-preview-surface");
    expect(surface?.classList.contains("hidden")).toBe(false);
    expect(surface?.textContent).toContain("東A02");
    expect(surface?.textContent).toContain("距離 120");
    expect(surface?.textContent).toContain("優先度 8");
    expect(document.querySelector("#target-space-heading")?.textContent).toBe(
      "東A01",
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(surface?.classList.contains("hidden")).toBe(true);
    expect(cancelCalls).toBe(0);
    expect(document.querySelector("#target-space-heading")?.textContent).toBe(
      "東A01",
    );

    dataManager.getUnvisited = () => [current];
    dataManager.purchasedList = ["東A02"];
    view.showNavigation({
      currentTarget: current,
      selectedTarget: current,
      currentRoute: null,
      selectedRoute: null,
      startSpace: "東A00",
      selectionState: "idle",
    });
    expect(document.querySelector('[data-space="東A02"]')).toBeNull();
  });

  it.each(["button", "outside", "escape"])(
    "closes an active candidate route through the existing cancel path (%s)",
    (closeAction) => {
      installDom();
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: undefined,
      });
      const current = { space: "東A01", priority: 1 };
      const candidate = { space: "東A02", priority: 8 };
      const route = {
        image: { width: 100, height: 100 },
        points: [
          { x: 1, y: 1 },
          { x: 20, y: 20 },
        ],
        startPosition: { x: 1, y: 1 },
        targetPosition: { x: 20, y: 20 },
      };
      const view = new DomRouteGuidanceView(makeCatalog());
      view.dataManager = {
        getUnvisited: () => [current, candidate],
        wantToBuy: [current, candidate],
        purchasedList: [],
        holdList: [],
      };
      view.mapRenderer.pointIndexCache.set("east", new Map());
      let cancelCalls = 0;
      view.onCloseRouteSelection = () => {
        cancelCalls += 1;
        view.showNavigation({
          currentTarget: current,
          selectedTarget: current,
          currentRoute: route,
          selectedRoute: null,
          selectionState: "idle",
          startSpace: "東A00",
        });
      };

      view.showNavigation({
        currentTarget: current,
        selectedTarget: candidate,
        currentRoute: route,
        selectedRoute: route,
        selectionState: "ready",
        startSpace: "東A00",
      });
      document
        .querySelector<HTMLButtonElement>('[data-space="東A02"]')
        ?.click();

      if (closeAction === "button") {
        document
          .querySelector<HTMLButtonElement>(".candidate-preview-close")
          ?.click();
      } else if (closeAction === "outside") {
        document.body.click();
      } else {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      }

      expect(cancelCalls).toBe(1);
      expect(
        document
          .querySelector("#candidate-preview-surface")
          ?.classList.contains("hidden"),
      ).toBe(true);
      expect(document.querySelector("#target-space-heading")?.textContent).toBe(
        "東A01",
      );
      expect(
        document.querySelector('[data-route-kind="current"]'),
      ).not.toBeNull();
      expect(
        document.querySelector('[data-route-kind="candidate"]'),
      ).toBeNull();
    },
  );
});
