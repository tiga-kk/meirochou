import { describe, expect, it, vi } from "vitest";
import { LocalDataDeletionController } from "../apps/webapp/js/features/local-data-deletion/ui/local-data-deletion-controller";

describe("LocalDataDeletionController", () => {
  it("requires a valid scope and forwards confirmation", async () => {
    const deleteLocalData = { execute: vi.fn(async () => {}) };
    const controller = new LocalDataDeletionController({ deleteLocalData });

    controller.selectDeletionScope({
      kind: "circle-source",
      eventDay: { eventId: "c108", dayId: "day1" },
    });
    await controller.confirmDeletion(null);
    await expect(
      controller.confirmDeletion({ kind: "unknown" }),
    ).rejects.toThrow("Invalid deletion scope");

    expect(deleteLocalData.execute).toHaveBeenCalledOnce();
  });

  it("accepts management delete scopes and exposes the selected scope", () => {
    const deleteLocalData = { execute: vi.fn(async () => {}) };
    const controller = new LocalDataDeletionController({ deleteLocalData });

    controller.selectDeletionScope({
      type: "circles",
      ref: { eventId: "c108", dayId: "day1" },
    });

    expect(controller.getSelectedScope()).toEqual({
      kind: "circle-source",
      eventDay: { eventId: "c108", dayId: "day1" },
    });
  });
});
