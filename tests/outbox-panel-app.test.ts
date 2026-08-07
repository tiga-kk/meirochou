// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { BrowserEventBinding } from "../apps/webapp/js/app/bind-browser-events";
import { createBrowserEventBindingOptions } from "./helpers/browser-event-binding-fixture";
import type {
  EventRegistryV1,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import { StorageService } from "../apps/webapp/js/state/storage-service";

function _createMockStorage(): StorageService {
  const store = new Map<string, string>();
  return new StorageService({
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
}

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

function createSampleGasState(
  eventId: string,
  dayId: string,
): LocalEventDayState {
  return {
    schemaVersion: 1,
    source: {
      type: "gas",
      gasUrl: `https://script.google.com/macros/s/AKfycbx_test_${eventId}_${dayId}/exec`,
      sheetName: dayId,
    },
    sourceGeneration: "gen-1",
    circles: [{ space: "東A01a" }],
    purchased: [],
    hold: [],
    history: [],
    redo: [],
    gasOutbox: [
      {
        id: `outbox-${eventId}-${dayId}-1`,
        eventId,
        dayId,
        sourceGeneration: "gen-1",
        gasUrl: `https://script.google.com/macros/s/AKfycbx_test_${eventId}_${dayId}/exec`,
        sheetName: dayId,
        space: "東A01a",
        purchased: true,
        createdAt: "2026-07-25T00:00:00.000Z",
        attempts: 1,
        lastError: "network",
      },
    ],
    timestamps: {
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
    },
  };
}

describe("ComiPathBrowserRuntime & OutboxPanel Integration", () => {
  it("does not repaint settings after retry completion becomes stale", async () => {
    const app = new BrowserEventBinding(createBrowserEventBindingOptions());
    const ref = { eventId: "c104", dayId: "day1" };
    let resolveRetry: (summary: {
      processedRefs: number;
      sent: number;
      pending: number;
      failures: never[];
    }) => void = () => {};
    vi.spyOn(app.pendingGasUpdatesController, "retryAll").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRetry = (s) => resolve(s.sent);
        }),
    );
    const updateSpy = vi
      .spyOn(app, "updateManagementModels")
      .mockImplementation(() => {});

    const retryPromise = app.handleGasRetryRequest({ ref });
    app.session.onSettingsClose();
    resolveRetry({
      processedRefs: 1,
      sent: 0,
      pending: 1,
      failures: [],
    });
    await retryPromise;

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects forged retry and discard event details at the ComiPathBrowserRuntime boundary", async () => {
    const app = new BrowserEventBinding(createBrowserEventBindingOptions());
    const retrySpy = vi.spyOn(app.pendingGasUpdatesController, "retryAll");
    const discardSpy = vi.spyOn(
      app.pendingGasUpdatesController,
      "discardOne",
    );

    await app.handleGasRetryRequest({
      ref: { eventId: 123, dayId: "day1" },
    });
    await app.handleGasDiscardRequest({
      ref: { eventId: "c104", dayId: "day1" },
      ids: ["valid-id", 123],
      confirmation: "未送信を破棄",
    });

    expect(retrySpy).not.toHaveBeenCalled();
    expect(discardSpy).not.toHaveBeenCalled();
  });

  it("delegates retry request to pendingGasUpdatesController and updates management models", async () => {
    const app = new BrowserEventBinding(createBrowserEventBindingOptions());
    app.eventRegistry = createSampleRegistry();

    const ref = { eventId: "c104", dayId: "day1" };
    app.eventDayRepository.save(ref, createSampleGasState("c104", "day1"));
    app.activeEventDaySession.setActiveEventDay(
      ref,
      app.eventDayRepository.load(ref) ??
        createSampleGasState(ref.eventId, ref.dayId),
    );

    const retrySpy = vi
      .spyOn(app.pendingGasUpdatesController, "retryAll")
      .mockResolvedValue(1);

    await app.handleGasRetryRequest({ ref });

    expect(retrySpy).toHaveBeenCalledWith(ref);
  });

  it("handles discard request with exact confirmation text and updates repository", async () => {
    const app = new BrowserEventBinding(createBrowserEventBindingOptions());
    app.eventRegistry = createSampleRegistry();

    const ref = { eventId: "c104", dayId: "day1" };
    const initialState = createSampleGasState("c104", "day1");
    app.eventDayRepository.save(ref, initialState);
    app.activeEventDaySession.setActiveEventDay(
      ref,
      app.eventDayRepository.load(ref) ??
        createSampleGasState(ref.eventId, ref.dayId),
    );

    const discardSpy = vi.spyOn(
      app.pendingGasUpdatesController,
      "discardOne",
    );

    await app.handleGasDiscardRequest({
      ref,
      ids: [`outbox-c104-day1-1`],
      confirmation: "未送信を破棄",
    });

    expect(discardSpy).toHaveBeenCalledWith(ref, `outbox-c104-day1-1`);

    const updated = app.eventDayRepository.load(ref);
    expect(updated?.gasOutbox).toHaveLength(0);
  });

  it("rejects discard request if confirmation text does not match", async () => {
    const app = new BrowserEventBinding(createBrowserEventBindingOptions());
    app.eventRegistry = createSampleRegistry();

    const ref = { eventId: "c104", dayId: "day1" };
    app.eventDayRepository.save(ref, createSampleGasState("c104", "day1"));
    app.activeEventDaySession.setActiveEventDay(
      ref,
      app.eventDayRepository.load(ref) ??
        createSampleGasState(ref.eventId, ref.dayId),
    );

    const discardSpy = vi.spyOn(
      app.pendingGasUpdatesController,
      "discardOne",
    );

    await app.handleGasDiscardRequest({
      ref,
      ids: [`outbox-c104-day1-1`],
      confirmation: "未送信を破棄 ", // invalid confirmation text
    });

    expect(discardSpy).not.toHaveBeenCalled();
  });

  it("maintains model coherence across outbox panel, event-day options, and delete options from the same snapshot", async () => {
    const app = new BrowserEventBinding(createBrowserEventBindingOptions());
    const registry = createSampleRegistry();
    app.eventRegistry = registry;

    const ref1 = { eventId: "c104", dayId: "day1" };
    const ref2 = { eventId: "c104", dayId: "day2" };
    app.eventDayRepository.save(ref1, createSampleGasState("c104", "day1"));
    app.eventDayRepository.save(ref2, createSampleGasState("c104", "day2"));
    app.activeEventDaySession.setActiveEventDay(
      ref1,
      app.eventDayRepository.load(ref1) ??
        createSampleGasState(ref1.eventId, ref1.dayId),
    );

    app.updateManagementModels();

    // Verify outbox model counts match selector pending counts
    const stateList = app.eventDayRepository
      .listEventDays()
      .map((r) => {
        const s = app.eventDayRepository.load(r);
        return s ? { ref: r, state: s } : null;
      })
      .filter(
        (
          item,
        ): item is {
          ref: typeof ref1;
          state: NonNullable<ReturnType<typeof app.eventDayRepository.load>>;
        } => item !== null,
      );
    const totalPendingInRepo = stateList.reduce(
      (acc, item) => acc + item.state.gasOutbox.length,
      0,
    );

    expect(totalPendingInRepo).toBe(2);
  });
});
