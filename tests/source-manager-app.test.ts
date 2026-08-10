// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserApplication } from "../apps/webapp/js/app/browser-application";
import { createBrowserApplicationOptions } from "./helpers/browser-event-binding-fixture";
import {
  CircleDataSourcePanel,
  type CircleDataSourcePanelModel,
} from "../apps/webapp/js/components/circle-data-source-panel";
import type { EventRegistryV1 } from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import { LocalStorageEventDayRepository as EventDayRepository } from "../apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository";
import { StorageService } from "../apps/webapp/js/state/storage-service";

const sampleRegistry: EventRegistryV1 = {
  schemaVersion: 1,
  events: [
    {
      eventId: "c104",
      displayName: "コミックマーケット104",
      mapBundle: "demo-v1",
      days: [
        { dayId: "day1", displayName: "1日目" },
        { dayId: "day2", displayName: "2日目" },
      ],
    },
  ],
};

function setupDOM() {
  document.body.innerHTML = `
    <div id="spreadsheet-title"></div>
    <button id="toggle-settings"></button>
    <comipath-settings id="settings-area"></comipath-settings>
    <select id="loc-ewsn"><option value="e456">東456</option></select>
    <select id="loc-label"><option value="A">A</option></select>
    <input id="loc-number" value="01" />
    <div id="target-content" class="hidden"></div>
    <div id="target-empty"></div>
    <div id="target-loading" class="hidden"></div>
    <h1 id="target-space-heading"></h1>
    <span id="target-status-label"></span>
    <span id="selected-target-space"></span>
    <span id="target-sheet-name"></span>
    <span id="target-start-space"></span>
    <span id="target-route-log"></span>
    <span id="target-dist"></span>
    <span id="target-priority"></span>
    <span id="sub-target-space"></span>
    <a id="target-tweet-link"></a>
    <div id="tweet-embed-container"></div>
    <button id="btn-search"></button>
    <button id="btn-purchased"></button>
    <button id="btn-hold"></button>
    <button id="btn-undo"></button>
    <button id="btn-redo"></button>
    <button id="btn-reset-all"></button>
    <div id="toast"></div>
    <async-operation-indicator id="async-operation-indicator"></async-operation-indicator>
    <span id="count-e456"></span>
    <span id="count-e7"></span>
    <span id="count-w12"></span>
    <span id="count-s12"></span>
    <span id="count-hold-e456"></span>
    <span id="count-hold-e7"></span>
    <span id="count-hold-w12"></span>
    <span id="count-hold-s12"></span>
  `;
}

