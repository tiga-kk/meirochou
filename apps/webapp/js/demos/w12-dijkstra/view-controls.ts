const MIN_ZOOM_PERCENT = 100;
const MAX_ZOOM_PERCENT = 300;
const ZOOM_STEP_PERCENT = 25;

export function normalizeZoomPercent(value: number): number {
  if (!Number.isFinite(value)) return MIN_ZOOM_PERCENT;
  const stepped = Math.round(value / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT;
  return Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, stepped));
}
