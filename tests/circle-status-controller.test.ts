import { describe, expect, it, vi } from "vitest";
import { CircleStatusController } from "../apps/webapp/js/features/circle-status/ui/circle-status-controller";

describe("CircleStatusController", () => {
  it("delegates changeStatus and undo correctly", () => {
    const changeUseCase = {
      execute: vi.fn(() => ({
        state: {},
        previousStatus: "pending",
        currentStatus: "purchased",
        undoToken: { undoId: "u1" },
        pendingGasUpdateId: "p1",
      })),
    };

    const undoUseCase = {
      execute: vi.fn(),
    };

    const controller = new CircleStatusController(changeUseCase, undoUseCase);

    controller.changeStatus({
      eventDay: { eventId: "c108", dayId: "day1" },
      circleSpace: "A01",
      nextStatus: "purchased",
      expectedSourceGeneration: "gen-1",
    });

    expect(changeUseCase.execute).toHaveBeenCalledOnce();
    expect(controller.getLastUndoToken()).toEqual({ undoId: "u1" });

    const undone = controller.undo();
    expect(undone).toBe(true);
    expect(undoUseCase.execute).toHaveBeenCalledOnce();
    expect(controller.getLastUndoToken()).toBeNull();
  });
});
