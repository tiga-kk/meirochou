import { describe, expect, test, vi } from "vitest";
import {
  createRouteMotionController,
  sampleRouteGeometry,
} from "../apps/webapp/js/features/route-guidance/ui/route-motion-controller";

describe("route motion controller", () => {
  test("moves five cues from start toward goal at the configured speed", () => {
    const callbacks = new Map<number, (time: number) => void>();
    const frames: Array<readonly { x: number; y: number }[]> = [];
    let nextId = 1;
    const controller = createRouteMotionController({
      cueCount: 5,
      speedScreenPxPerSecond: 160,
      requestFrame: (callback) => {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      },
      cancelFrame: (id) => callbacks.delete(id),
      onFrame: (positions) => frames.push(positions),
    });

    controller.setRouteGeometry(
      sampleRouteGeometry([
        { x: 0, y: 0 },
        { x: 160, y: 0 },
      ]),
    );
    controller.setEnabled(true);
    controller.start();
    const firstFrame = [...callbacks.values()][0];
    callbacks.clear();
    firstFrame(0);

    expect(frames.at(-1)).toHaveLength(5);
    expect(frames.at(-1)?.[0]).toEqual({ x: 0, y: 0 });
    expect(frames.at(-1)?.[4]).toEqual({ x: 128, y: 0 });

    const nextFrame = [...callbacks.values()][0];
    callbacks.clear();
    nextFrame(500);
    expect(frames.at(-1)?.[0].x).toBe(80);
    expect(frames.at(-1)?.[0].y).toBe(0);
    expect(frames.at(-1)?.[0].x).toBeGreaterThan(0);
    expect(frames.at(-1)?.[4].x).toBeGreaterThanOrEqual(0);
  });

  test("pauses frame updates during gesture and resumes without rebuilding geometry", () => {
    const requestFrame = vi.fn((callback: (time: number) => void) => 1);
    const cancelFrame = vi.fn();
    const onFrame = vi.fn();
    const controller = createRouteMotionController({
      cueCount: 5,
      speedScreenPxPerSecond: 160,
      requestFrame,
      cancelFrame,
      onFrame,
    });
    const geometry = sampleRouteGeometry([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
    controller.setRouteGeometry(geometry);
    controller.setEnabled(true);
    controller.setGestureActive(true);
    controller.start();
    expect(requestFrame).not.toHaveBeenCalled();

    controller.setGestureActive(false);
    controller.start();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(geometry).toHaveLength(2);
    controller.dispose();
    expect(cancelFrame).toHaveBeenCalled();
  });
});
