// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GestureZoomController } from "../apps/webapp/js/utils/gesture-zoom-controller.js";

type RafCallback = (time: number) => void;

function pointerEvent(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
  options: { button?: number } = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "touch" },
    clientX: { value: clientX },
    clientY: { value: clientY },
    button: { value: options.button ?? 0 },
  });
  return event;
}

function createController() {
  const container = document.createElement("div");
  const image = document.createElement("img");
  Object.defineProperty(container, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    })),
  });
  Object.defineProperty(image, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 300,
      height: 300,
      right: 300,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => {},
    })),
  });
  Object.defineProperties(image, {
    offsetWidth: { configurable: true, value: 300 },
    offsetHeight: { configurable: true, value: 300 },
  });
  container.appendChild(image);
  document.body.appendChild(container);
  container.setPointerCapture = vi.fn();
  container.releasePointerCapture = vi.fn();
  return {
    container,
    image,
    controller: new GestureZoomController(container, image),
  };
}

describe("GestureZoomController", () => {
  let callbacks: Map<number, RafCallback>;
  let nextRafId: number;

  beforeEach(() => {
    callbacks = new Map();
    nextRafId = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: RafCallback) => {
      const id = nextRafId++;
      callbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      callbacks.delete(id);
    });
  });

  afterEach(() => {
    callbacks.clear();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  function flushRaf() {
    const pending = [...callbacks.entries()];
    callbacks.clear();
    pending.forEach(([, callback]) => callback(0));
  }

  it("coalesces pointer pan transform writes into one RAF", () => {
    const { container, image } = createController();
    const transformWrites: string[] = [];
    let transform = image.style.transform;
    Object.defineProperty(image.style, "transform", {
      configurable: true,
      get: () => transform,
      set: (value: string) => {
        transform = value;
        transformWrites.push(value);
      },
    });

    container.dispatchEvent(pointerEvent("pointerdown", 1, 10, 10));
    container.dispatchEvent(pointerEvent("pointermove", 1, 20, 15));
    container.dispatchEvent(pointerEvent("pointermove", 1, 35, 25));

    expect(transformWrites).toHaveLength(0);
    flushRaf();
    expect(transformWrites).toHaveLength(1);
    expect(transformWrites[0]).toContain("translate3d(25px, 15px, 0)");
  });

  it("keeps pinch scale within the configured limits", () => {
    const { container, controller } = createController();

    container.dispatchEvent(pointerEvent("pointerdown", 1, 20, 50));
    container.dispatchEvent(pointerEvent("pointerdown", 2, 80, 50));
    container.dispatchEvent(pointerEvent("pointermove", 2, 500, 50));
    flushRaf();
    expect(controller.state.scale).toBe(5);

    container.dispatchEvent(pointerEvent("pointermove", 2, 21, 50));
    flushRaf();
    expect(controller.state.scale).toBe(1);
  });

  it("recovers from cancel and capture loss without leaving active pointers", () => {
    const { container, controller } = createController();

    container.dispatchEvent(pointerEvent("pointerdown", 1, 10, 10));
    container.dispatchEvent(pointerEvent("pointermove", 1, 20, 10));
    container.dispatchEvent(pointerEvent("pointercancel", 1, 20, 10));
    expect(controller.activePointers.size).toBe(0);
    expect(controller.isDragging).toBe(false);

    container.dispatchEvent(pointerEvent("pointerdown", 2, 30, 10));
    container.dispatchEvent(pointerEvent("pointermove", 2, 40, 10));
    flushRaf();
    expect(controller.state.x).toBe(20);

    container.dispatchEvent(pointerEvent("lostpointercapture", 2, 40, 10));
    expect(controller.activePointers.size).toBe(0);
    expect(controller.isDragging).toBe(false);
  });

  it("shrinks pinch to the remaining pointer without a jump", () => {
    const { container, controller } = createController();

    container.dispatchEvent(pointerEvent("pointerdown", 1, 20, 50));
    container.dispatchEvent(pointerEvent("pointerdown", 2, 80, 50));
    container.dispatchEvent(pointerEvent("pointermove", 1, 30, 50));
    flushRaf();
    const xBeforeCancel = controller.state.x;

    container.dispatchEvent(pointerEvent("pointercancel", 2, 80, 50));
    container.dispatchEvent(pointerEvent("pointermove", 1, 31, 50));
    flushRaf();

    expect(controller.state.x - xBeforeCancel).toBe(1);
    expect(controller.activePointers.size).toBe(1);
  });

  it("resets pointers, velocity, transform, and pending RAF state", () => {
    const { container, image, controller } = createController();

    container.dispatchEvent(pointerEvent("pointerdown", 1, 10, 10));
    controller.setTransform({ scale: 4, x: -20, y: -30 });
    controller.vx = 2;
    controller.vy = 3;
    controller.reset();

    expect(controller.state).toEqual({ scale: 1, x: 0, y: 0 });
    expect(controller.activePointers.size).toBe(0);
    expect(controller.isDragging).toBe(false);
    expect(controller.vx).toBe(0);
    expect(controller.vy).toBe(0);
    expect(controller.rafId).toBeNull();
    expect(image.style.transform).toContain("translate3d(0px, 0px, 0)");
  });

  it("uses cached dimensions during inertia frames", () => {
    const { controller, container, image } = createController();
    const containerReads = container.getBoundingClientRect;
    const imageReads = image.getBoundingClientRect;
    controller.vx = 1;
    controller.vy = 0;
    controller.animate();
    const containerReadsAfterStart = containerReads.mock.calls.length;
    const imageReadsAfterStart = imageReads.mock.calls.length;

    flushRaf();
    flushRaf();

    expect(containerReads.mock.calls.length).toBe(containerReadsAfterStart);
    expect(imageReads.mock.calls.length).toBe(imageReadsAfterStart);
  });

  it("settles a bounds violation after a low-speed pointer release", () => {
    const { container, controller } = createController();

    container.dispatchEvent(pointerEvent("pointerdown", 1, 10, 10));
    controller.setTransform({ scale: 1, x: 20, y: 0 });
    container.dispatchEvent(pointerEvent("pointerup", 1, 10, 10));

    expect(controller.rafId).not.toBeNull();
    for (let frame = 0; frame < 20; frame += 1) flushRaf();

    expect(controller.state.x).toBeLessThan(1);
    expect(controller.state.x).toBeGreaterThanOrEqual(0);
  });
});
