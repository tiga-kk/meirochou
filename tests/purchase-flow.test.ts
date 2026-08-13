// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { BrowserApplication } from "../apps/webapp/js/app/browser-application";
import { createBrowserApplicationOptions } from "./helpers/browser-event-binding-fixture";
import { GasApiClient } from "../apps/webapp/js/api/gas-api-client";
import { GasPendingUpdateDelivery } from "../apps/webapp/js/features/circle-status/infrastructure/gas-pending-update-delivery";
import { CircleStatusController } from "../apps/webapp/js/features/circle-status/ui/circle-status-controller";
import { PendingGasUpdatesController } from "../apps/webapp/js/features/circle-status/ui/pending-gas-updates-controller";
import { ChangeCircleStatusUseCase } from "../apps/webapp/js/features/circle-status/use-cases/change-circle-status";
import { DiscardPendingGasUpdatesUseCase } from "../apps/webapp/js/features/circle-status/use-cases/discard-pending-gas-updates";
import { DefaultPendingGasUpdateBackgroundProcess } from "../apps/webapp/js/features/circle-status/use-cases/pending-gas-update-background-process";
import { SendPendingGasUpdatesUseCase } from "../apps/webapp/js/features/circle-status/use-cases/send-pending-gas-updates";
import { UndoCircleStatusChangeUseCase } from "../apps/webapp/js/features/circle-status/use-cases/undo-circle-status-change";
import {
  createActiveEventDaySession,
  type EventDayRef,
  type LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import { LocalStorageEventDayRepository } from "../apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository";
import { createEmptyEventDayState } from "../apps/webapp/js/state/storage-schema";
import {
  type StorageAdapter,
  StorageService,
} from "../apps/webapp/js/state/storage-service";

class MockStorageAdapter implements StorageAdapter {
  readonly map = new Map<string, string>();
  failWrites = false;

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

const REF: EventDayRef = { eventId: "C108", dayId: "day1" };
const NOW = "2026-07-23T09:00:00.000Z";

function createSetup(
  source: LocalEventDayState["source"],
  adapter = new MockStorageAdapter(),
  circles = [{ space: "A-01", priority: 1 }],
) {
  const repository = new LocalStorageEventDayRepository(new StorageService(adapter));
  const session = createActiveEventDaySession();
  const fetcher = vi.fn<typeof fetch>();
  const delivery = new GasPendingUpdateDelivery(new GasApiClient({ fetcher }));
  const send = new SendPendingGasUpdatesUseCase(repository, session, delivery);
  const discard = new DiscardPendingGasUpdatesUseCase(repository, session);
  const background = new DefaultPendingGasUpdateBackgroundProcess(send);
  const status = new CircleStatusController(
    new ChangeCircleStatusUseCase(repository, session, background),
    new UndoCircleStatusChangeUseCase(repository, session),
  );
  const pending = new PendingGasUpdatesController(send, discard);
  const state = {
    ...createEmptyEventDayState(source, "generation-1", NOW),
    circles,
  };
  repository.saveAndRememberLastOpened(REF, state);
  session.setActiveEventDay(REF, state);
  const bindingOptions = createBrowserApplicationOptions({
    repository,
    activeEventDaySession: session,
    circleStatusController: status,
    pendingGasUpdatesController: pending,
    backgroundProcess: background,
  });
  const completeCircleVisitOperation = vi.fn(
    bindingOptions.completeCircleVisit,
  );
  const app = new BrowserApplication({
    ...bindingOptions,
    completeCircleVisit: completeCircleVisitOperation,
  });
  app.routeGuidanceSession.replaceSnapshot({
    ...app.routeGuidanceSession.getSnapshot(),
    selectedDestination: { space: "A-01", sheetName: "Day1" },
    currentDestination: null,
  });
  app.ui.showToast = vi.fn();
  app.ui.showUndoSnackbar = vi.fn();
  app.ui.updateCounts = vi.fn();
  app.ui.updateCurrentLocation = vi.fn();
  app.ui.showNavigation = vi.fn();
  app.ui.showTarget = vi.fn();
  app.searchNext = vi.fn();
  return {
    adapter,
    repository,
    session,
    fetcher,
    app,
    completeCircleVisitOperation,
  };
}

describe("circle-status production integration", () => {
  test.each(["purchase", "hold"] as const)(
    "does not mutate a selected candidate before route confirmation (%s)",
    async (action) => {
      const fixture = createSetup({ type: "csv", fileName: "day1.csv" });
      fixture.app.routeGuidanceSession.replaceSnapshot({
        ...fixture.app.routeGuidanceSession.getSnapshot(),
        currentDestination: { space: "A-01", sheetName: "Day1" },
        selectedDestination: { space: "A-02", sheetName: "Day1" },
        selectionStatus: "ready",
      });

      await fixture.app.handleAction(action);

      expect(fixture.completeCircleVisitOperation).not.toHaveBeenCalled();
    },
  );

  test("routes a purchase through the injected plain operation", async () => {
    const fixture = createSetup({ type: "csv", fileName: "day1.csv" });

    await fixture.app.handleAction("purchase");

    expect(fixture.completeCircleVisitOperation).toHaveBeenCalledWith({
      eventDay: REF,
      circleSpace: "A-01",
      nextStatus: "purchased",
      expectedSourceGeneration: "generation-1",
    });
    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBe("purchased");
  });

  test("reaches the real FinishCurrentCircleUseCase and fully undoes through the shared Session", async () => {
    const fixture = createSetup({
      type: "gas",
      gasUrl: "https://example.test/gas",
      sheetName: "Day1",
    });
    fixture.app.routeMapAreaCatalog.replaceMapAreas([{ id: "east" }]);
    const loadMapAssets = vi
      .spyOn(fixture.app.routeMapAssetsLoader, "loadMapAssets")
      .mockResolvedValue({
        points: { image: { width: 20, height: 10 }, points: [] },
        gridMetadata: {
          width: 20,
          height: 10,
          cell_size: 10,
          cols: 2,
          rows: 1,
        },
        gridBytes: new Uint8Array([1, 1]),
      });
    const currentRoute = {
      cost: 10,
      cells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
      points: [
        { x: 5, y: 5 },
        { x: 15, y: 5 },
      ],
      startPosition: { x: 5, y: 5 },
      targetPosition: { x: 75, y: 50 },
      image: { width: 20, height: 10 },
    };
    fixture.app.routeGuidanceSession.replaceSnapshot({
      navigationState: {
        stage: "navigating",
        areaId: "east",
        currentPosition: {
          areaId: "east",
          gridIndex: 0,
          svgX: 25,
          svgY: 50,
          source: "manual-start",
        },
        targetSpace: "A-01",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "A-01",
        },
        provisionalOrder: ["A-01"],
        bestOrder: ["A-01"],
        optimizationGeneration: 1,
      },
      currentDestination: { space: "A-01", sheetName: "Day1" },
      currentRoute,
      selectedDestination: { space: "A-01", sheetName: "Day1" },
      selectedRoute: currentRoute,
      selectionStatus: "ready",
      routeOptimizationGeneration: 1,
    });
    const beforePurchase = fixture.app.routeGuidanceSession.getSnapshot();

    await fixture.app.addPurchased("A-01");

    expect(loadMapAssets).toHaveBeenCalledOnce();
    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBe("purchased");
    expect(fixture.app.routeGuidanceSession.getSnapshot().navigationState).toMatchObject({
      stage: "idle",
      targetSpace: null,
      currentPosition: {
        gridIndex: 1,
        svgX: 75,
        svgY: 50,
        source: "arrived-circle",
        circleSpace: "A-01",
      },
    });
    expect(fixture.repository.load(REF)?.gasOutbox).toHaveLength(1);

    expect(await fixture.app.undoLastPurchase()).toBe(true);
    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBeUndefined();
    expect(fixture.repository.load(REF)?.gasOutbox).toHaveLength(2);
    expect(fixture.repository.load(REF)?.gasOutbox.at(-1)?.purchased).toBe(false);
    expect(fixture.app.routeGuidanceSession.getSnapshot()).toEqual(beforePurchase);
    expect(fixture.app.ui.showNavigation).toHaveBeenCalled();
  });

  test("saves a purchase before attempting GAS delivery", async () => {
    const fixture = createSetup({
      type: "gas",
      gasUrl: "https://example.test/gas",
      sheetName: "Day1",
    });
    fixture.fetcher.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    await fixture.app.handleAction("purchase");

    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBe("purchased");
    expect(fixture.repository.load(REF)?.gasOutbox).toHaveLength(1);
    expect(fixture.app.ui.showToast).toHaveBeenCalledWith("A-01 購入！");
  });

  test("通常画面の購入を最新購入Undoとしてstatus・route・GASへ戻せる", async () => {
    const fixture = createSetup({
      type: "gas",
      gasUrl: "https://example.test/gas",
      sheetName: "Day1",
    });
    const beforePurchase = fixture.app.routeGuidanceSession.getSnapshot();

    await fixture.app.handleAction("purchase");

    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBe("purchased");
    expect(fixture.repository.load(REF)?.gasOutbox).toHaveLength(1);
    expect(fixture.app.latestPurchaseUndo).not.toBeNull();
    expect(fixture.app.ui.showUndoSnackbar).toHaveBeenCalledWith("A-01");

    expect(await fixture.app.undoLastPurchase()).toBe(true);
    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBeUndefined();
    expect(fixture.repository.load(REF)?.gasOutbox.at(-1)?.purchased).toBe(false);
    expect(fixture.app.routeGuidanceSession.getSnapshot()).toEqual(beforePurchase);
  });

  test("undoes the latest gallery purchase with route and GAS meaning intact", async () => {
    const fixture = createSetup({
      type: "gas",
      gasUrl: "https://example.test/gas",
      sheetName: "Day1",
    });
    const beforePurchase = fixture.app.routeGuidanceSession.getSnapshot();

    await fixture.app.addPurchased("A-01");
    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBe("purchased");
    expect(fixture.repository.load(REF)?.gasOutbox).toHaveLength(1);

    expect(await fixture.app.undoLastPurchase()).toBe(true);
    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBeUndefined();
    expect(fixture.repository.load(REF)?.gasOutbox).toHaveLength(2);
    expect(fixture.repository.load(REF)?.gasOutbox.at(-1)?.purchased).toBe(false);
    expect(fixture.app.routeGuidanceSession.getSnapshot()).toEqual(beforePurchase);
    expect(fixture.app.ui.showTarget).not.toHaveBeenCalled();
  });

  test("invalidates a gallery token after another status operation", async () => {
    const fixture = createSetup({ type: "csv", fileName: "day1.csv" });

    await fixture.app.addPurchased("A-01");
    await fixture.app.addHold("A-01");

    expect(await fixture.app.undoLastPurchase()).toBe(false);
    expect(await fixture.app.undoLastPurchase()).toBe(false);
    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBe("held");
  });

  test("通常購入は最新1件だけUndoでき、holdではUndo表示を作らない", async () => {
    const fixture = createSetup(
      { type: "csv", fileName: "day1.csv" },
      new MockStorageAdapter(),
      [
        { space: "A-01", priority: 1 },
        { space: "A-02", priority: 2 },
      ],
    );

    await fixture.app.addPurchased("A-01");
    await fixture.app.addPurchased("A-02");
    expect(await fixture.app.undoLastPurchase()).toBe(true);
    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBe("purchased");
    expect(fixture.repository.load(REF)?.circleStates["A-02"]).toBeUndefined();
    expect(await fixture.app.undoLastPurchase()).toBe(false);

    fixture.app.ui.showUndoSnackbar = vi.fn();
    await fixture.app.addHold("A-01");
    expect(fixture.app.ui.showUndoSnackbar).not.toHaveBeenCalled();
  });

  test("通常購入のUndoは期限切れ後に実行できない", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-13T09:00:00.000Z"));
      const fixture = createSetup({ type: "csv", fileName: "day1.csv" });

      await fixture.app.handleAction("purchase");
      vi.setSystemTime(new Date("2026-08-13T09:00:05.001Z"));

      expect(await fixture.app.undoLastPurchase()).toBe(false);
      expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBe("purchased");
    } finally {
      vi.useRealTimers();
    }
  });

  test("reports local save failure without calling GAS or claiming success", async () => {
    const fixture = createSetup({ type: "csv", fileName: "day1.csv" });
    fixture.adapter.failWrites = true;

    await fixture.app.handleAction("purchase");

    expect(fixture.fetcher).not.toHaveBeenCalled();
    expect(fixture.app.ui.showToast).toHaveBeenCalledWith(
      "端末への保存に失敗しました。操作は反映されていません。",
      "error",
    );
    expect(fixture.app.ui.showToast).not.toHaveBeenCalledWith("A-01 購入！");
  });

  test("keeps the local purchase when a later GAS request fails", async () => {
    const fixture = createSetup({
      type: "gas",
      gasUrl: "https://example.test/gas",
      sheetName: "Day1",
    });
    fixture.fetcher.mockRejectedValue(new Error("Network connection lost"));

    await fixture.app.handleAction("purchase");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fixture.repository.load(REF)?.circleStates["A-01"]).toBe("purchased");
    expect(fixture.repository.load(REF)?.gasOutbox).toHaveLength(1);
    expect(fixture.app.ui.showToast).toHaveBeenCalledWith("A-01 購入！");
    expect(fixture.app.ui.showToast).not.toHaveBeenCalledWith(
      "GAS同期に失敗しました。未送信データは端末に保持されています。",
      "warning",
    );
  });

  test("keeps two-circle purchase progress independent from failed GAS delivery", async () => {
    const fixture = createSetup(
      {
        type: "gas",
        gasUrl: "https://script.google.com/macros/s/test/exec",
        sheetName: "Day1",
      },
      new MockStorageAdapter(),
      [
        { space: "東A01a", priority: 1 },
        { space: "東A02b", priority: 2 },
      ],
    );
    fixture.app.routeMapAreaCatalog.replaceMapAreas([
      { id: "east", prefixes: ["東"], labels: ["A"] },
    ]);
    vi.spyOn(fixture.app.routeMapAssetsLoader, "loadMapAssets").mockResolvedValue({
      points: {
        image: { width: 30, height: 10 },
        points: [
          {
            identifier: "A",
            number: 1,
            center_x: 15,
            center_y: 5,
            portals: [{ col: 1, row: 0, x: 15, y: 5 }],
          },
          {
            identifier: "A",
            number: 2,
            center_x: 25,
            center_y: 5,
            portals: [{ col: 2, row: 0, x: 25, y: 5 }],
          },
        ],
      },
      gridMetadata: {
        width: 30,
        height: 10,
        cell_size: 10,
        cols: 3,
        rows: 1,
      },
      gridBytes: new Uint8Array([1, 1, 1]),
    });
    fixture.fetcher.mockRejectedValue(new Error("Network connection lost"));
    const currentRoute = {
      cost: 10,
      cells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
      points: [
        { x: 5, y: 5 },
        { x: 15, y: 5 },
      ],
      startPosition: { x: 5, y: 5 },
      targetPosition: { x: 15, y: 5 },
      image: { width: 30, height: 10 },
    };
    fixture.app.routeGuidanceSession.replaceSnapshot({
      navigationState: {
        stage: "navigating",
        areaId: "east",
        currentPosition: {
          areaId: "east",
          gridIndex: 0,
          svgX: 5,
          svgY: 5,
          source: "manual-start",
        },
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a", "東A02b"],
        bestOrder: ["東A01a", "東A02b"],
        optimizationGeneration: 1,
      },
      currentDestination: { space: "東A01a" },
      currentRoute,
      selectedDestination: { space: "東A01a" },
      selectedRoute: currentRoute,
      selectionStatus: "idle",
      routeOptimizationGeneration: 1,
    });

    fixture.app.startSyncCoordinator();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.app.handleAction("purchase");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fixture.repository.load(REF)?.circleStates["東A01a"]).toBe("purchased");
    expect(fixture.repository.load(REF)?.gasOutbox).toHaveLength(1);
    expect(fixture.fetcher).toHaveBeenCalledOnce();
    expect(fixture.app.routeGuidanceSession.getSnapshot().navigationState).toMatchObject({
      stage: "navigating",
      targetSpace: "東A02b",
    });
    expect(fixture.app.ui.showNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTarget: expect.objectContaining({ space: "東A02b" }),
      }),
    );
  });

  test("removes a non-current gallery purchase from future navigation order", async () => {
    const fixture = createSetup(
      { type: "csv", fileName: "day1.csv" },
      new MockStorageAdapter(),
      [
        { space: "東A01a", priority: 1 },
        { space: "東A02b", priority: 2 },
      ],
    );
    const currentRoute = {
      cost: 10,
      cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }],
      points: [{ x: 5, y: 5 }, { x: 15, y: 5 }],
      startPosition: { x: 5, y: 5 },
      targetPosition: { x: 15, y: 5 },
      image: { width: 30, height: 10 },
    };
    fixture.app.routeGuidanceSession.replaceSnapshot({
      navigationState: {
        stage: "navigating",
        areaId: "east",
        currentPosition: {
          areaId: "east",
          gridIndex: 0,
          svgX: 5,
          svgY: 5,
          source: "manual-start",
        },
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a", "東A02b"],
        bestOrder: ["東A01a", "東A02b"],
        optimizationGeneration: 1,
      },
      currentDestination: { space: "東A01a" },
      currentRoute,
      selectedDestination: { space: "東A01a" },
      selectedRoute: currentRoute,
      selectionStatus: "idle",
      routeOptimizationGeneration: 1,
    });
    fixture.app.routeMapAreaCatalog.replaceMapAreas([
      { id: "east", prefixes: ["東"], labels: ["A"] },
    ]);
    vi.spyOn(fixture.app.routeMapAssetsLoader, "loadMapAssets").mockResolvedValue({
      points: {
        image: { width: 30, height: 10 },
        points: [
          {
            identifier: "A",
            number: 1,
            center_x: 15,
            center_y: 5,
            portals: [{ col: 1, row: 0, x: 15, y: 5 }],
          },
          {
            identifier: "A",
            number: 2,
            center_x: 25,
            center_y: 5,
            portals: [{ col: 2, row: 0, x: 25, y: 5 }],
          },
        ],
      },
      gridMetadata: {
        width: 30,
        height: 10,
        cell_size: 10,
        cols: 3,
        rows: 1,
      },
      gridBytes: new Uint8Array([1, 1, 1]),
    });
    const saveSnapshot = vi.spyOn(fixture.app, "saveNavigationSnapshot");

    await fixture.app.addPurchased("東A02b");

    const snapshot = fixture.app.routeGuidanceSession.getSnapshot();
    expect(fixture.repository.load(REF)?.circleStates["東A02b"]).toBe("purchased");
    expect(snapshot.navigationState).toMatchObject({
      targetSpace: "東A01a",
      lockedFirstLeg: { toSpace: "東A01a" },
      bestOrder: ["東A01a"],
      provisionalOrder: ["東A01a"],
    });
    expect(snapshot.currentDestination).toEqual({ space: "東A01a" });
    expect(snapshot.currentRoute).toEqual(currentRoute);
    expect(saveSnapshot).toHaveBeenCalledOnce();

    await fixture.app.addPurchased("東A01a");

    const finishedSnapshot = fixture.app.routeGuidanceSession.getSnapshot();
    expect(fixture.repository.load(REF)?.circleStates).toMatchObject({
      "東A01a": "purchased",
      "東A02b": "purchased",
    });
    expect(finishedSnapshot.navigationState?.targetSpace).toBeNull();
    expect(finishedSnapshot.currentDestination).toBeNull();
    expect(finishedSnapshot.currentRoute).toBeNull();
    expect(finishedSnapshot.navigationState?.bestOrder).not.toContain("東A02b");
    expect(finishedSnapshot.navigationState?.provisionalOrder).not.toContain("東A02b");
  });

  test("keeps purchase progress when background notification throws synchronously", async () => {
    const fixture = createSetup({
      type: "gas",
      gasUrl: "https://example.test/gas",
      sheetName: "Day1",
    }, new MockStorageAdapter(), [
      { space: "東A01a", priority: 1 },
      { space: "東A02b", priority: 2 },
    ]);
    fixture.app.routeMapAreaCatalog.replaceMapAreas([
      { id: "east", prefixes: ["東"], labels: ["A"] },
    ]);
    vi.spyOn(fixture.app.routeMapAssetsLoader, "loadMapAssets").mockResolvedValue({
      points: {
        image: { width: 30, height: 10 },
        points: [
          {
            identifier: "A",
            number: 1,
            center_x: 15,
            center_y: 5,
            portals: [{ col: 1, row: 0, x: 15, y: 5 }],
          },
          {
            identifier: "A",
            number: 2,
            center_x: 25,
            center_y: 5,
            portals: [{ col: 2, row: 0, x: 25, y: 5 }],
          },
        ],
      },
      gridMetadata: {
        width: 30,
        height: 10,
        cell_size: 10,
        cols: 3,
        rows: 1,
      },
      gridBytes: new Uint8Array([1, 1, 1]),
    });
    const currentRoute = {
      cost: 10,
      cells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
      points: [
        { x: 5, y: 5 },
        { x: 15, y: 5 },
      ],
      startPosition: { x: 5, y: 5 },
      targetPosition: { x: 15, y: 5 },
      image: { width: 30, height: 10 },
    };
    fixture.app.routeGuidanceSession.replaceSnapshot({
      navigationState: {
        stage: "navigating",
        areaId: "east",
        currentPosition: {
          areaId: "east",
          gridIndex: 0,
          svgX: 5,
          svgY: 5,
          source: "manual-start",
        },
        targetSpace: "東A01a",
        lockedFirstLeg: {
          from: { type: "start", areaId: "east", gridIndex: 0 },
          toSpace: "東A01a",
        },
        provisionalOrder: ["東A01a", "東A02b"],
        bestOrder: ["東A01a", "東A02b"],
        optimizationGeneration: 1,
      },
      currentDestination: { space: "東A01a" },
      currentRoute,
      selectedDestination: { space: "東A01a" },
      selectedRoute: currentRoute,
      selectionStatus: "idle",
      routeOptimizationGeneration: 1,
    });
    fixture.app.backgroundProcess.requestSend = vi.fn(() => {
      throw new Error("background unavailable");
    });

    await fixture.app.handleAction("purchase");

    expect(fixture.repository.load(REF)?.circleStates["東A01a"]).toBe("purchased");
    expect(fixture.app.ui.showToast).toHaveBeenCalledWith("東A01a 購入！");
    expect(fixture.app.routeGuidanceSession.getSnapshot().navigationState).toMatchObject({
      stage: "navigating",
      targetSpace: "東A02b",
    });
  });
});
