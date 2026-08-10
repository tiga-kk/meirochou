// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  calculateSwipeTranslation,
  setupSwipeAction,
} from "../apps/webapp/js/utils/gesture-zoom-controller.js";

function touchEvent(type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientX: x, clientY: y }],
  });
  return event;
}

function swipeElement(width = 200) {
  const element = document.createElement("div");
  element.getBoundingClientRect = vi.fn(
    () =>
      ({
        width,
        height: 240,
        left: 0,
        right: width,
        top: 0,
        bottom: 240,
      }) as DOMRect,
  );
  document.body.appendChild(element);
  return element;
}

describe("setupSwipeAction", () => {
  it("fires once only for the allowed outer direction and applies progressive resistance", () => {
    const element = swipeElement();
    const callback = vi.fn();
    setupSwipeAction(element, callback, {
      getAllowedDirection: () => "left",
    });

    element.dispatchEvent(touchEvent("touchstart", 100, 100));
    element.dispatchEvent(touchEvent("touchmove", -100, 100));
    expect(element.style.transform).toBe("translateX(-180px)");
    element.dispatchEvent(touchEvent("touchend", -100, 100));
    expect(callback).toHaveBeenCalledOnce();
  });

  it("keeps the Phase 6 purchase trigger distance and strict boundary", () => {
    const visualThreshold = Math.max(100, Math.min(200 * 0.4, 180));
    const purchaseTriggerDistance = visualThreshold / 0.6;
    const element = swipeElement();
    const callback = vi.fn();
    setupSwipeAction(element, callback, { getAllowedDirection: () => "left" });

    element.dispatchEvent(touchEvent("touchstart", 200, 100));
    element.dispatchEvent(
      touchEvent("touchmove", 200 - purchaseTriggerDistance, 100),
    );
    element.dispatchEvent(
      touchEvent("touchend", 200 - purchaseTriggerDistance, 100),
    );
    expect(callback).not.toHaveBeenCalled();

    element.dispatchEvent(touchEvent("touchstart", 200, 100));
    element.dispatchEvent(
      touchEvent("touchmove", 200 - purchaseTriggerDistance - 1, 100),
    );
    element.dispatchEvent(
      touchEvent("touchend", 200 - purchaseTriggerDistance - 1, 100),
    );
    expect(callback).toHaveBeenCalledOnce();
  });

  it("calculates continuous, symmetric resistance that lightens toward the trigger", () => {
    const trigger = 180;
    const t20 = Math.abs(calculateSwipeTranslation(20, trigger));
    const t90 = Math.abs(calculateSwipeTranslation(90, trigger));
    const t170 = Math.abs(calculateSwipeTranslation(170, trigger));

    expect(t20 / 20).toBeLessThan(0.4);
    expect(t90 / 90).toBeGreaterThan(t20 / 20);
    expect(t170 / 170).toBeGreaterThan(t90 / 90);
    expect(t170 / 170).toBeLessThanOrEqual(0.95);
    expect(calculateSwipeTranslation(-90, trigger)).toBe(-t90);
    expect(calculateSwipeTranslation(0, trigger)).toBe(0);
  });

  it("reads card geometry once at gesture start", () => {
    const element = swipeElement();
    const getBoundingClientRect = vi.spyOn(element, "getBoundingClientRect");
    setupSwipeAction(element, vi.fn(), { getAllowedDirection: () => "left" });

    element.dispatchEvent(touchEvent("touchstart", 100, 100));
    element.dispatchEvent(touchEvent("touchmove", -100, 100));
    element.dispatchEvent(touchEvent("touchend", -100, 100));

    expect(getBoundingClientRect).toHaveBeenCalledOnce();
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
