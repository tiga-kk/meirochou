import { describe, expect, it } from "vitest";
import { buildBrowserManagementProjection } from "../apps/webapp/js/app/browser-management-projection";
import type { LocalEventDayState } from "../apps/webapp/js/features/event-day/public-api";

const registry = {
  schemaVersion: 1 as const,
  events: [
    {
      eventId: "C108",
      displayName: "C108",
      mapBundle: "../maps/C108/manifest.json",
      days: [{ dayId: "day1", displayName: "1日目" }],
    },
  ],
};

const activeRef = { eventId: "C108", dayId: "day1" };
const activeState: LocalEventDayState = {
  schemaVersion: 2,
  source: { type: "csv", fileName: "circles.csv" },
  sourceGeneration: "generation-1",
  circles: [{ space: "東A01" }],
  circleStates: { "東A01": "purchased" },
  gasOutbox: [],
  timestamps: {
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    sourceUpdatedAt: "2026-08-20T00:00:00.000Z",
  },
};

function buildInput() {
  return {
    registry,
    states: [{ ref: activeRef, state: activeState }],
    activeRef,
    activeState,
    sourceDraft: {
      draftWebAppUrl: "",
      selectedSheetName: "",
      sheetNames: [],
      busy: false,
      errorMessage: null,
    },
    transitionBusy: false,
    sourceErrorMessage: "",
    pendingGasState: {
      busy: true,
      resultMessage: "sending",
      errorMessage: "",
    },
    deletionState: {
      selectedScope: { kind: "activity" as const, eventDay: activeRef },
      busy: false,
      errorMessage: "",
    },
    eventDayCount: 1,
    managementRows: [],
  };
}

describe("browser management projection", () => {
  it("builds the current settings models from plain state", () => {
    const result = buildBrowserManagementProjection(buildInput());

    expect(result.selectedEventId).toBe("C108");
    expect(result.selectedDayId).toBe("day1");
    expect(result.eventDayOptions).toHaveLength(1);
    expect(result.eventDayOptions[0]).toMatchObject({ selected: true });
    expect(result.sourceManagerModel).toMatchObject({
      activeRefLabel: "C108 day1",
      sourceType: "csv",
      canExportCsv: true,
    });
    expect(result.outboxPanelModel).toMatchObject({
      processing: true,
      resultMessage: "sending",
    });
    expect(result.deleteOptions).toHaveLength(4);
    expect(result.deleteDialogModel).toMatchObject({
      open: true,
      scope: { type: "activity", ref: activeRef },
    });
  });

  it("keeps empty selection output stable when no event day is active", () => {
    const result = buildBrowserManagementProjection({
      ...buildInput(),
      activeRef: null,
      activeState: null,
      deletionState: {
        selectedScope: null,
        busy: false,
        errorMessage: "",
      },
    });

    expect(result.selectedEventId).toBe("");
    expect(result.selectedDayId).toBe("");
    expect(result.deleteOptions).toEqual([]);
    expect(result.deleteDialogModel.open).toBe(false);
  });
});
