import type { RouteResult } from "../domain/routing/grid-route-types";

const SVG_NS = "http://www.w3.org/2000/svg";

export type RouteOverlayKind = "current" | "candidate";

interface FallbackOverlay {
  className: string;
  style: { pointerEvents: string };
  getAttribute(name: string): string | null;
  querySelector(
    selector: string,
  ): { getAttribute(name: string): string | null } | null;
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
      return selector === "polyline" ? polyline : null;
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

  const polyline = ownerDocument.createElementNS(SVG_NS, "polyline");
  polyline.setAttribute("class", "route-overlay-line");
  polyline.setAttribute(
    "points",
    route.points.map((point) => `${point.x},${point.y}`).join(" "),
  );
  svg.appendChild(polyline);

  return svg;
}
