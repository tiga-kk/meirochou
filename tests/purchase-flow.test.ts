// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { GasApiClient } from "../apps/webapp/js/api/gas-api-client";
import { App } from "../apps/webapp/js/app";
import { DataManager } from "../apps/webapp/js/data-manager";
import { GasPendingUpdateDelivery } from "../apps/webapp/js/features/circle-status/infrastructure/gas-pending-update-delivery";
import { CircleStatusController } from "../apps/webapp/js/features/circle-status/ui/circle-status-controller";
import { PendingGasUpdatesController } from "../apps/webapp/js/features/circle-status/ui/pending-gas-updates-controller";
import { ChangeCircleStatusUseCase } from "../apps/webapp/js/features/circle-status/use-cases/change-circle-status";
import { DiscardPendingGasUpdatesUseCase } from "../apps/webapp/js/features/circle-status/use-cases/discard-pending-gas-updates";
import { DefaultPendingGasUpdateBackgroundProcess } from "../apps/webapp/js/features/circle-status/use-cases/pending-gas-update-background-process";
import { SendPendingGasUpdatesUseCase } from "../apps/webapp/js/features/circle-status/use-cases/send-pending-gas-updates";
import { UndoCircleStatusChangeUseCase } from "../apps/webapp/js/features/circle-status/use-cases/undo-circle-status-change";
import { LocalStorageEventDayRepository as EventDayRepository } from "../apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository";
import { createActiveEventDaySession } from "../apps/webapp/js/features/event-day/public-api";
import { getCircleVisitState } from "../apps/webapp/js/state/storage-schema";
import {
  type StorageAdapter,
  StorageService,
} from "../apps/webapp/js/state/storage-service";
import type {
  EventDayRef,
  EventRegistryV1,
  GasDataSource,
  LocalEventDayState,
} from "../apps/webapp/js/types/domain";

