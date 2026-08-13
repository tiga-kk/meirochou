export interface NearbyCatalogAnchor {
  readonly space: string;
  readonly x: number;
  readonly y: number;
}

export interface NearbyCatalogCardLayout {
  readonly space: string;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly candidateIndex: number;
}

export interface NearbyCatalogLayoutInput {
  readonly anchors: readonly NearbyCatalogAnchor[];
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly cardWidth?: number;
  readonly cardHeight?: number;
  readonly cardHeightForSpace?: (space: string) => number;
  readonly gap?: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlapArea(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function boundaryPenalty(rect: Rect, width: number, height: number): number {
  return Math.max(0, -rect.x) + Math.max(0, -rect.y)
    + Math.max(0, rect.x + rect.width - width)
    + Math.max(0, rect.y + rect.height - height);
}

function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x > rect.x && x < rect.x + rect.width && y > rect.y && y < rect.y + rect.height;
}

function slotPositions(size: number, cardSize: number, gap: number): number[] {
  const maximum = Math.max(0, size - cardSize);
  const positions: number[] = [];
  for (let position = 0; position <= maximum; position += cardSize + gap) {
    positions.push(position);
  }
  if (positions.at(-1) !== maximum) positions.push(maximum);
  return positions;
}

/** Deterministic greedy placement; candidates are evaluated in input order. */
export function layoutNearbyCatalogCards(input: NearbyCatalogLayoutInput): NearbyCatalogCardLayout[] {
  const width = Math.max(1, input.viewportWidth);
  const height = Math.max(1, input.viewportHeight);
  const cardWidth = Math.max(44, input.cardWidth ?? 176);
  const gap = Math.max(4, input.gap ?? 12);
  const placed: Rect[] = [];
  const xSlots = slotPositions(width, cardWidth, gap);

  return input.anchors.map((anchor, candidateIndex) => {
    const cardHeight = Math.max(
      44,
      input.cardHeightForSpace?.(anchor.space) ?? input.cardHeight ?? 132,
    );
    const ySlots = slotPositions(height, cardHeight, gap);
    const anchorX = anchor.x;
    const anchorY = anchor.y;
    const candidates: Rect[] = [];
    for (const y of ySlots) {
      for (const x of xSlots) candidates.push({ x, y, width: cardWidth, height: cardHeight });
    }
    candidates.push(
      ...[
        [0, -1], [0, 1], [-1, 0], [1, 0],
        [-1, -1], [1, -1], [-1, 1], [1, 1],
      ].map(([dx, dy]) => ({
        x: Math.max(0, Math.min(width - cardWidth, anchorX + dx * (cardWidth / 2 + gap) - cardWidth / 2)),
        y: Math.max(0, Math.min(height - cardHeight, anchorY + dy * (cardHeight / 2 + gap) - cardHeight / 2)),
        width: cardWidth,
        height: cardHeight,
      })),
    );
    let best: Rect | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const rect of candidates) {
      const score = boundaryPenalty(rect, width, height) * 1000
        + placed.reduce((total, previous) => total + overlapArea(rect, previous), 0) * 10
        + Math.hypot(rect.x + rect.width / 2 - anchorX, rect.y + rect.height / 2 - anchorY);
      const overlaps = placed.some((previous) => overlapArea(rect, previous) > 0);
      if (!overlaps && !containsPoint(rect, anchorX, anchorY) && score < bestScore) {
        best = rect;
        bestScore = score;
      }
    }
    if (!best) {
      best = candidates.reduce((current, rect) => {
        const overlap = placed.reduce((total, previous) => total + overlapArea(rect, previous), 0);
        const score = overlap * 10 + Math.hypot(rect.x + rect.width / 2 - anchorX, rect.y + rect.height / 2 - anchorY);
        return score < current.score ? { rect, score } : current;
      }, { rect: candidates[0], score: Number.POSITIVE_INFINITY }).rect;
    }
    const rect = best!;
    placed.push(rect);
    return { ...rect, space: anchor.space, anchor: { x: anchorX, y: anchorY }, candidateIndex };
  });
}
