// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { EventDayManagementView } from "../apps/webapp/js/components/event-day-management-view";
import type { EventDayManagementRow } from "../apps/webapp/js/shared/ui/event-day-management-view-model";

const row: EventDayManagementRow = {
  ref: { eventId: "C108", dayId: "day1" },
  eventLabel: "コミケ108",
  dayLabel: "1日目",
  configured: true,
  selected: true,
  sourceType: "csv",
  sourceLabel: "circles.csv",
  sourceEndpointSummary: null,
  circleCount: 12,
  pendingGasCount: 2,
  offlineCatalog: { cached: 4, total: 8 },
};

describe("EventDayManagementView", () => {
  it("renders status and dispatches only a detail request from each overview row", async () => {
    const view = new EventDayManagementView();
    view.rows = [
      row,
      {
        ...row,
        ref: { eventId: "C108", dayId: "day2" },
        dayLabel: "2日目",
        configured: false,
        selected: false,
        sourceType: "none",
        sourceLabel: "未設定",
        circleCount: 0,
        pendingGasCount: 0,
        offlineCatalog: { cached: 0, total: 0 },
      },
      {
        ...row,
        ref: { eventId: "C108", dayId: "day3" },
        selected: false,
        offlineCatalog: { cached: null, total: 3 },
      },
    ];
    document.body.appendChild(view);
    await view.updateComplete;

    expect(view.textContent).toContain("Data 12件");
    expect(view.textContent).toContain("GAS同期 2件待ち");
    expect(view.textContent).toContain("お品書き 4 / 8 保存済み");
    expect(view.textContent).toContain("詳細を見る");
    expect(view.textContent).toContain("お品書き 保存状況を確認できません");
    expect(view.querySelector('[aria-current="true"]')?.textContent).toContain(
      "[使用中]",
    );
    expect(view.querySelectorAll('[aria-current="true"]')).toHaveLength(1);

    expect(view.querySelectorAll("button[data-action]")).toHaveLength(3);
    expect(view.querySelectorAll('[data-action="open"]')).toHaveLength(0);
    expect(view.querySelectorAll('[data-action="refresh"]')).toHaveLength(0);
    expect(view.querySelectorAll('[data-action="edit"]')).toHaveLength(0);

    const events: CustomEvent[] = [];
    view.addEventListener("event-day-detail-request", (event) =>
      events.push(event as CustomEvent),
    );
    view.querySelectorAll('[data-action="detail"]').forEach((button) => {
      (button as HTMLButtonElement).click();
    });

    expect(events).toHaveLength(3);
    expect(events.map((event) => event.detail.ref)).toEqual([
      { eventId: "C108", dayId: "day1" },
      { eventId: "C108", dayId: "day2" },
      { eventId: "C108", dayId: "day3" },
    ]);
  });
});
