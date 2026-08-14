export interface RouteMotionPoint {
  readonly x: number;
  readonly y: number;
}

export interface RouteMotionSample extends RouteMotionPoint {
  readonly distance: number;
}

export interface RouteMotionControllerOptions {
  readonly cueCount: number;
  readonly speedScreenPxPerSecond: number;
  readonly requestFrame: typeof requestAnimationFrame;
  readonly cancelFrame: typeof cancelAnimationFrame;
  readonly onFrame?: (positions: readonly RouteMotionPoint[]) => void;
}

export interface RouteMotionController {
  setRouteGeometry(samples: readonly RouteMotionSample[]): void;
  setSpeedScreenPxPerSecond(speed: number): void;
  setEnabled(enabled: boolean): void;
  setGestureActive(active: boolean): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

export function sampleRouteGeometry(
  points: readonly RouteMotionPoint[],
): RouteMotionSample[] {
  if (points.length < 2) return [];
  const samples: RouteMotionSample[] = [];
  let distance = 0;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const previous = samples.at(-1);
    if (previous) {
      distance += Math.hypot(point.x - previous.x, point.y - previous.y);
    }
    samples.push({ x: point.x, y: point.y, distance });
  }
  return distance > 0 ? samples : [];
}

function pointAtDistance(
  samples: readonly RouteMotionSample[],
  distance: number,
): RouteMotionPoint {
  const first = samples[0];
  const last = samples.at(-1) ?? first;
  if (!first || !last) return { x: 0, y: 0 };
  if (distance <= first.distance) return { x: first.x, y: first.y };
  if (distance >= last.distance) return { x: last.x, y: last.y };

  for (let index = 1; index < samples.length; index += 1) {
    const next = samples[index];
    if (next.distance < distance) continue;
    const previous = samples[index - 1];
    const span = next.distance - previous.distance;
    const ratio = span > 0 ? (distance - previous.distance) / span : 0;
    return {
      x: previous.x + (next.x - previous.x) * ratio,
      y: previous.y + (next.y - previous.y) * ratio,
    };
  }
  return { x: last.x, y: last.y };
}

export function createRouteMotionController(
  options: RouteMotionControllerOptions,
): RouteMotionController {
  const cueCount = Number.isFinite(options.cueCount)
    ? Math.max(1, Math.floor(options.cueCount))
    : 5;
  let speed = Number.isFinite(options.speedScreenPxPerSecond)
    ? Math.max(0, options.speedScreenPxPerSecond)
    : 160;
  let samples: readonly RouteMotionSample[] = [];
  let totalDistance = 0;
  let phaseDistance = 0;
  let enabled = false;
  let gestureActive = false;
  let resumeAfterGesture = false;
  let running = false;
  let frameId: number | null = null;
  let lastTimestamp: number | null = null;

  const cancelScheduledFrame = () => {
    if (frameId === null) return;
    options.cancelFrame(frameId);
    frameId = null;
  };

  const emitFrame = () => {
    if (!options.onFrame || totalDistance <= 0) return;
    const positions = Array.from({ length: cueCount }, (_, index) => {
      const distance =
        (phaseDistance + (totalDistance * index) / cueCount) % totalDistance;
      return pointAtDistance(samples, distance);
    });
    options.onFrame(positions);
  };

  const scheduleFrame = () => {
    if (!running || gestureActive || frameId !== null) return;
    frameId = options.requestFrame((timestamp) => {
      frameId = null;
      if (!running || gestureActive) return;
      const nextTimestamp = Number.isFinite(timestamp) ? timestamp : 0;
      if (lastTimestamp !== null && nextTimestamp >= lastTimestamp) {
        phaseDistance =
          (phaseDistance +
            ((nextTimestamp - lastTimestamp) * speed) / 1000) % totalDistance;
      }
      lastTimestamp = nextTimestamp;
      emitFrame();
      scheduleFrame();
    });
  };

  const start = () => {
    if (running || !enabled || gestureActive || totalDistance <= 0) return;
    running = true;
    lastTimestamp = null;
    scheduleFrame();
  };

  const stop = () => {
    running = false;
    lastTimestamp = null;
    cancelScheduledFrame();
  };

  return {
    setRouteGeometry(nextSamples) {
      samples = nextSamples.filter(
        (sample) =>
          Number.isFinite(sample.x) &&
          Number.isFinite(sample.y) &&
          Number.isFinite(sample.distance),
      );
      totalDistance = samples.at(-1)?.distance ?? 0;
      phaseDistance = totalDistance > 0 ? phaseDistance % totalDistance : 0;
      lastTimestamp = null;
    },
    setSpeedScreenPxPerSecond(nextSpeed) {
      if (Number.isFinite(nextSpeed)) speed = Math.max(0, nextSpeed);
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      if (!enabled) stop();
    },
    setGestureActive(active) {
      if (gestureActive === active) return;
      gestureActive = active;
      if (active) {
        resumeAfterGesture = running;
        cancelScheduledFrame();
        lastTimestamp = null;
      } else if (resumeAfterGesture) {
        resumeAfterGesture = false;
        scheduleFrame();
      }
    },
    start,
    stop,
    dispose() {
      stop();
      samples = [];
      totalDistance = 0;
      options.onFrame?.([]);
    },
  };
}
