// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DomRouteGuidanceView } from "../apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view";

const ids = [
  "target-loading",
  "target-empty",
  "target-content",
  "next-target",
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

function makeView() {
  return new DomRouteGuidanceView({
    getAllMapAreas: () => [],
    findMapAreaForCircleSpace: () => null,
  });
}

describe("route map first surface", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="btn-toggle-target-detail" type="button" aria-controls="target-detail" aria-expanded="false">詳細</button>
      <div id="target-detail" hidden></div>
      <div id="navigation-map"><div id="navigation-map-layer"></div></div>
      ${ids.map((id) => `<div id="${id}"></div>`).join("")}
    `;
  });

  it("starts collapsed and toggles detail without resetting map transform", () => {
    const view = makeView();
    const button = document.querySelector(
      "#btn-toggle-target-detail",
    ) as HTMLButtonElement;
    const detail = document.querySelector("#target-detail") as HTMLElement;
    const layer = document.querySelector("#navigation-map-layer") as HTMLElement;
    layer.style.transform = "translate(18px, -12px) scale(1.4)";

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(detail.hidden).toBe(true);

    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(detail.hidden).toBe(false);

    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(detail.hidden).toBe(true);
    expect(layer.style.transform).toBe("translate(18px, -12px) scale(1.4)");
    expect(view).toBeDefined();
  });

  it("keeps the navigation surface ordered as summary, map, actions, detail", () => {
    const html = readFileSync(
      resolve(process.cwd(), "apps/webapp/index.html"),
      "utf8",
    );
    expect(html.indexOf('class="navigation-summary"')).toBeLessThan(
      html.indexOf('id="navigation-map"'),
    );
    expect(html.indexOf('id="navigation-map"')).toBeLessThan(
      html.indexOf('id="btn-purchased"'),
    );
    expect(html.indexOf('id="btn-purchased"')).toBeLessThan(
      html.indexOf('id="target-detail"'),
    );
  });
});
