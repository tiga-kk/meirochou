// @vitest-environment happy-dom
import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { ComipathSettings } from "../apps/webapp/js/components/comipath-settings";
import type { SourceManagerModel } from "../apps/webapp/js/components/source-manager";
import type { EventDayOption } from "../apps/webapp/js/ui/management-view-model";

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
