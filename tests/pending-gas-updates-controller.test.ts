import { describe, expect, it, vi } from "vitest";
import { PendingGasUpdatesController } from "../apps/webapp/js/features/circle-status/ui/pending-gas-updates-controller";

describe("PendingGasUpdatesController", () => {
  it("delegates retryAll, discardAll, and discardOne", async () => {
    const sendUseCase = {
      execute: vi.fn(async () => ({ processedCount: 2 })),
    };
    const discardUseCase = {
      execute: vi.fn(),
    };

    const controller = new PendingGasUpdatesController(
      sendUseCase,
      discardUseCase,
    );

    const count = await controller.retryAll();
    expect(count).toBe(2);
    expect(sendUseCase.execute).toHaveBeenCalledOnce();

    controller.discardAll({ eventId: "c108", dayId: "day1" });
    expect(discardUseCase.execute).toHaveBeenCalledWith({
      eventDay: { eventId: "c108", dayId: "day1" },
    });

    controller.discardOne({ eventId: "c108", dayId: "day1" }, "p1");
    expect(discardUseCase.execute).toHaveBeenCalledWith({
      eventDay: { eventId: "c108", dayId: "day1" },
      updateId: "p1",
    });
  });

  it("owns GAS request listeners across start and stop", async () => {
    const target = new EventTarget();
    const addEventListener = vi.spyOn(target, "addEventListener");
    const removeEventListener = vi.spyOn(target, "removeEventListener");
    const sendUseCase = { execute: vi.fn(async () => ({ processedCount: 0 })) };
    const discardUseCase = { execute: vi.fn() };
    const retry = vi.fn();
    const discard = vi.fn();
    const controller = new PendingGasUpdatesController(
      sendUseCase,
      discardUseCase,
      { targetElement: target, onRetryRequest: retry, onDiscardRequest: discard },
    );

    controller.start();
    expect(addEventListener).toHaveBeenCalledTimes(2);
    target.dispatchEvent(new CustomEvent("gas-retry-request", { detail: { ref: null } }));
    target.dispatchEvent(new CustomEvent("gas-discard-request", { detail: { ids: [] } }));
    expect(retry).toHaveBeenCalledOnce();
    expect(discard).toHaveBeenCalledOnce();

    controller.stop();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
    target.dispatchEvent(new CustomEvent("gas-retry-request"));
    expect(retry).toHaveBeenCalledOnce();

    controller.start();
    expect(addEventListener).toHaveBeenCalledTimes(4);
    target.dispatchEvent(new CustomEvent("gas-retry-request"));
    expect(retry).toHaveBeenCalledTimes(2);
    controller.stop();
    expect(removeEventListener).toHaveBeenCalledTimes(4);
  });
});
