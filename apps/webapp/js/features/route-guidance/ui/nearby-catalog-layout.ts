import type { MapPoint } from "../../event-day/public-api";

export interface NearbyCatalogAnchor {
  readonly space: string;
  readonly position: MapPoint;
}

export interface NearbyCatalogCardLayout {
  readonly space: string;
  readonly anchor: MapPoint;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly candidateIndex: number;
}

export interface NearbyCatalogLayoutInput {
  readonly anchors: readonly NearbyCatalogAnchor[];
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly cardWidth?: number;
  readonly cardHeight?: number;
  readonly gap?: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DIRECTIONS = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
] as const;

function overlapArea(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function boundaryPenalty(rect: Rect, width: number, height: number): number {
  return Math.max(0, -rect.x) + Math.max(0, -rect.y)
    + Math.max(0, rect.x + rect.width - width)
    + Math.max(0, rect.y + rect.height - height);
}

/** Deterministic greedy placement; candidates are evaluated in input order. */
export function layoutNearbyCatalogCards(input: NearbyCatalogLayoutInput): NearbyCatalogCardLayout[] {
  const width = Math.max(1, input.stageWidth);
  const height = Math.max(1, input.stageHeight);
  const cardWidth = Math.max(44, input.cardWidth ?? 176);
  const cardHeight = Math.max(44, input.cardHeight ?? 132);
  const gap = Math.max(4, input.gap ?? 12);
  const placed: Rect[] = [];

  return input.anchors.map((anchor, candidateIndex) => {
    const anchorX = (anchor.position.x / 100) * width;
    const anchorY = (anchor.position.y / 100) * height;
    let best: Rect | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    DIRECTIONS.forEach(([dx, dy]) => {
      const rect = {
        x: anchorX + dx * (cardWidth / 2 + gap) - cardWidth / 2,
        y: anchorY + dy * (cardHeight / 2 + gap) - cardHeight / 2,
        width: cardWidth,
        height: cardHeight,
      };
      const score = boundaryPenalty(rect, width, height) * 1000
        + placed.reduce((total, previous) => total + overlapArea(rect, previous), 0) * 10
        + Math.hypot(rect.x + rect.width / 2 - anchorX, rect.y + rect.height / 2 - anchorY);
      if (score < bestScore) {
        best = rect;
        bestScore = score;
      }
    });
    const rect = best!;
    placed.push(rect);
    return { ...rect, space: anchor.space, anchor: anchor.position, candidateIndex };
  });
}
