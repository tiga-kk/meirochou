// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComiPathBrowserRuntime } from "../apps/webapp/js/comipath-browser-runtime";
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

describe("CircleDataSourcePanel ComiPathBrowserRuntime Orchestration (Task 4 P0)", () => {
  let app: ComiPathBrowserRuntime;

  beforeEach(async () => {
    setupDOM();
    localStorage.clear();
    app = new ComiPathBrowserRuntime();
    app.dm.eventRegistry = sampleRegistry;
    app.dm.eventRegistryUrl = "/assets/events/manifest.json";

    const storage = new StorageService();
    const repo = new EventDayRepository(storage);
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

    await app.dm.openEventDay({ eventId: "c104", dayId: "day1" });
    app.updateManagementModels();
  });

  it("discards out-of-order sheet list response if ref changed during GET", async () => {
    let fetchResolver: (value: { ok: true; sheets: string[] }) => void =
      () => {};
    vi.spyOn(app.dm.client, "fetchSheetList").mockImplementation(
      () =>
        new Promise((resolve) => {
          fetchResolver = resolve;
        }),
    );

    const validUrl =
      "https://script.google.com/macros/s/AKfycbx_TEST_DEPLOYMENT_ID/exec";

    // Start sheet GET for c104/day1
    const requestPromise = app.handleGasSheetsRequest(validUrl);

    // Change ref to c104/day2 before response arrives
    await app.dm.openEventDay({ eventId: "c104", dayId: "day2" });
    app.session.onEventDayChange();

    // Now resolve the older GET response
    fetchResolver({ ok: true, sheets: ["SheetA", "SheetB"] });
    await requestPromise;

    // The fetched sheets for c104/day1 must NOT be applied to c104/day2
    expect(app.fetchedSheetNames).toEqual([]);
    expect(app.session.getActivePreview()).toBeNull();
  });

  it("handles CSV validation error safely without leaking raw stack or file contents", async () => {
    const invalidCsvFile = new File(
      ["space,priority\n,invalid_number"],
      "bad.csv",
      { type: "text/csv" },
    );

    await app.handleCsvPreviewRequest(invalidCsvFile);

    expect(app.sourceErrorMessage).toContain("CSVデータの検証エラー");
    expect(app.sourceErrorMessage).toContain("Missing required field: space");
    expect(app.session.getActivePreview()).toBeNull();
  });

  it("stages a CSV replacement preview without modifying storage before apply", async () => {
    const validCsvFile = new File(
      ["space,priority\n東A-01a,1"],
      "circles.csv",
      { type: "text/csv" },
    );

    await app.handleCsvPreviewRequest(validCsvFile);

    const preview = app.session.getActivePreview();
    expect(preview).not.toBeNull();
    expect(preview?.kind).toBe("csv");
    expect(preview?.ref).toEqual({ eventId: "c104", dayId: "day1" });

    // State in repository remains unchanged until Task 5 apply
    const storedState = app.dm.repository.load({
      eventId: "c104",
      dayId: "day1",
    });
    expect(storedState?.circles).toEqual([]);
    expect(storedState?.source.fileName).toBe("empty.csv");
  });

  it("does not leak a duplicate CSV cell value in validation errors", async () => {
    const invalidCsvFile = new File(
      ["space,priority\nSECRET-CELL,1\nSECRET-CELL,2"],
      "duplicate.csv",
    );

    await app.handleCsvPreviewRequest(invalidCsvFile);

    expect(app.sourceErrorMessage).not.toContain("SECRET-CELL");
    expect(app.sourceErrorMessage).toContain("Duplicate space");
  });

  it("clears the previous GAS request before starting a newer source request", async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveFirst: (value: { ok: true; sheets: string[] }) => void =
      () => {};
    vi.spyOn(app.dm.client, "fetchSheetList")
      .mockImplementationOnce((_url, signal) => {
        firstSignal = signal;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      })
      .mockResolvedValueOnce({ ok: true, sheets: ["SheetB"] });

    const firstRequest = app.handleGasSheetsRequest(
      "https://script.google.com/macros/s/AKfycbx_FIRST/exec",
    );
    const secondRequest = app.handleGasSheetsRequest(
      "https://script.google.com/macros/s/AKfycbx_SECOND/exec",
    );

    resolveFirst({ ok: true, sheets: ["SheetA"] });
    await Promise.all([firstRequest, secondRequest]);

    expect(firstSignal?.aborted).toBe(true);
    expect(app.fetchedSheetNames).toEqual(["SheetB"]);
    expect(app.session.isBusy("source-request")).toBe(false);
  });
});
