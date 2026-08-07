// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { BrowserEventBinding } from "../apps/webapp/js/app/bind-browser-events";
import { createBrowserEventBindingOptions } from "./helpers/browser-event-binding-fixture";
import { completeCircleVisit } from "../apps/webapp/js/app/complete-circle-visit";
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

function createSetup(source: LocalEventDayState["source"], adapter = new MockStorageAdapter()) {
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
  const completeCircleVisitOperation = vi.fn(
    completeCircleVisit.bind(null, status),
  );
  const state = {
    ...createEmptyEventDayState(source, "generation-1", NOW),
    circles: [{ space: "A-01", priority: 1 }],
  };
  repository.saveAndRememberLastOpened(REF, state);
  session.setActiveEventDay(REF, state);
  const app = new BrowserEventBinding(
    createBrowserEventBindingOptions({
      repository,
      activeEventDaySession: session,
      circleStatusController: status,
      pendingGasUpdatesController: pending,
      backgroundProcess: background,
      completeCircleVisit: completeCircleVisitOperation,
    }),
  );
  app.routeGuidanceSession.replaceSnapshot({
    ...app.routeGuidanceSession.getSnapshot(),
    selectedDestination: { space: "A-01", sheetName: "Day1" },
    currentDestination: null,
  });
  app.ui.showToast = vi.fn();
  app.ui.updateCounts = vi.fn();
  app.ui.updateCurrentLocation = vi.fn();
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
    expect(fixture.app.ui.showToast).toHaveBeenCalledWith(
      "GAS同期に失敗しました。未送信データは端末に保持されています。",
      "warning",
    );
  });
});
