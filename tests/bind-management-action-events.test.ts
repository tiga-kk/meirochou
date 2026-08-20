// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { bindManagementActionEvents } from "../apps/webapp/js/app/bind-management-action-events";

function createApplication() {
  return {
    handleEventDayOpenRequest: vi.fn(async () => {}),
    handleEventDayRefreshRequest: vi.fn(async () => {}),
    handleEventDayOfflineRequest: vi.fn(async () => {}),
    handleEventDayEditRequest: vi.fn(async () => {}),
    handleEventDayDeleteRequest: vi.fn(async () => {}),
  };
}

describe("management action event binding", () => {
  it("forwards the five management request details exactly once", () => {
    const application = createApplication();
    const stop = bindManagementActionEvents(application, document);
    const cases = [
      ["event-day-open-request", "handleEventDayOpenRequest"],
      ["event-day-refresh-request", "handleEventDayRefreshRequest"],
      ["event-day-offline-request", "handleEventDayOfflineRequest"],
      ["event-day-edit-request", "handleEventDayEditRequest"],
      ["event-day-delete-request", "handleEventDayDeleteRequest"],
    ] as const;

    for (const [type, method] of cases) {
      const detail = { ref: { eventId: "C108", dayId: "day1" }, type };
      document.dispatchEvent(new CustomEvent(type, { detail }));
      expect(application[method]).toHaveBeenCalledTimes(1);
      expect(application[method]).toHaveBeenLastCalledWith(detail);
    }

    stop();
  });

  it("removes all five listeners and cleanup is safe to call twice", () => {
    const application = createApplication();
    const stop = bindManagementActionEvents(application, document);
    stop();
    stop();

    document.dispatchEvent(
      new CustomEvent("event-day-open-request", { detail: { ref: {} } }),
    );
    document.dispatchEvent(
      new CustomEvent("event-day-refresh-request", { detail: { ref: {} } }),
    );
    document.dispatchEvent(
      new CustomEvent("event-day-offline-request", { detail: { ref: {} } }),
    );
    document.dispatchEvent(
      new CustomEvent("event-day-edit-request", { detail: { ref: {} } }),
    );
    document.dispatchEvent(
      new CustomEvent("event-day-delete-request", { detail: { ref: {} } }),
    );

    expect(application.handleEventDayOpenRequest).not.toHaveBeenCalled();
    expect(application.handleEventDayRefreshRequest).not.toHaveBeenCalled();
    expect(application.handleEventDayOfflineRequest).not.toHaveBeenCalled();
    expect(application.handleEventDayEditRequest).not.toHaveBeenCalled();
    expect(application.handleEventDayDeleteRequest).not.toHaveBeenCalled();
  });
});
