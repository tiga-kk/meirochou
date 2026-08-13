import type { RouteResult } from "../domain/routing/grid-route-types";

const SVG_NS = "http://www.w3.org/2000/svg";

export type RouteOverlayKind = "current" | "candidate";

interface FallbackOverlay {
  className: string;
  style: { pointerEvents: string };
  getAttribute(name: string): string | null;
  querySelector(selector: string): {
    getAttribute(name: string): string | null;
    textContent?: string | null;
  } | null;
}

function createFallbackOverlay(
  route: RouteResult,
  kind: RouteOverlayKind,
): FallbackOverlay {
  const attributes = new Map<string, string>();
  attributes.set("viewBox", `0 0 ${route.image.width} ${route.image.height}`);
  attributes.set("data-route-kind", kind);
  const polyline = {
    getAttribute(name: string) {
      if (name === "points") {
        return route.points.map((point) => `${point.x},${point.y}`).join(" ");
      }
      return null;
    },
  };
  const flow = kind === "current" ? { getAttribute: () => null } : null;
  const direction = {
    getAttribute(name: string) {
      return name === "marker-end" ? "url(#route-direction-arrow)" : null;
    },
  };
  const startMarker = { getAttribute: () => null, textContent: "S" };
  const goalMarker = { getAttribute: () => null, textContent: "G" };

  return {
    className:
      kind === "candidate"
        ? "route-overlay route-overlay-candidate"
        : "route-overlay",
    style: { pointerEvents: "none" },
    getAttribute(name: string) {
      return attributes.get(name) || null;
    },
    querySelector(selector: string) {
      if (selector === "polyline" || selector === ".route-overlay-line")
        return polyline;
      if (selector === ".route-flow-line" || selector === ".route-flow-comet")
        return flow;
      if (selector === ".route-flow-direction")
        return kind === "current" ? direction : null;
      if (selector === ".route-start-marker")
        return startMarker;
      if (selector === ".route-goal-marker")
        return goalMarker;
      return null;
    },
  };
}

export function buildRouteOverlaySvg(
  route: RouteResult | null,
  ownerDocument: Document | undefined = globalThis.document,
  kind: RouteOverlayKind = "current",
): SVGSVGElement | FallbackOverlay | null {
  if (
    !route?.image?.width ||
    !route?.image?.height ||
    !Array.isArray(route?.points) ||
    route.points.length < 2
  ) {
    return null;
  }

  if (!ownerDocument?.createElementNS) {
    return createFallbackOverlay(route, kind);
  }

  const svg = ownerDocument.createElementNS(SVG_NS, "svg");
  svg.setAttribute(
    "class",
    kind === "candidate"
      ? "route-overlay route-overlay-candidate"
      : "route-overlay",
  );
  svg.setAttribute("data-route-kind", kind);
  svg.setAttribute("viewBox", `0 0 ${route.image.width} ${route.image.height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.style.pointerEvents = "none";

  if (kind === "current") {
    const defs = ownerDocument.createElementNS(SVG_NS, "defs");
    const marker = ownerDocument.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", "route-direction-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "22");
    marker.setAttribute("markerHeight", "22");
    marker.setAttribute("markerUnits", "userSpaceOnUse");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrow = ownerDocument.createElementNS(SVG_NS, "path");
    arrow.setAttribute("class", "route-direction-arrow");
    arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svg.appendChild(defs);
  }

  const polyline = ownerDocument.createElementNS(SVG_NS, "polyline");
  polyline.setAttribute("class", "route-overlay-line");
  polyline.setAttribute("pathLength", "100");
  polyline.setAttribute(
    "points",
    route.points.map((point) => `${point.x},${point.y}`).join(" "),
  );
  svg.appendChild(polyline);

  if (kind === "current") {
    const flow = ownerDocument.createElementNS(SVG_NS, "polyline");
    flow.setAttribute("class", "route-flow-comet route-flow-line");
    flow.setAttribute("pathLength", "100");
    flow.setAttribute("points", polyline.getAttribute("points") || "");
    svg.appendChild(flow);
  }

  if (kind === "current") {
    const direction = ownerDocument.createElementNS(SVG_NS, "polyline");
    direction.setAttribute("class", "route-flow-direction");
    direction.setAttribute("pathLength", "100");
    direction.setAttribute("points", polyline.getAttribute("points") || "");
    direction.setAttribute("marker-end", "url(#route-direction-arrow)");
    svg.appendChild(direction);

  }

  const [start, goal] = [route.points[0], route.points.at(-1)];
  for (const [point, className, label] of [
    [start, "route-start-marker", "S"],
    [goal, "route-goal-marker", "G"],
  ] as const) {
    const marker = ownerDocument.createElementNS(SVG_NS, "g");
    marker.setAttribute("class", `route-endpoint ${className}`);
    marker.setAttribute("transform", `translate(${point.x} ${point.y})`);
    const circle = ownerDocument.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", className === "route-goal-marker" ? "20" : "18");
    const text = ownerDocument.createElementNS(SVG_NS, "text");
    text.textContent = label;
    marker.append(circle, text);
    svg.appendChild(marker);
  }

  return svg;
}
