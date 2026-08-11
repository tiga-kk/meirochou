// @vitest-environment happy-dom
import assert from "node:assert/strict";
import { afterEach, expect, test, vi } from "vitest";
import type { CircleDataSourcePanelModel } from "../apps/webapp/js/components/circle-data-source-panel";
import { ComipathSettings } from "../apps/webapp/js/components/comipath-settings";
import type {
  DeleteOptionViewModel,
  EventDayOption,
} from "../apps/webapp/js/shared/ui/management-view-model";
import type { EventDayManagementRow } from "../apps/webapp/js/shared/ui/event-day-management-view-model";

const selectedManagementRow: EventDayManagementRow = {
  ref: { eventId: "c104", dayId: "day1" },
  eventLabel: "コミックマーケット104",
  dayLabel: "1日目 (日)",
  configured: true,
  selected: true,
  sourceType: "csv",
  sourceLabel: "circles.csv",
  sourceEndpointSummary: null,
  circleCount: 1,
  pendingGasCount: 0,
  offlineCatalog: { cached: 0, total: 0 },
};

afterEach(() => {
  document.body.innerHTML = "";
});

test("settings shell renders event-day-selector and circle-data-source-panel child components", async () => {
  const element = new ComipathSettings();
  element.open = true;

  const sampleOptions: readonly EventDayOption[] = [
    {
      eventId: "c104",
      eventLabel: "コミックマーケット104",
      dayId: "day1",
      dayLabel: "1日目 (日)",
      configured: true,
      selected: true,
      pendingCount: 0,
    },
  ];

  const sampleSourceModel: CircleDataSourcePanelModel = {
    activeRef: { eventId: "c104", dayId: "day1" },
    activeRefLabel: "C104 1日目",
    source: {
      typeLabel: "CSV",
      detail: "circles.csv",
      endpointSummary: null,
      pendingCount: 0,
    },
    sourceType: "csv",
    gasUrlInput: "",
    selectedSheetName: "",
    sheetNames: [],
    pendingCount: 0,
    busy: false,
    errorMessage: "",
  };

  element.eventDayOptions = sampleOptions;
  element.eventDayManagementRows = [selectedManagementRow];
  element.selectedEventId = "c104";
  element.selectedDayId = "day1";
  element.sourceManagerModel = sampleSourceModel;

  document.body.appendChild(element);
  await element.updateComplete;

  assert.equal(element.classList.contains("show"), true);
  assert.ok(element.querySelector("event-day-selector"));
  assert.ok(element.querySelector("source-manager"));
  assert.match(element.textContent || "", /コミックマーケット104/);
  assert.match(element.textContent || "", /circles\.csv/);
});

test("selector event follows the selected day in the management detail", async () => {
  const element = new ComipathSettings();
  element.eventDayManagementRows = [
    selectedManagementRow,
    {
      ...selectedManagementRow,
      ref: { eventId: "c104", dayId: "day2" },
      dayLabel: "2日目 (月)",
      selected: false,
    },
  ];
  element.detailRef = selectedManagementRow.ref;
  element.detailOpen = true;
  document.body.appendChild(element);
  await element.updateComplete;

  element
    .querySelector("event-day-selector")
    ?.dispatchEvent(
      new CustomEvent("event-day-select", {
        bubbles: true,
        composed: true,
        detail: { eventId: "c104", dayId: "day2" },
      }),
    );
  await element.updateComplete;

  expect(element.detailRef).toEqual({ eventId: "c104", dayId: "day2" });
  expect(element.querySelector(".management-detail-summary")?.textContent).toContain(
    "2日目 (月)",
  );
  element.remove();
});

test("settings shell renders enabled delete options and emits only their scope", async () => {
  const element = new ComipathSettings();
  const deleteOption: DeleteOptionViewModel = {
    scope: { type: "activity", ref: { eventId: "c104", dayId: "day1" } },
    label: "購入・チェック履歴の削除（2件）",
    consequence: "活動履歴を削除します。",
    blocked: false,
    blockedReason: null,
  };
  const events: CustomEvent[] = [];
  element.addEventListener("delete-option-select", (event) => {
    events.push(event as CustomEvent);
  });
  element.deleteOptions = [deleteOption];
  element.eventDayManagementRows = [selectedManagementRow];

  document.body.appendChild(element);
  await element.updateComplete;

  const button = element.querySelector<HTMLButtonElement>(
    ".storage-delete-option button",
  );
  expect(button?.textContent).toContain("購入・チェック履歴の削除");
  button?.click();

  expect(events).toHaveLength(1);
  expect(events[0].detail).toEqual({ scope: deleteOption.scope });
});