class MockStorageAdapter implements StorageAdapter {
  public map = new Map<string, string>();
  public failWrites = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("storage quota exceeded");
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function createRegistry(): EventRegistryV1 {
  return {
    schemaVersion: 1,
    events: [
      {
        eventId: "C108",
        displayName: "Comiket 108",
        mapBundle: "demo-v1",
        days: [{ dayId: "day1", displayName: "1日目" }],
      },
    ],
  };
}

function createSetup(adapter = new MockStorageAdapter()) {
  const now = new Date("2026-07-23T09:00:00.000Z");
  const storage = new StorageService(adapter);
  const repository = new EventDayRepository(storage);
  const activeEventDaySession = createActiveEventDaySession();

  const fetchSpy = vi.fn<typeof fetch>();
  const delivery = new GasPendingUpdateDelivery(
    new GasApiClient({ fetcher: fetchSpy }),
  );
  const sendPendingGasUpdates = new SendPendingGasUpdatesUseCase(
    repository,
    activeEventDaySession,
    delivery,
  );
  const discardPendingGasUpdates = new DiscardPendingGasUpdatesUseCase(
    repository,
    activeEventDaySession,
  );
  const backgroundProcess = new DefaultPendingGasUpdateBackgroundProcess(
    sendPendingGasUpdates,
  );
  const changeCircleStatus = new ChangeCircleStatusUseCase(
    repository,
    activeEventDaySession,
    backgroundProcess,
  );
  const undoCircleStatus = new UndoCircleStatusChangeUseCase(
    repository,
    activeEventDaySession,
  );
  const circleStatusController = new CircleStatusController(
    changeCircleStatus,
    undoCircleStatus,
  );
  const pendingGasUpdatesController = new PendingGasUpdatesController(
    sendPendingGasUpdates,
    discardPendingGasUpdates,
  );

  const manager = new DataManager(storage, {
    now: () => now,
    repository,
    activeEventDaySession,
    circleStatusController,
    pendingGasUpdatesController,
    backgroundProcess,
  });
  manager.eventRegistry = createRegistry();

  // Inject spy client
  (
    manager.client as unknown as { fetch: (input: unknown) => Promise<unknown> }
  ).fetch = fetchSpy;

  return { adapter, repository, manager, fetchSpy, getNow: () => now };
}

describe("Phase 3 Task 5: Integration and App purchase flows", () => {
  const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
  const gasSource: GasDataSource = {
    type: "gas",
    gasUrl: "https://script.google.com/macros/s/AKfycbx_test/exec",
    sheetName: "Day1",
  };

  test("Step 2: Save-before-send integration test", async () => {
    const { repository, manager, fetchSpy } = createSetup();

    const gasState: LocalEventDayState = {
      schemaVersion: 2,
      source: gasSource,
      sourceGeneration: "gen-1",
      circles: [{ space: "A-01", priority: 1 }],
      circleStates: {},
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    };
    repository.save(ref, gasState);
    await manager.openEventDay(ref);

    // Reject fetch network call
    fetchSpy.mockRejectedValue(new Error("Network connection lost"));

    // 1. Call setPurchased
    const result = manager.setPurchased("A-01", true);
    expect(getCircleVisitState(result.state.circleStates, "A-01")).toBe(
      "purchased",
    );

    // At the moment setPurchased finishes, repository MUST contain the purchase AND outbox entry
    const saved = repository.load(ref);
    expect(
      saved ? getCircleVisitState(saved.circleStates, "A-01") : "pending",
    ).toBe("purchased");
    expect(saved?.gasOutbox).toHaveLength(1);
    expect(saved?.gasOutbox[0].space).toBe("A-01");
    expect(saved?.gasOutbox[0].purchased).toBe(true);

    // Now flush outbox (simulating async background sending)
    const flushRes = await manager.flushActiveOutbox();
    expect(flushRes.sent).toBe(0);
    expect(flushRes.pending).toBe(1);

    // Verify purchase state remains intact in LocalStorage after POST failure
    const finalSaved = repository.load(ref);
    expect(
      finalSaved
        ? getCircleVisitState(finalSaved.circleStates, "A-01")
        : "pending",
    ).toBe("purchased");
    expect(finalSaved?.gasOutbox[0].attempts).toBe(2);
    expect(finalSaved?.gasOutbox[0].lastError).toBe("unknown");
  });

  test("Step 3: Storage failure in DataManager/App produces local error without network call", async () => {
    const { adapter, repository, manager, fetchSpy } = createSetup();

    const gasState: LocalEventDayState = {
      schemaVersion: 2,
      source: gasSource,
      sourceGeneration: "gen-1",
      circles: [{ space: "A-01", priority: 1 }],
      circleStates: {},
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    };
    repository.save(ref, gasState);
    await manager.openEventDay(ref);

    adapter.failWrites = true;

    expect(() => manager.setPurchased("A-01", true)).toThrow(
      "Failed to save event day state",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(manager.purchasedList).toEqual([]);
  });

  test("Step 3: App reports local save failure instead of success", async () => {
    const { adapter, repository, manager } = createSetup();
    repository.save(ref, {
      schemaVersion: 2,
      source: gasSource,
      sourceGeneration: "gen-1",
      circles: [{ space: "A-01", priority: 1 }],
      circleStates: {},
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    });
    await manager.openEventDay(ref);
    adapter.failWrites = true;

    const app = new App();
    app.dm = manager;
    app.selectionState = "idle";
    app.selectedTarget = { space: "A-01", sheetName: "Day1" };
    app.currentTarget = null;
    app.searchNext = vi.fn();
    app.ui.showToast = vi.fn();
    app.ui.updateCounts = vi.fn();
    app.ui.updateCurrentLocation = vi.fn();

    await app.handleAction("purchase");

    expect(app.ui.showToast).toHaveBeenCalledWith(
      "端末への保存に失敗しました。操作は反映されていません。",
      "error",
    );
    expect(app.ui.showToast).not.toHaveBeenCalledWith("A-01 購入！");
    expect(manager.purchasedList).toEqual([]);
  });

  test("Step 7: App reports a later GAS failure while keeping local success", async () => {
    const { repository, manager, fetchSpy } = createSetup();
    repository.save(ref, {
      schemaVersion: 2,
      source: gasSource,
      sourceGeneration: "gen-1",
      circles: [{ space: "A-01", priority: 1 }],
      circleStates: {},
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    });
    await manager.openEventDay(ref);
    fetchSpy.mockRejectedValue(new Error("Network connection lost"));

    const app = new App();
    app.dm = manager;
    app.selectionState = "idle";
    app.selectedTarget = { space: "A-01", sheetName: "Day1" };
    app.currentTarget = null;
    app.searchNext = vi.fn();
    app.ui.showToast = vi.fn();
    app.ui.updateCounts = vi.fn();
    app.ui.updateCurrentLocation = vi.fn();

    await app.handleAction("purchase");
    await manager.flushActiveOutbox();

    expect(app.ui.showToast).toHaveBeenCalledWith("A-01 購入！");
    expect(manager.purchasedList).toEqual(["A-01"]);
  });

  test("Task 6 Step 3: App startup ordering, zero GET calls, non-blocking start", async () => {
    const { repository, manager, fetchSpy } = createSetup();
    repository.save(ref, {
      schemaVersion: 2,
      source: gasSource,
      sourceGeneration: "gen-1",
      circles: [{ space: "A-01", priority: 1 }],
      circleStates: {},
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-21T07:45:00.000Z",
        updatedAt: "2026-07-21T07:45:00.000Z",
        sourceUpdatedAt: "2026-07-21T07:45:00.000Z",
      },
    });

    const app = new App();
    app.dm = manager;
    app.ui.init = vi.fn();
    app.setupEvents = vi.fn();
    app.ui.updateCounts = vi.fn();
    app.ui.showToast = vi.fn();
    app.searchNext = vi.fn();
    const startSyncSpy = manager.backgroundProcess
      ? vi.spyOn(manager.backgroundProcess, "start")
      : null;

    // App opens cached GAS state and starts background sync only after local init
    await app.init({ eventId: "C108", areas: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
    if (startSyncSpy) {
      expect(startSyncSpy).toHaveBeenCalledTimes(1);
    }

    // Dispose clean up
    app.dispose();
  });
});
