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
