import assert from "node:assert/strict";
import { test } from "vitest";

import { calculateRouteMotionMetrics } from "../apps/webapp/js/features/route-guidance/ui/route-motion-metrics";

test("keeps cue length near the screen-space target across route lengths", () => {
  const short = calculateRouteMotionMetrics({
    sourceRouteLengthPx: 40,
    imageWidth: 1200,
    renderedWidth: 600,
    zoomScale: 1,
  });
  const long = calculateRouteMotionMetrics({
    sourceRouteLengthPx: 2400,
    imageWidth: 1200,
    renderedWidth: 600,
    zoomScale: 1,
  });

  assert.ok(short);
  assert.ok(long);
  assert.ok(short.cueScreenLengthPx < 24);
  assert.ok(long.cueScreenLengthPx >= 23);
  assert.ok(long.cueScreenLengthPx <= 24);
});

test("keeps screen speed stable when zoom changes", () => {
  const initial = calculateRouteMotionMetrics({
    sourceRouteLengthPx: 1200,
    imageWidth: 1200,
    renderedWidth: 600,
    zoomScale: 1,
  });
  const zoomed = calculateRouteMotionMetrics({
    sourceRouteLengthPx: 1200,
    imageWidth: 1200,
    renderedWidth: 600,
    zoomScale: 4,
  });

  assert.ok(initial);
  assert.ok(zoomed);
  assert.ok(Math.abs(initial.speedScreenPxPerSecond - 96) < 0.001);
  assert.ok(Math.abs(zoomed.speedScreenPxPerSecond - 96) < 0.001);
  assert.ok(zoomed.durationMs > initial.durationMs);
});

test("rejects invalid geometry", () => {
  for (const input of [
    { sourceRouteLengthPx: 100, imageWidth: 0, renderedWidth: 600, zoomScale: 1 },
    { sourceRouteLengthPx: 100, imageWidth: 1200, renderedWidth: 0, zoomScale: 1 },
    { sourceRouteLengthPx: Number.NaN, imageWidth: 1200, renderedWidth: 600, zoomScale: 1 },
  ]) {
    assert.equal(calculateRouteMotionMetrics(input), null);
  }
});
