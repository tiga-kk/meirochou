// @vitest-environment happy-dom
import assert from "node:assert/strict";
import { afterEach, expect, test } from "vitest";
import { ComipathSettings } from "../apps/webapp/js/components/comipath-settings";
import type { SourceManagerModel } from "../apps/webapp/js/components/source-manager";
import type {
  DeleteOptionViewModel,
  EventDayOption,
} from "../apps/webapp/js/ui/management-view-model";

afterEach(() => {
  document.body.innerHTML = "";
});

test("settings shell renders event-day-selector and source-manager child components", async () => {
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

  const sampleSourceModel: SourceManagerModel = {
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
  expect(heading?.textContent?.trim()).toContain("設定");
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

test("settings shell exposes the approved ALNS search-time choices", async () => {
  const element = new ComipathSettings();
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
