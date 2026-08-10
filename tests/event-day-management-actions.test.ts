// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { EventDayManagementView } from "../apps/webapp/js/components/event-day-management-view";

describe("event/day management actions", () => {
  it("dispatches each action with its row reference", async () => {
    const view = new EventDayManagementView();
    view.rows = [{
      ref: { eventId: "event", dayId: "day1" },
      eventLabel: "Event",
      dayLabel: "Day 1",
      configured: true,
      selected: false,
      sourceType: "csv",
      sourceLabel: "circles.csv",
      sourceEndpointSummary: null,
      circleCount: 1,
      pendingGasCount: 0,
      offlineCatalog: { cached: 0, total: 0 },
    }];
    document.body.appendChild(view);
    await view.updateComplete;
    const events: CustomEvent[] = [];
    for (const type of [
      "event-day-open-request",
      "event-day-refresh-request",
      "event-day-offline-request",
      "event-day-edit-request",
      "event-day-delete-request",
    ]) {
      view.addEventListener(type, (event) => events.push(event as CustomEvent));
    }
    view.querySelectorAll("button[data-action]").forEach((button) => {
      (button as HTMLButtonElement).click();
    });
    expect(events).toHaveLength(5);
    expect(events.map((event) => event.detail.ref)).toEqual([
      { eventId: "event", dayId: "day1" },
      { eventId: "event", dayId: "day1" },
      { eventId: "event", dayId: "day1" },
      { eventId: "event", dayId: "day1" },
      { eventId: "event", dayId: "day1" },
    ]);
  });
});
