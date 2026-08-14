export type PerimeterEdge = "top" | "right" | "bottom" | "left";

export interface PerimeterSlot {
  readonly index: number;
  readonly edge: PerimeterEdge;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function bandSize(
  width: number,
  height: number,
  mode: "narrow" | "medium" | "wide",
  minimumCardHeight: number,
): number {
  const fraction = mode === "medium" ? 0.16 : 0.18;
  return Math.min(
    180,
    Math.max(
      112,
      minimumCardHeight,
      Math.round(Math.min(width, height) * fraction),
    ),
  );
}

function edgeSlots(
  edge: PerimeterEdge,
  count: number,
  indexOffset: number,
  rect: Rect,
  band: number,
): PerimeterSlot[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    if (edge === "top" || edge === "bottom") {
      const width = rect.width / count;
      return {
        index: indexOffset + index,
        edge,
        x: rect.x + index * width,
        y: edge === "top" ? 0 : rect.y + rect.height,
        width,
        height: band,
      };
    }
    const height = rect.height / count;
    return {
      index: indexOffset + index,
      edge,
      x: edge === "left" ? 0 : rect.x + rect.width,
      y: rect.y + index * height,
      width: band,
      height,
    };
  });
}

export function buildNearbyPerimeterLayout(input: {
  workspaceWidth: number;
  workspaceHeight: number;
  itemCount: number;
  mode: "narrow" | "medium" | "wide";
  paginationHeight?: number;
  minimumCardHeight?: number;
}): {
  readonly mapRect: Rect;
  readonly slots: readonly PerimeterSlot[];
} {
  const width = positive(input.workspaceWidth);
  const height = positive(input.workspaceHeight);
  const count = Number.isInteger(input.itemCount) ? Math.max(0, input.itemCount) : 0;
  if (!width || !height) return { mapRect: { x: 0, y: 0, width, height }, slots: [] };
  if (count === 0) return { mapRect: { x: 0, y: 0, width, height }, slots: [] };

  const paginationHeight = Math.min(
    height,
    positive(input.paginationHeight ?? 0),
  );
  const contentHeight = Math.max(1, height - paginationHeight);
  const band = Math.min(
    bandSize(
      width,
      contentHeight,
      input.mode,
      positive(input.minimumCardHeight ?? 112),
    ),
    Math.floor(Math.min(width, contentHeight) / 2),
  );
  if (input.mode === "wide") {
    const insetX = Math.min(band, Math.floor(width / 3));
    const insetY = Math.min(band, Math.floor(height / 3));
    const mapRect = {
      x: insetX,
      y: insetY,
      width: Math.max(1, width - insetX * 2),
      height: Math.max(1, contentHeight - insetY * 2),
    };
    const base = Math.floor(count / 4);
    const remainder = count % 4;
    const counts = [0, 1, 2, 3].map((index) => base + (index < remainder ? 1 : 0));
    const slots = [
      ...edgeSlots("top", counts[0], 0, mapRect, band),
      ...edgeSlots("right", counts[1], counts[0], mapRect, band),
      ...edgeSlots("bottom", counts[2], counts[0] + counts[1], mapRect, band),
      ...edgeSlots("left", counts[3], counts[0] + counts[1] + counts[2], mapRect, band),
    ];
    return { mapRect, slots };
  }

  const topCount = Math.ceil(count / 2);
  const bottomCount = Math.floor(count / 2);
  const mapRect = {
    x: 0,
    y: topCount ? band : 0,
    width,
    height: Math.max(1, contentHeight - band * (topCount && bottomCount ? 2 : 1)),
  };
  return {
    mapRect,
    slots: [
      ...edgeSlots("top", topCount, 0, mapRect, band),
      ...edgeSlots("bottom", bottomCount, topCount, mapRect, band),
    ],
  };
}