describe("CircleDataSource Orchestration & App Integration", () => {
  let app: BrowserApplication;

  beforeEach(async () => {
    setupDOM();
    localStorage.clear();
    const storage = new StorageService();
    const repo = new EventDayRepository(storage);
    app = new BrowserApplication(createBrowserApplicationOptions({ repository: repo }));
    app.eventRegistry = sampleRegistry;
    app.eventRegistryUrl = "/assets/events/manifest.json";
    repo.save(
      { eventId: "c104", dayId: "day1" },
      {
        schemaVersion: 1,
        source: { type: "csv", fileName: "empty.csv" },
        sourceGeneration: "gen_c104_day1",
        circles: [],
        purchased: [],
        hold: [],
        history: [],
        redo: [],
        gasOutbox: [],
        timestamps: {
          createdAt: "2026-07-23T00:00:00Z",
          updatedAt: "2026-07-23T00:00:00Z",
          sourceUpdatedAt: "2026-07-23T00:00:00Z",
        },
      },
    );

    await app.openEventDay({ eventId: "c104", dayId: "day1" });
    app.updateManagementModels();
  });

  it("discards out-of-order sheet list response if request generation changes", async () => {
    const { CircleDataSourceController } = await import(
      "../apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller"
    );
    const { createCircleDataSourceSession } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session"
    );
    const session = createCircleDataSourceSession();

    let resolveSheetNames: (val: string[]) => void = () => {};
    const client = {
      startLoadingSheetNames: vi.fn(() => ({
        result: new Promise<string[]>((res) => {
          resolveSheetNames = res;
        }),
        cancel: vi.fn(),
      })),
      startLoadingCircles: vi.fn(),
    };

    const controller = new CircleDataSourceController({
      client,
      session,
    });

    const validUrl =
      "https://script.google.com/macros/s/AKfycbx_TEST_DEPLOYMENT_ID/exec";

    const reqPromise = controller.loadGoogleSheetNames(validUrl);
    // Simulate generation shift by starting another request
    session.beginRequest("gas-preview");

    resolveSheetNames(["SheetA", "SheetB"]);
    await reqPromise;

    expect(session.getSnapshot().sheetNames).toEqual([]);
  });

  it("handles CSV validation error safely without leaking raw stack or file contents", async () => {
    const { PreviewCsvImportUseCase } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/preview-csv-import"
    );
    const useCase = new PreviewCsvImportUseCase(app.eventDayRepository);

    expect(() =>
      useCase.execute({
        eventDay: { eventId: "c104", dayId: "day1" },
        fileName: "bad.csv",
        text: "space,priority\n,invalid_number",
      }),
    ).toThrow();
  });

  it("stages a CSV replacement preview without modifying storage before apply", async () => {
    const { PreviewCsvImportUseCase } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/preview-csv-import"
    );
    const useCase = new PreviewCsvImportUseCase(app.eventDayRepository);

    const preview = useCase.execute({
      eventDay: { eventId: "c104", dayId: "day1" },
      fileName: "circles.csv",
      text: "space,priority\n東A-01a,1",
    });

    expect(preview.previewId).toBeDefined();
    const storedState = app.eventDayRepository.load({
      eventId: "c104",
      dayId: "day1",
    });
    expect(storedState?.circles).toEqual([]);
    expect(storedState?.source.fileName).toBe("empty.csv");
  });

  it("does not leak duplicate CSV cell values in validation errors", async () => {
    const { PreviewCsvImportUseCase } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/preview-csv-import"
    );
    const useCase = new PreviewCsvImportUseCase(app.eventDayRepository);

    try {
      useCase.execute({
        eventDay: { eventId: "c104", dayId: "day1" },
        fileName: "duplicate.csv",
        text: "space,priority\nSECRET-CELL,1\nSECRET-CELL,2",
      });
    } catch (err: any) {
      expect(err.message).not.toContain("SECRET-CELL");
      expect(err.message).toContain("Duplicate space");
    }
  });

  it("clears in-flight request when a newer source request starts", async () => {
    const { CircleDataSourceController } = await import(
      "../apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller"
    );
    const { createCircleDataSourceSession } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session"
    );
    const session = createCircleDataSourceSession();

    let resolveFirst: (value: string[]) => void = () => {};
    const client = {
      startLoadingSheetNames: vi
        .fn()
        .mockImplementationOnce(
          () => ({
            result: new Promise<string[]>((res) => {
              resolveFirst = res;
            }),
            cancel: vi.fn(),
          }),
        )
        .mockImplementationOnce(() => ({
          result: Promise.resolve(["SheetB"]),
          cancel: vi.fn(),
        })),
      startLoadingCircles: vi.fn(),
    };

    const controller = new CircleDataSourceController({
      client,
      session,
    });

    const firstRequest = controller.loadGoogleSheetNames(
      "https://script.google.com/macros/s/AKfycbx_FIRST/exec",
    );
    const secondRequest = controller.loadGoogleSheetNames(
      "https://script.google.com/macros/s/AKfycbx_SECOND/exec",
    );

    resolveFirst(["SheetA"]);
    await Promise.all([firstRequest, secondRequest]);

    expect(session.getSnapshot().sheetNames).toEqual(["SheetB"]);
  });

  it("resets error state when initiating a new request on session", async () => {
    const { createCircleDataSourceSession } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session"
    );
    const session = createCircleDataSourceSession();
    session.setError("network_error");

    session.beginRequest("gas-preview");
    expect(session.getSnapshot().errorMessage).toBeNull();
  });

  it("handles network failure gracefully when fetching google sheet names via LoadGoogleSheetNamesUseCase", async () => {
    const { LoadGoogleSheetNamesUseCase } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/load-google-sheet-names"
    );
    const mockClient = {
      startLoadingSheetNames: vi.fn(() => ({
        result: Promise.reject(new Error("Network connection lost")),
        cancel: vi.fn(),
      })),
      startLoadingCircles: vi.fn(),
    };

    const session = app.circleDataSourceSession;
    const useCase = new LoadGoogleSheetNamesUseCase(mockClient as any, session);

    const req = useCase.start({ webAppUrl: "https://script.google.com/macros/s/AKfycbx_FAIL/exec" });
    await expect(req.result).rejects.toThrow("Network connection lost");
  });

  it("updates sheet names list upon successful sheet list load via session setSheetNames", () => {
    const session = app.session;
    session.setSheetNames(["Day1", "Day2"]);
    expect(session.getSnapshot().sheetNames).toEqual(["Day1", "Day2"]);
  });

  it("renders session loading in the always-visible async indicator", async () => {
    app.session.beginRequest("gas-preview");
    await (document.querySelector("async-operation-indicator") as HTMLElement & {
      updateComplete: Promise<unknown>;
    }).updateComplete;

    expect(document.querySelector("async-operation-indicator")?.textContent).toContain(
      "GASからデータを読み込み中",
    );
  });

  it("keeps a typed GAS URL when a sheet-list session update rerenders the panel", async () => {
    const panel = document.createElement("source-manager") as CircleDataSourcePanel;
    document.body.appendChild(panel);
    const model: CircleDataSourcePanelModel = {
      activeRef: { eventId: "c104", dayId: "day1" },
      activeRefLabel: "Comiket 104 day1",
      source: {
        typeLabel: "CSV",
        detail: "empty.csv",
        endpointSummary: null,
        pendingCount: 0,
      },
      sourceType: "gas",
      gasUrlInput: "",
      selectedSheetName: "",
      sheetNames: [],
      pendingCount: 0,
      busy: false,
      errorMessage: "",
    };
    panel.model = model;
    await panel.updateComplete;

    const urlInput = panel.querySelector<HTMLInputElement>("#gas-url-input");
    if (!urlInput) throw new Error("GAS URL input was not rendered");
    urlInput.value = "https://script.google.com/macros/s/AKfycbx_TEST/exec";
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));
    await panel.updateComplete;

    panel.model = { ...model, sheetNames: ["配置シート1"] };
    await panel.updateComplete;

    expect(panel.querySelector<HTMLInputElement>("#gas-url-input")?.value).toBe(
      "https://script.google.com/macros/s/AKfycbx_TEST/exec",
    );
  });
});
