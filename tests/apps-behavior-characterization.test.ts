// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { App } from "../apps/webapp/js/app.js";
import { NavigationOrchestrationService } from "../apps/webapp/js/navigation/navigation-orchestration";
import { createInitialNavigationState } from "../apps/webapp/js/state/navigation-state";
import { PurchaseMutationService } from "../apps/webapp/js/state/purchase-mutation-service";
import { createEmptyEventDayState } from "../apps/webapp/js/state/storage-schema";
import type {
  CircleRecord,
  EventDayRef,
  LocalEventDayState,
} from "../apps/webapp/js/types/domain";
import { dispatchManagementEvent } from "../apps/webapp/js/ui/management-events";

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
  const calls: string[] = [];
  const addEventListener = vi.spyOn(settings, "addEventListener");
  const resumeAddEventListener = vi.spyOn(resumeDialog, "addEventListener");
  const worker = {
    onmessage: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  const app = new App({ alnsWorkerFactory: () => worker });
  vi.spyOn(app, "handleEventDaySelect").mockImplementation(async (detail) => {
    calls.push(`event:${detail.dayId}`);
  });
  vi.spyOn(app, "handleCsvPreviewRequest").mockImplementation(() => {
    calls.push("view:csv-preview");
  });
  vi.spyOn(app, "handleStorageDeleteRequest").mockImplementation(() => {
    calls.push("delete:request");
  });
  vi.spyOn(app, "handleResumeConfirm").mockImplementation(() => {
    calls.push("view:resume-confirm");
  });
  vi.spyOn(app.dm, "disposeSyncCoordinator");
  return { app, settings, calls, addEventListener, resumeAddEventListener };
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
      addEventListener.mock.calls.filter(
        ([type]) => type === "event-day-select",
      ),
    ).toHaveLength(1);
    expect(
      addEventListener.mock.calls.filter(
        ([type]) => type === "csv-preview-request",
      ),
    ).toHaveLength(1);
    expect(
      resumeAddEventListener.mock.calls.filter(
        ([type]) => type === "resume-confirm",
      ),
    ).toHaveLength(1);
    expect(
      addEventListener.mock.calls.filter(
        ([type]) => type === "storage-delete-request",
      ),
    ).toHaveLength(1);

    app.dispose();
    expect(app.dm.disposeSyncCoordinator).toHaveBeenCalledOnce();
  });

  it("switches active event/day state from the public event", () => {
    const { app, settings, calls } = createProductionAppFixture();
    app.setupEvents();

    dispatchManagementEvent(settings, "event-day-select", REF);

    expect(calls).toEqual(["event:day1"]);
    app.dispose();
  });

  it("shows a CSV preview before any repository apply", () => {
    const { app, settings, calls } = createProductionAppFixture();
    app.setupEvents();

    dispatchManagementEvent(settings, "csv-preview-request", {
      file: new File(["space\nE1-01"], "demo.csv", { type: "text/csv" }),
    });

    expect(calls).toEqual(["view:csv-preview"]);
    app.dispose();
  });

  it("persists purchase state and appends a pending GAS update", () => {
    const state = createGasState();
    let saved: LocalEventDayState | null = null;
    const repository = {
      load: () => saved ?? state,
      save: (_ref: EventDayRef, next: LocalEventDayState) => {
        saved = next;
      },
    } as unknown as ConstructorParameters<typeof PurchaseMutationService>[0];
    const outbox = {
      append: (nextState: LocalEventDayState) => ({
        state: {
          ...nextState,
          gasOutbox: [
            {
              id: "pending-1",
              eventId: REF.eventId,
              dayId: REF.dayId,
              sourceGeneration: nextState.sourceGeneration,
              gasUrl: "https://example.test/gas",
              sheetName: "demo",
              space: "E1-01",
              purchased: true,
              createdAt: NOW,
              attempts: 0,
              lastError: null,
            },
          ],
        },
        entry: { id: "pending-1" },
      }),
    } as unknown as ConstructorParameters<typeof PurchaseMutationService>[1];

    const result = new PurchaseMutationService(repository, outbox).setPurchased(
      REF,
      "E1-01",
      true,
      NOW,
    );

    expect(saved?.circleStates["E1-01"]).toBe("purchased");
    expect(result.queuedEntryId).toBe("pending-1");
    expect(result.pendingCount).toBe(1);
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
});
