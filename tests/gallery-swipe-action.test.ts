// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { setupSwipeAction } from "../apps/webapp/js/utils/gesture-zoom-controller.js";

function touchEvent(type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientX: x, clientY: y }],
  });
  return event;
}

function swipeElement(width = 200) {
  const element = document.createElement("div");
  element.getBoundingClientRect = vi.fn(() =>
    ({ width, height: 240, left: 0, right: width, top: 0, bottom: 240 }) as DOMRect,
  );
  document.body.appendChild(element);
  return element;
}

describe("setupSwipeAction", () => {
  it("fires once only for the allowed outer direction and applies resistance", () => {
    const element = swipeElement();
    const callback = vi.fn();
    setupSwipeAction(element, callback, {
      resistance: 0.6,
      getAllowedDirection: () => "left",
    });

    element.dispatchEvent(touchEvent("touchstart", 100, 100));
    element.dispatchEvent(touchEvent("touchmove", -100, 100));
    expect(element.style.transform).toBe("translateX(-120px)");
    element.dispatchEvent(touchEvent("touchend", -100, 100));
    expect(callback).toHaveBeenCalledOnce();
  });

  it("does not purchase on a forbidden direction or vertical scroll", () => {
    const element = swipeElement();
    const callback = vi.fn();
    setupSwipeAction(element, callback, {
      getAllowedDirection: () => "right",
    });

    element.dispatchEvent(touchEvent("touchstart", 100, 100));
    element.dispatchEvent(touchEvent("touchmove", -100, 100));
    element.dispatchEvent(touchEvent("touchend", -100, 100));
    expect(callback).not.toHaveBeenCalled();

    element.dispatchEvent(touchEvent("touchstart", 100, 100));
    element.dispatchEvent(touchEvent("touchmove", 0, 180));
    element.dispatchEvent(touchEvent("touchend", 0, 180));
    expect(callback).not.toHaveBeenCalled();
  });

  it("keeps the card until an async purchase completes", async () => {
    const element = swipeElement();
    let resolvePurchase!: () => void;
    const purchase = new Promise<void>((resolve) => {
      resolvePurchase = resolve;
    });
    const callback = vi.fn(() => purchase);
    setupSwipeAction(element, callback, {
      getAllowedDirection: () => "left",
    });

    element.dispatchEvent(touchEvent("touchstart", 100, 100));
    element.dispatchEvent(touchEvent("touchmove", -100, 100));
    element.dispatchEvent(touchEvent("touchend", -100, 100));
    expect(callback).toHaveBeenCalledOnce();
    expect(element.parentNode).not.toBeNull();

    resolvePurchase();
    await purchase;
    await Promise.resolve();
    expect(element.parentNode).not.toBeNull();
    expect(element.style.transform).toBe("");
  });
});
