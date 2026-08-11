// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ComipathSettings } from "../apps/webapp/js/components/comipath-settings";
import type { EventDayManagementRow } from "../apps/webapp/js/shared/ui/event-day-management-view-model";

describe("event/day management actions", () => {
  it("dispatches each action with its row reference", async () => {
    const row: EventDayManagementRow = {
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
    };
    const settings = new ComipathSettings();
    settings.eventDayManagementRows = [row];
    settings.detailRef = row.ref;
    settings.detailOpen = true;
    document.body.appendChild(settings);
    await settings.updateComplete;
    const events: CustomEvent[] = [];
    for (const type of [
      "event-day-open-request",
      "event-day-refresh-request",
      "event-day-offline-request",
      "event-day-edit-request",
      "event-day-delete-request",
    ]) {
      settings.addEventListener(type, (event) => events.push(event as CustomEvent));
    }
    settings.querySelectorAll(".management-detail-actions button[data-action]").forEach((button) => {
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
