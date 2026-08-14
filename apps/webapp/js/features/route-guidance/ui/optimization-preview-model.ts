export interface OptimizationPreviewPoint {
  readonly space: string | null;
  readonly x: number;
  readonly y: number;
}

type PointAnchor =
  | { readonly center_x: number; readonly center_y: number }
  | { readonly x: number; readonly y: number };

export function buildOptimizationPreviewPoints(input: {
  currentPosition: { svgX?: number; svgY?: number } | null;
  bestOrder: readonly string[];
  pointIndex: ReadonlyMap<string, readonly PointAnchor[]>;
}): readonly OptimizationPreviewPoint[] {
  const points: OptimizationPreviewPoint[] = [];
  const x = Number(input.currentPosition?.svgX);
  const y = Number(input.currentPosition?.svgY);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    points.push({ space: null, x, y });
  }
  for (const space of input.bestOrder) {
    const anchor = input.pointIndex.get(space)?.[0];
    if (!anchor) continue;
    const anchorX = "x" in anchor ? anchor.x : anchor.center_x;
    const anchorY = "y" in anchor ? anchor.y : anchor.center_y;
    if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) continue;
    points.push({ space, x: anchorX, y: anchorY });
  }
  return Object.freeze(points);
}
