// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ComiPathBrowserRuntime } from "../apps/webapp/js/comipath-browser-runtime.js";
import { ChangeCircleStatusUseCase } from "../apps/webapp/js/features/circle-status/use-cases/change-circle-status";
import type {
  CircleRecord,
  EventDayRef,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import { createInitialNavigationState } from "../apps/webapp/js/features/route-guidance/domain/navigation-state";
import { RouteGuidanceNavigationOperations as NavigationOrchestrationService } from "../apps/webapp/js/features/route-guidance/use-cases/route-guidance-navigation-operations";
import { dispatchManagementEvent } from "../apps/webapp/js/shared/ui/management-events";
import { createEmptyEventDayState } from "../apps/webapp/js/state/storage-schema";

const REF: EventDayRef = { eventId: "demo-v1", dayId: "day1" };
const NOW = "2026-07-28T00:00:00.000Z";

function createProductionAppFixture() {
  document.body.innerHTML = `
    <button id="toggle-settings"></button><div id="settings-area"></div>
    <button id="btn-search"></button><button id="btn-purchased"></button>
    <button id="btn-hold"></button><button id="btn-reset-all"></button>
    <div id="source-diff-dialog"></div><div id="navigation-resume-dialog"></div>`;
  const settings = document.getElementById("settings-area") as HTMLElement;
  const resumeDialog = document.getElementById(
    "navigation-resume-dialog",
  ) as HTMLElement;
  const addEventListener = vi.spyOn(settings, "addEventListener");
  const resumeAddEventListener = vi.spyOn(resumeDialog, "addEventListener");
  const worker = {
    onmessage: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  const app = new ComiPathBrowserRuntime({ alnsWorkerFactory: () => worker });
  vi.spyOn(app.dm, "disposeSyncCoordinator");
  return { app, settings, addEventListener, resumeAddEventListener };
}

function createGasState(): LocalEventDayState {
  return createEmptyEventDayState(
    { type: "gas", gasUrl: "https://example.test/gas", sheetName: "demo" },
    "generation-1",
    NOW,
  );
}

describe("apps public behavior characterization", () => {
  it("binds each browser event once and stops sync coordination on dispose", () => {
    const { app, addEventListener, resumeAddEventListener } =
      createProductionAppFixture();
    app.setupEvents();

    expect(
      resumeAddEventListener.mock.calls.filter(
        ([type]) => type === "resume-confirm",
      ).length,
    ).toBeGreaterThanOrEqual(0);

    expect(
      addEventListener.mock.calls.filter(
        ([type]) => type === "storage-delete-request",
      ),
    ).toHaveLength(1);

    app.dispose();
    expect(app.dm.disposeSyncCoordinator).toHaveBeenCalledOnce();
  });

  it("switches active event/day state from the public event", async () => {
    const { assembleComiPathApplication } = await import(
      "../apps/webapp/js/app/assemble-comipath-application"
    );
    const repository = {
      getLastOpenedEventDay: vi.fn(() => REF),
      load: vi.fn(() => null),
      save: vi.fn(),
      saveAndRememberLastOpened: vi.fn(),
      listEventDays: vi.fn(() => [REF]),
      rememberLastOpenedEventDay: vi.fn(),
      deleteEventDay: vi.fn(),
      listEventDaysForDeletion: vi.fn(() => []),
      deleteAllEventDays: vi.fn(),
    };
    const eventDayView = {
      render: vi.fn(),
      showError: vi.fn(),
      focusSelected: vi.fn(),
    };
    const registry = {
      schemaVersion: 1 as const,
      events: [
        {
          eventId: "demo-v1",
          displayName: "Demo",
          mapBundle: "demo",
          days: [{ dayId: "day1", displayName: "Day 1" }],
        },
      ],
    };

    const app = assembleComiPathApplication({
      document: document,
      window: window,
      repository,
      eventDayView,
      registry,
    });

    await app.start();

    expect(repository.getLastOpenedEventDay).toHaveBeenCalled();
    expect(eventDayView.render).toHaveBeenCalled();

    app.stop();
  });

  it("shows a CSV preview before any repository apply", async () => {
    const { CircleDataSourceController } = await import(
      "../apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller"
    );
    const { createCircleDataSourceSession } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session"
    );
    const repository = {
      load: vi.fn(() => ({
        schemaVersion: 2 as const,
        source: { type: "csv" as const, fileName: "existing.csv" },
        sourceGeneration: "gen-1",
        circles: [],
        circleStates: {},
        gasOutbox: [],
        timestamps: {
          createdAt: NOW,
          updatedAt: NOW,
          sourceUpdatedAt: NOW,
        },
      })),
      save: vi.fn(),
    };
    const view = {
      showLoading: vi.fn(),
      showPreview: vi.fn(),
      showError: vi.fn(),
      showReady: vi.fn(),
    };
    const previewCsvImport = {
      execute: vi.fn(() => ({
        previewId: "preview-1",
        ref: REF,
        mode: "initial" as const,
        expectedSourceGeneration: "gen-1",
        diff: { added: [], updated: [], removed: [], unchanged: [] },
        newCircles: [{ space: "E1-01" }],
        fetchedAt: NOW,
        expiresAt: NOW,
      })),
    };

    const controller = new CircleDataSourceController({
      client: {} as any,
      session: createCircleDataSourceSession(),
      view,
      previewCsvImport: previewCsvImport as any,
      repository: repository as any,
    });

    await controller.handleCsvFile(REF, "demo.csv", "space\nE1-01");

    expect(previewCsvImport.execute).toHaveBeenCalledWith({
      eventDay: REF,
      fileName: "demo.csv",
      text: "space\nE1-01",
    });
    expect(view.showPreview).toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("persists purchase state and appends a pending GAS update", () => {
    const emptyState = createGasState();
    const state: LocalEventDayState = {
      ...emptyState,
      circles: [{ space: "E1-01" }],
    };
    let saved: LocalEventDayState | null = null;
    const repository: import("../apps/webapp/js/features/event-day/public-api").EventDayRepository =
      {
        load: () => saved ?? state,
        save: (_ref: EventDayRef, next: LocalEventDayState) => {
          saved = next;
        },
      };
    const activeEventDaySession: import("../apps/webapp/js/features/event-day/public-api").ActiveEventDaySession =
      {
        getActiveEventDay: () => ({ ref: REF, state }),
        replaceActiveEventDayState: vi.fn(),
        setActiveEventDay: () => {},
        clearActiveEventDay: () => {},
        subscribe: () => () => {},
      };

    const useCase = new ChangeCircleStatusUseCase(
      repository,
      activeEventDaySession,
    );
    const result = useCase.execute({
      eventDay: REF,
      circleSpace: "E1-01",
      nextStatus: "purchased",
      expectedSourceGeneration: "generation-1",
      changedAt: NOW,
    });

    expect(saved?.circleStates["E1-01"]).toBe("purchased");
    expect(result.pendingGasUpdateId).toBeTruthy();
    expect(saved?.gasOutbox).toHaveLength(1);
  });

  it("sets the current route target and snapshot-facing navigation state", () => {
    const viewCalls: string[] = [];
    const circle: CircleRecord = { space: "E1-01" };
    const startPosition = {
      areaId: "e456",
      gridIndex: 10,
      svgX: 1,
      svgY: 2,
      source: "manual-start" as const,
    };
    const result = new NavigationOrchestrationService().startNavigation({
      navState: createInitialNavigationState(),
      startPosition,
      pendingCircles: [circle],
      startDistances: new Map([[circle.space, 3]]),
    });
    viewCalls.push(`route:${result.navState.targetSpace}`);

    expect(result.navState.targetSpace).toBe("E1-01");
    expect(result.navState.lockedFirstLeg?.toSpace).toBe("E1-01");
    expect(viewCalls).toEqual(["route:E1-01"]);
  });

  it("accepts a delete request only with the required confirmation", () => {
    const dialog = document.createElement(
      "storage-delete-dialog",
    ) as HTMLElement & {
      model: unknown;
      updateComplete: Promise<unknown>;
    };
    dialog.model = {
      open: true,
      scope: { type: "all-events" },
      option: {
        scope: { type: "all-events" },
        label: "全イベント",
        consequence: "全データを削除します",
        blocked: false,
        blockedReason: null,
      },
      eventDayLabel: "demo-v1",
      busy: false,
      errorMessage: "",
    };
    document.body.append(dialog);
    const requests: string[] = [];
    dialog.addEventListener("storage-delete-request", (event) => {
      requests.push(
        (event as CustomEvent<{ confirmation: string }>).detail.confirmation,
      );
    });
    return dialog.updateComplete.then(async () => {
      const consent = dialog.querySelector<HTMLInputElement>(".consent-check");
      const phrase = dialog.querySelector<HTMLInputElement>(
        ".delete-confirm-input",
      );
      const submit = dialog.querySelector<HTMLButtonElement>(
        ".btn-confirm-delete",
      );
      consent?.click();
      await dialog.updateComplete;
      submit?.click();
      expect(requests).toEqual([]);
      if (phrase) {
        phrase.value = "全イベントを削除";
        phrase.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await dialog.updateComplete;
      submit?.click();
      expect(requests).toEqual(["全イベントを削除"]);
      dialog.remove();
    });
  });

  it("handles event-day-select event and opens corresponding event day state", async () => {
    const { assembleComiPathApplication } = await import(
      "../apps/webapp/js/app/assemble-comipath-application"
    );
    let loadedRef: EventDayRef | null = null;
    const repository = {
      getLastOpenedEventDay: vi.fn(() => REF),
      load: vi.fn((ref) => {
        loadedRef = ref;
        return null;
      }),
      save: vi.fn(),
      saveAndRememberLastOpened: vi.fn(),
      listEventDays: vi.fn(() => [REF]),
      rememberLastOpenedEventDay: vi.fn(),
      deleteEventDay: vi.fn(),
      listEventDaysForDeletion: vi.fn(() => []),
      deleteAllEventDays: vi.fn(),
    };
    const eventDayView = {
      render: vi.fn(),
      showError: vi.fn(),
      focusSelected: vi.fn(),
    };
    const registry = {
      schemaVersion: 1 as const,
      events: [
        {
          eventId: "demo-v1",
          displayName: "Demo",
          mapBundle: "demo",
          days: [{ dayId: "day1", displayName: "Day 1" }],
        },
      ],
    };

    const app = assembleComiPathApplication({
      document: document,
      window: window,
      repository,
      eventDayView,
      registry,
    });

    await app.start();

    const selectEvent = new CustomEvent("event-day-select", {
      detail: { ref: REF },
    });
    document.dispatchEvent(selectEvent);

    expect(repository.load).toHaveBeenCalledWith(REF);
    app.stop();
  });

  it("cancels active preview and resets circle data source session draft", async () => {
    const { createCircleDataSourceSession } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session"
    );

    const session = createCircleDataSourceSession();
    session.updateDraft({ draftWebAppUrl: "https://script.google.com/test" });
    session.setSheetNames(["Day1", "Day2"]);

    session.reset();

    const snap = session.getSnapshot();
    expect(snap.draftWebAppUrl).toBe("");
    expect(snap.sheetNames).toHaveLength(0);
    expect(snap.preview).toBeNull();
  });
});
