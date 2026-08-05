// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComiPathBrowserRuntime } from "../apps/webapp/js/comipath-browser-runtime";
import type {
  EventDayRef,
  EventRegistryV1,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import { LocalStorageEventDayRepository as EventDayRepository } from "../apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository";
import { StorageService } from "../apps/webapp/js/state/storage-service";

function createRegistry(): EventRegistryV1 {
  return {
    schemaVersion: 1,
    events: [
      {
        eventId: "C108",
        displayName: "コミックマーケット108",
        mapBundle: "demo-v1",
        days: [{ dayId: "day1", displayName: "1日目" }],
      },
    ],
  };
}

describe("Circle Data Source Diff & Preview Dialog Integration", () => {
  let app: ComiPathBrowserRuntime;
  let repo: EventDayRepository;

  beforeEach(async () => {
    document.body.innerHTML = `
      <button id="toggle-settings"></button>
      <comipath-settings id="settings-area"></comipath-settings>
      <source-diff-dialog id="source-diff-dialog"></source-diff-dialog>
      <div id="toast"></div>
    `;

    localStorage.clear();
    const storage = new StorageService();
    repo = new EventDayRepository(storage);

    app = new ComiPathBrowserRuntime();
    app.dm.eventRegistry = createRegistry();
    app.dm.eventRegistryUrl = "";
    app.dm.repository = repo;

    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    repo.save(ref, {
      schemaVersion: 1,
      source: { type: "csv", fileName: "initial.csv" },
      sourceGeneration: "gen-1",
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
    });

    await app.dm.openEventDay(ref);
  });

  it("stages and applies a valid CSV preview when handleCsvPreviewRequest is triggered", async () => {
    const csvContent = "space,priority\n東1-A01a,10";
    const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });
    Object.defineProperty(csvFile, "text", {
      value: async () => csvContent,
    });

    await app.handleCsvPreviewRequest(csvFile);

    const activePreview = app.session.getActivePreview?.() ?? null;
    expect(app.sourceErrorMessage).toBe("");

    // State in repository remains unchanged until apply is triggered
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    expect(repo.load(ref)?.circles).toHaveLength(0);
  });

  it("clears preview when event/day selection changes", async () => {
    const csvContent = "space,priority\n東1-A01a,10";
    const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });
    Object.defineProperty(csvFile, "text", {
      value: async () => csvContent,
    });

    await app.handleCsvPreviewRequest(csvFile);

    app.session.onEventDayChange();
    expect(app.session.getActivePreview?.() ?? null).toBeNull();
  });

  it("clears preview when settings panel is closed", async () => {
    const csvContent = "space,priority\n東1-A01a,10";
    const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });
    Object.defineProperty(csvFile, "text", {
      value: async () => csvContent,
    });

    await app.handleCsvPreviewRequest(csvFile);

    app.session.onSettingsClose();
    expect(app.session.getActivePreview?.() ?? null).toBeNull();
  });
});
