// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BrowserEventBinding } from "../apps/webapp/js/app/bind-browser-events";
import type {
  EventRegistryV1,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";

function createSampleRegistry(): EventRegistryV1 {
  return {
    version: 1,
    events: [
      {
        eventId: "c104",
        displayName: "コミックマーケット104",
        days: [
          { dayId: "day1", displayName: "1日目", mapBundle: "demo-v1" },
          { dayId: "day2", displayName: "2日目", mapBundle: "demo-v1" },
        ],
      },
    ],
  };
}

function createSampleState(eventId: string, dayId: string): LocalEventDayState {
  return {
    schemaVersion: 1,
    source: {
      type: "gas",
      gasUrl: `https://script.google.com/macros/s/AKfycbx_${eventId}_${dayId}/exec`,
      sheetName: dayId,
    },
    sourceGeneration: "gen-1",
    circles: [{ space: "東A01a" }],
    purchased: [],
    hold: [],
    history: [],
    redo: [],
    gasOutbox: [],
    timestamps: {
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
    },
  };
}

describe("ComiPathBrowserRuntime & Storage Deletion Integration", () => {
  it("handles storage-delete-request for active event-day and falls back to default event/day", async () => {
    const app = new BrowserEventBinding();
    app.eventRegistry = createSampleRegistry();

    const ref1 = { eventId: "c104", dayId: "day1" };
    const ref2 = { eventId: "c104", dayId: "day2" };

    app.eventDayRepository.saveAndRememberLastOpened(
      ref1,
      createSampleState("c104", "day1"),
    );
    app.eventDayRepository.save(ref2, createSampleState("c104", "day2"));
    app.activeEventDaySession.setActiveEventDay(
      ref1,
      app.eventDayRepository.load(ref1) ??
        createSampleState(ref1.eventId, ref1.dayId),
    );

    await app.handleStorageDeleteRequest({
      scope: { type: "event-day", ref: ref1 },
      confirmation: "",
    });

    expect(app.eventDayRepository.load(ref1)).toBeNull();
    expect(app.activeRef).toEqual(ref2);
  });

  it("does not switch active state when deleting a non-active event-day", async () => {
    const app = new BrowserEventBinding();
    app.eventRegistry = createSampleRegistry();

    const activeRef = { eventId: "c104", dayId: "day1" };
    const deletedRef = { eventId: "c104", dayId: "day2" };
    app.eventDayRepository.saveAndRememberLastOpened(
      activeRef,
      createSampleState("c104", "day1"),
    );
    app.eventDayRepository.save(deletedRef, createSampleState("c104", "day2"));
    app.activeEventDaySession.setActiveEventDay(
      activeRef,
      app.eventDayRepository.load(activeRef) ??
        createSampleState(activeRef.eventId, activeRef.dayId),
    );

    await app.handleStorageDeleteRequest({
      scope: { type: "event-day", ref: deletedRef },
      confirmation: "",
    });

    expect(app.eventDayRepository.load(deletedRef)).toBeNull();
    expect(app.activeRef).toEqual(activeRef);
  });

  it("handles all-events deletion, clears repository, and reinitializes registry default state", async () => {
    const app = new BrowserEventBinding();
    app.eventRegistry = createSampleRegistry();

    const ref1 = { eventId: "c104", dayId: "day1" };
    const ref2 = { eventId: "c104", dayId: "day2" };

    app.eventDayRepository.saveAndRememberLastOpened(
      ref1,
      createSampleState("c104", "day1"),
    );
    app.eventDayRepository.save(ref2, createSampleState("c104", "day2"));
    app.activeEventDaySession.setActiveEventDay(
      ref1,
      app.eventDayRepository.load(ref1) ??
        createSampleState(ref1.eventId, ref1.dayId),
    );

    await app.handleStorageDeleteRequest({
      scope: { type: "all-events" },
      confirmation: "全イベントを削除",
    });

    expect(app.eventDayRepository.listEventDays()).toEqual([ref1]);
    expect(app.eventDayRepository.load(ref1)).toMatchObject({
      source: { type: "csv", fileName: "empty.csv" },
      circles: [],
    });
  });

  it("rejects all-events deletion if confirmation text is invalid", async () => {
    const app = new BrowserEventBinding();
    app.eventRegistry = createSampleRegistry();

    const ref1 = { eventId: "c104", dayId: "day1" };
    app.eventDayRepository.save(ref1, createSampleState("c104", "day1"));
    app.activeEventDaySession.setActiveEventDay(
      ref1,
      app.eventDayRepository.load(ref1) ?? createSampleState("c104", "day1"),
    );

    await app.handleStorageDeleteRequest({
      scope: { type: "all-events" },
      confirmation: "全イベントを削除 ",
    });

    expect(app.eventDayRepository.listEventDays()).toHaveLength(1);
  });
});
