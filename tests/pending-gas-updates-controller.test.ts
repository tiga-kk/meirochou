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
});
