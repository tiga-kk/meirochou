const TARGET_CUE_SCREEN_PX = 24;
const MAX_CUE_ROUTE_FRACTION = 0.4;
const TARGET_SPEED_SCREEN_PX_PER_SECOND = 96;
const MIN_DURATION_MS = 600;

export interface RouteMotionMetricsInput {
  sourceRouteLengthPx: number;
  imageWidth: number;
  renderedWidth: number;
  zoomScale: number;
}

export interface RouteMotionMetrics {
  screenRouteLengthPx: number;
  cueScreenLengthPx: number;
  cuePathLengthUnits: number;
  gapPathLengthUnits: number;
  durationMs: number;
  speedScreenPxPerSecond: number;
}

export function calculateRouteMotionMetrics(
  input: RouteMotionMetricsInput,
): RouteMotionMetrics | null {
  const { sourceRouteLengthPx, imageWidth, renderedWidth, zoomScale } = input;
  if (
    ![sourceRouteLengthPx, imageWidth, renderedWidth, zoomScale].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return null;
  }

  const screenRouteLengthPx =
    sourceRouteLengthPx * (renderedWidth / imageWidth) * zoomScale;
  if (!Number.isFinite(screenRouteLengthPx) || screenRouteLengthPx <= 0)
    return null;

  const cueScreenLengthPx = Math.min(
    TARGET_CUE_SCREEN_PX,
    screenRouteLengthPx * MAX_CUE_ROUTE_FRACTION,
  );
  const cuePathLengthUnits = (cueScreenLengthPx / screenRouteLengthPx) * 100;
  const gapPathLengthUnits = 100 - cuePathLengthUnits;
  const durationMs = Math.max(
    MIN_DURATION_MS,
    (screenRouteLengthPx / TARGET_SPEED_SCREEN_PX_PER_SECOND) * 1000,
  );
  const values = [
    cueScreenLengthPx,
    cuePathLengthUnits,
    gapPathLengthUnits,
    durationMs,
  ];
  if (!values.every(Number.isFinite)) return null;

  return {
    screenRouteLengthPx,
    cueScreenLengthPx,
    cuePathLengthUnits,
    gapPathLengthUnits,
    durationMs,
    speedScreenPxPerSecond:
      screenRouteLengthPx / (durationMs / 1000),
  };
}
