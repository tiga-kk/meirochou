// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { App } from "../apps/webapp/js/app";
import type {
  EventRegistryV1,
  LocalEventDayState,
} from "../apps/webapp/js/types/domain";

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

describe("App & Storage Deletion Integration", () => {
  it("handles storage-delete-request for active event-day and falls back to default event/day", async () => {
    const app = new App();
    app.dm.eventRegistry = createSampleRegistry();

    const ref1 = { eventId: "c104", dayId: "day1" };
    const ref2 = { eventId: "c104", dayId: "day2" };

    app.dm.repository.saveWithLastOpened(
      ref1,
      createSampleState("c104", "day1"),
    );
    app.dm.repository.save(ref2, createSampleState("c104", "day2"));
    app.dm.activeEventDaySession.setActiveEventDay(
      ref1,
      app.dm.repository.load(ref1)!,
    );

    const transitionSpy = vi
      .spyOn(app, "handleEventDaySelect")
      .mockResolvedValue(undefined);

    await app.handleStorageDeleteRequest({
      scope: { type: "event-day", ref: ref1 },
      confirmation: "",
    });

    expect(app.dm.repository.load(ref1)).toBeNull();
    expect(transitionSpy).toHaveBeenCalledWith(ref2);
  });

  it("does not switch active state when deleting a non-active event-day", async () => {
    const app = new App();
    app.dm.eventRegistry = createSampleRegistry();

    const activeRef = { eventId: "c104", dayId: "day1" };
    const deletedRef = { eventId: "c104", dayId: "day2" };
    app.dm.repository.saveWithLastOpened(
      activeRef,
      createSampleState("c104", "day1"),
    );
    app.dm.repository.save(deletedRef, createSampleState("c104", "day2"));
    app.dm.activeEventDaySession.setActiveEventDay(
      activeRef,
      app.dm.repository.load(activeRef)!,
    );

    const transitionSpy = vi.spyOn(app, "handleEventDaySelect");
    await app.handleStorageDeleteRequest({
      scope: { type: "event-day", ref: deletedRef },
      confirmation: "",
    });

    expect(app.dm.repository.load(deletedRef)).toBeNull();
    expect(app.dm.activeRef).toEqual(activeRef);
    expect(transitionSpy).not.toHaveBeenCalled();
  });

  it("handles all-events deletion, clears repository, and reinitializes registry default state", async () => {
    const app = new App();
    app.dm.eventRegistry = createSampleRegistry();

    const ref1 = { eventId: "c104", dayId: "day1" };
    const ref2 = { eventId: "c104", dayId: "day2" };

    app.dm.repository.saveWithLastOpened(
      ref1,
      createSampleState("c104", "day1"),
    );
    app.dm.repository.save(ref2, createSampleState("c104", "day2"));
    app.dm.activeEventDaySession.setActiveEventDay(
      ref1,
      app.dm.repository.load(ref1)!,
    );

    const transitionSpy = vi
      .spyOn(app, "handleEventDaySelect")
      .mockResolvedValue(undefined);

    await app.handleStorageDeleteRequest({
      scope: { type: "all-events" },
      confirmation: "全イベントを削除",
    });

    expect(app.dm.repository.list()).toHaveLength(0);
    expect(transitionSpy).toHaveBeenCalledWith({
      eventId: "c104",
      dayId: "day1",
    });
  });

  it("rejects all-events deletion if confirmation text is invalid", async () => {
    const app = new App();
    app.dm.eventRegistry = createSampleRegistry();

    const ref1 = { eventId: "c104", dayId: "day1" };
    app.dm.repository.save(ref1, createSampleState("c104", "day1"));
    app.dm.activeEventDaySession.setActiveEventDay(
      ref1,
      app.dm.repository.load(ref1) ?? createSampleState("c104", "day1"),
    );

    await app.handleStorageDeleteRequest({
      scope: { type: "all-events" },
      confirmation: "全イベントを削除 ",
    });

    expect(app.dm.repository.list()).toHaveLength(1);
  });
});
