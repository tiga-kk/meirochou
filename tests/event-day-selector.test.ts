// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../apps/webapp/js/components/event-day-selector";
import type { EventDaySelector } from "../apps/webapp/js/components/event-day-selector";
import type { EventDayOption } from "../apps/webapp/js/ui/management-view-model";

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
  {
    eventId: "c104",
    eventLabel: "コミックマーケット104",
    dayId: "day2",
    dayLabel: "2日目 (月)",
    configured: false,
    selected: false,
    pendingCount: 2,
  },
  {
    eventId: "c105",
    eventLabel: "コミックマーケット105",
    dayId: "day1",
    dayLabel: "1日目 (日)",
    configured: false,
    selected: false,
    pendingCount: 0,
  },
];

describe("EventDaySelector Component", () => {
  let element: EventDaySelector;

  beforeEach(() => {
    document.body.innerHTML = "";
    element = document.createElement("event-day-selector");
    document.body.appendChild(element);
  });

  it("renders event and day select controls with accessible labels", async () => {
    element.options = sampleOptions;
    element.selectedEventId = "c104";
    element.selectedDayId = "day1";
    await element.updateComplete;

    const eventSelect =
      element.querySelector<HTMLSelectElement>("#event-select");
    const daySelect = element.querySelector<HTMLSelectElement>("#day-select");

    expect(eventSelect).not.toBeNull();
    expect(daySelect).not.toBeNull();

    expect(eventSelect?.value).toBe("c104");
    expect(daySelect?.value).toBe("day1");

    // Event select should have 2 unique event options (c104, c105)
    const eventOptions = eventSelect?.querySelectorAll("option");
    expect(eventOptions).toHaveLength(2);
    expect(eventOptions?.[0].textContent).toBe("コミックマーケット104");
    expect(eventOptions?.[1].textContent).toBe("コミックマーケット105");

    // Day select should have 2 day options filtered for c104
    const dayOptions = daySelect?.querySelectorAll("option");
    expect(dayOptions).toHaveLength(2);
    expect(dayOptions?.[0].textContent).toBe("1日目 (日)");
    expect(dayOptions?.[1].textContent).toBe(
      "2日目 (月) (未設定) [送信待ち:2]",
    );
  });

  it("filters day options when selecting a different event in UI before event dispatch", async () => {
    element.options = sampleOptions;
    element.selectedEventId = "c104";
    element.selectedDayId = "day1";
    await element.updateComplete;

    const eventSelect =
      element.querySelector<HTMLSelectElement>("#event-select");
    expect(eventSelect).not.toBeNull();
    if (!eventSelect) return;

    eventSelect.value = "c105";
    eventSelect.dispatchEvent(new Event("change"));
    await element.updateComplete;

    const daySelect = element.querySelector<HTMLSelectElement>("#day-select");
    const dayOptions = daySelect?.querySelectorAll("option");
    expect(dayOptions).toHaveLength(1);
    expect(dayOptions?.[0].textContent).toBe("1日目 (日) (未設定)");
  });

  it("dispatches event-day-select bubbling composed custom event when changed", async () => {
    element.options = sampleOptions;
    element.selectedEventId = "c104";
    element.selectedDayId = "day1";
    await element.updateComplete;

    const listener = vi.fn();
    element.addEventListener("event-day-select", listener);

    const daySelect = element.querySelector<HTMLSelectElement>("#day-select");
    expect(daySelect).not.toBeNull();
    if (!daySelect) return;

    daySelect.value = "day2";
    daySelect.dispatchEvent(new Event("change"));

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ eventId: "c104", dayId: "day2" });
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });

  it("does not dispatch a ref that is not present in the supplied model", async () => {
    element.options = sampleOptions;
    element.selectedEventId = "c104";
    element.selectedDayId = "day1";
    await element.updateComplete;

    const listener = vi.fn();
    element.addEventListener("event-day-select", listener);
    const daySelect = element.querySelector<HTMLSelectElement>("#day-select");
    expect(daySelect).not.toBeNull();
    if (!daySelect) return;

    daySelect.value = "unknown-day";
    daySelect.dispatchEvent(new Event("change"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("restores the committed event after an error", async () => {
    element.options = sampleOptions;
    element.selectedEventId = "c104";
    element.selectedDayId = "day1";
    await element.updateComplete;

    const eventSelect =
      element.querySelector<HTMLSelectElement>("#event-select");
    expect(eventSelect).not.toBeNull();
    if (!eventSelect) return;

    eventSelect.value = "c105";
    eventSelect.dispatchEvent(new Event("change"));
    await element.updateComplete;
    expect(eventSelect.value).toBe("c105");

    element.errorMessage = "切替に失敗しました";
    element.busy = false;
    await element.updateComplete;

    expect(
      element.querySelector<HTMLSelectElement>("#event-select")?.value,
    ).toBe("c104");
  });

  it("disables selects and marks aria-busy when busy property is true", async () => {
    element.options = sampleOptions;
    element.selectedEventId = "c104";
    element.selectedDayId = "day1";
    element.busy = true;
    await element.updateComplete;

    const eventSelect =
      element.querySelector<HTMLSelectElement>("#event-select");
    const daySelect = element.querySelector<HTMLSelectElement>("#day-select");
    const container = element.querySelector(".event-day-selector-container");

    expect(eventSelect?.disabled).toBe(true);
    expect(daySelect?.disabled).toBe(true);
    expect(container?.getAttribute("aria-busy")).toBe("true");
  });

  it("renders safe error message with role=alert when errorMessage is provided", async () => {
    element.options = sampleOptions;
    element.errorMessage = "切替に失敗しました。以前の状態を維持しています。";
    await element.updateComplete;

    const alert = element.querySelector<HTMLElement>('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toBe(
      "切替に失敗しました。以前の状態を維持しています。",
    );
  });

  it("associates label and select by for/id for screen readers", async () => {
    element.options = sampleOptions;
    element.selectedEventId = "c104";
    element.selectedDayId = "day1";
    await element.updateComplete;

    const eventLabel = element.querySelector<HTMLLabelElement>(
      "label[for='event-select']",
    );
    const dayLabel = element.querySelector<HTMLLabelElement>(
      "label[for='day-select']",
    );
    const eventSelect =
      element.querySelector<HTMLSelectElement>("#event-select");
    const daySelect = element.querySelector<HTMLSelectElement>("#day-select");

    expect(eventLabel).not.toBeNull();
    expect(dayLabel).not.toBeNull();
    expect(eventSelect).not.toBeNull();
    expect(daySelect).not.toBeNull();
    expect(eventLabel?.htmlFor).toBe("event-select");
    expect(dayLabel?.htmlFor).toBe("day-select");
  });

  it("renders busy status as text alongside aria-busy to avoid color-only conveyance", async () => {
    element.options = sampleOptions;
    element.selectedEventId = "c104";
    element.selectedDayId = "day1";
    element.busy = true;
    await element.updateComplete;

    const container = element.querySelector(".event-day-selector-container");
    expect(container?.getAttribute("aria-busy")).toBe("true");
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      "切替中",
    );
    const selects = element.querySelectorAll<HTMLSelectElement>("select");
    for (const s of selects) {
      expect(s.disabled).toBe(true);
    }
  });
});