test("settings shell renders an h2 heading for the screen reader landmark", async () => {
  const element = new ComipathSettings();
  element.open = true;
  document.body.appendChild(element);
  await element.updateComplete;

  const heading = element.querySelector("h2");
  expect(heading).not.toBeNull();
  expect(heading?.textContent?.trim()).toContain("管理");
  document.body.removeChild(element);
});

test("blocked delete option exposes reason text with role=status for screen readers", async () => {
  const element = new ComipathSettings();
  const blockedOption: DeleteOptionViewModel = {
    scope: { type: "activity", ref: { eventId: "c104", dayId: "day1" } },
    label: "購入・チェック履歴の削除（2件）",
    consequence: "活動履歴を削除します。",
    blocked: true,
    blockedReason: "2件の送信待ちがあります。",
  };
  element.deleteOptions = [blockedOption];
  element.eventDayManagementRows = [selectedManagementRow];

  document.body.appendChild(element);
  await element.updateComplete;

  const blockedMsg = element.querySelector<HTMLElement>(
    ".storage-delete-blocked",
  );
  expect(blockedMsg).not.toBeNull();
  expect(blockedMsg?.getAttribute("role")).toBe("status");
  expect(blockedMsg?.textContent).toContain("送信待ち");

  const btn = element.querySelector<HTMLButtonElement>(
    ".storage-delete-option button",
  );
  expect(btn?.disabled).toBe(true);

  document.body.removeChild(element);
});

test("locks and restores body scroll state without destroying existing inline styles", async () => {
  const originalStyle = document.body.getAttribute("style");
  const originalScrollX = Object.getOwnPropertyDescriptor(window, "scrollX");
  const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  const scrollTo = vi
    .spyOn(window, "scrollTo")
    .mockImplementation(() => undefined);

  Object.defineProperty(window, "scrollX", {
    configurable: true,
    value: 37,
  });
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 143,
  });
  document.body.style.setProperty("position", "relative", "important");
  document.body.style.top = "7px";
  document.body.style.left = "8px";
  document.body.style.right = "9px";
  document.body.style.width = "80%";
  document.body.style.overflow = "scroll";

  const element = new ComipathSettings();
  element.eventDayManagementRows = [selectedManagementRow];
  element.open = true;
  document.body.appendChild(element);
  await element.updateComplete;

  expect(document.body.style.position).toBe("fixed");
  expect(document.body.style.overflow).toBe("hidden");
  expect(document.body.style.top).toBe("-143px");
  expect(document.body.style.left).toBe("-37px");

  element.open = false;
  await element.updateComplete;

  expect(document.body.style.position).toBe("relative");
  expect(document.body.style.getPropertyPriority("position")).toBe("important");
  expect(document.body.style.top).toBe("7px");
  expect(document.body.style.left).toBe("8px");
  expect(document.body.style.right).toBe("9px");
  expect(document.body.style.width).toBe("80%");
  expect(document.body.style.overflow).toBe("scroll");
  expect(scrollTo).toHaveBeenCalledWith(37, 143);

  element.open = true;
  await element.updateComplete;
  element.remove();
  element.disconnectedCallback();
  expect(document.body.style.position).toBe("relative");
  expect(document.body.style.overflow).toBe("scroll");
  expect(scrollTo).toHaveBeenCalledTimes(2);

  scrollTo.mockRestore();
  if (originalStyle === null) document.body.removeAttribute("style");
  else document.body.setAttribute("style", originalStyle);
  if (originalScrollX) Object.defineProperty(window, "scrollX", originalScrollX);
  if (originalScrollY) Object.defineProperty(window, "scrollY", originalScrollY);
});

test("settings shell exposes the approved ALNS search-time choices", async () => {
  const element = new ComipathSettings();
  element.eventDayManagementRows = [selectedManagementRow];
  const events: CustomEvent[] = [];
  element.addEventListener("optimization-time-limit-change", (event) => {
    events.push(event as CustomEvent);
  });

  document.body.appendChild(element);
  await element.updateComplete;

  const select = element.querySelector<HTMLSelectElement>(
    "#optimization-time-limit",
  );
  expect(select).not.toBeNull();
  if (!select) throw new Error("optimization time select is missing");
  expect([...select.options].map((option) => option.value)).toEqual([
    "5000",
    "10000",
    "15000",
  ]);
  expect(select?.value).toBe("10000");

  select.value = "15000";
  select.dispatchEvent(new Event("change", { bubbles: true }));

  expect(events).toHaveLength(1);
  expect(events[0].detail).toEqual({ searchTimeLimitMs: 15000 });
});
