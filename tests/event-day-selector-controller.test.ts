import { describe, expect, it, vi } from "vitest";
import { EventDaySelectorController } from "../apps/webapp/js/features/event-day/ui/event-day-selector-controller";

describe("EventDaySelectorController", () => {
  it("validates event/day detail before switching", async () => {
    const switchEventDay = { execute: vi.fn(async () => {}) };
    const controller = new EventDaySelectorController({ switchEventDay });

    await controller.selectEventDay({ eventId: "c108", dayId: "day2" });
    await controller.selectEventDay({ eventId: "", dayId: "day2" });

    expect(switchEventDay.execute).toHaveBeenCalledOnce();
    expect(switchEventDay.execute).toHaveBeenCalledWith({
      eventId: "c108",
      dayId: "day2",
    });
  });
});
