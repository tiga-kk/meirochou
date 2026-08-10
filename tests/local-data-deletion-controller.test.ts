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

  it("forwards pending-scope confirmation to the use case", async () => {
    const deleteLocalData = { execute: vi.fn(async () => {}) };
    const controller = new LocalDataDeletionController({ deleteLocalData });
    const scope = {
      type: "all-events",
      pendingDiscardCount: 2,
    };

    await controller.confirmDeletion(scope);

    expect(deleteLocalData.execute).toHaveBeenCalledWith({
      kind: "all-event-days",
    });
  });

  it("owns deletion request listeners across start and stop", async () => {
    const target = new EventTarget();
    const addEventListener = vi.spyOn(target, "addEventListener");
    const removeEventListener = vi.spyOn(target, "removeEventListener");
    const deleteLocalData = { execute: vi.fn(async () => {}) };
    const select = vi.fn();
    const confirm = vi.fn();
    const cancel = vi.fn();
    const controller = new LocalDataDeletionController({
      deleteLocalData,
      targetElement: target,
      onScopeSelect: select,
      onDeleteRequest: confirm,
      onCancel: cancel,
    });

    controller.start();
    expect(addEventListener).toHaveBeenCalledTimes(3);
    target.dispatchEvent(
      new CustomEvent("delete-option-select", { detail: { scope: {} } }),
    );
    target.dispatchEvent(
      new CustomEvent("storage-delete-request", { detail: { scope: {} } }),
    );
    target.dispatchEvent(new CustomEvent("storage-delete-cancel"));
    expect(select).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();

    controller.stop();
    expect(removeEventListener).toHaveBeenCalledTimes(3);
    target.dispatchEvent(new CustomEvent("delete-option-select"));
    expect(select).toHaveBeenCalledOnce();

    controller.start();
    expect(addEventListener).toHaveBeenCalledTimes(6);
    target.dispatchEvent(new CustomEvent("storage-delete-cancel"));
    expect(cancel).toHaveBeenCalledTimes(2);
    controller.stop();
    expect(removeEventListener).toHaveBeenCalledTimes(6);
  });
});
