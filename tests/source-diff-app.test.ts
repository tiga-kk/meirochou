// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComiPathBrowserRuntime } from "../apps/webapp/js/comipath-browser-runtime";
import { EventDayDataStore } from "../apps/webapp/js/event-day-data-store";
import type {
  EventDayRef,
  EventRegistryV1,
} from "../apps/webapp/js/features/event-day/domain/application-contract-types";
import {
  type StorageAdapter,
  StorageService,
} from "../apps/webapp/js/state/storage-service";

class MockStorageAdapter implements StorageAdapter {
  public map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
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
        days: [
          { dayId: "day1", displayName: "1日目" },
          { dayId: "day2", displayName: "2日目" },
        ],
      },
    ],
  };
}

describe("ComiPathBrowserRuntime Source Diff Dialog Integration", () => {
  let adapter: MockStorageAdapter;
  let dataManager: EventDayDataStore;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="main-container">
        <comipath-settings id="settings-area"></comipath-settings>
        <select id="loc-ewsn"></select>
        <select id="loc-label"></select>
        <input id="loc-number" type="number" />
        <button id="btn-search"></button>
        <div id="next-target"></div>
        <div id="target-loading"></div>
        <div id="target-content"></div>
        <div id="target-empty"></div>
        <span id="header-area-mark"></span>
        <strong id="header-area-title"></strong>
        <span id="spreadsheet-title"></span>
        <strong id="target-space-heading"></strong>
        <span id="target-status-label"></span>
        <strong id="selected-target-space"></strong>
        <span id="target-sheet-name"></span>
        <strong id="target-start-space"></strong>
        <strong id="target-route-log"></strong>
        <span id="target-dist"></span>
        <span id="target-priority"></span>
        <span id="sub-target-space"></span>
        <a id="target-tweet-link"></a>
        <div id="tweet-embed-container"></div>
        <div id="route-selection-controls"></div>
        <p id="route-selection-message"></p>
        <button id="btn-preview-route"></button>
        <section id="route-change-confirmation"></section>
        <strong id="route-change-current"></strong>
        <small id="route-change-current-distance"></small>
        <strong id="route-change-candidate"></strong>
        <small id="route-change-candidate-distance"></small>
        <button id="btn-confirm-route-change"></button>
        <button id="btn-cancel-route-change"></button>
        <button id="btn-purchased"></button>
        <button id="btn-hold"></button>
        <button id="btn-undo"></button>
        <button id="btn-redo"></button>
        <button id="btn-reset-all"></button>
        <button id="toggle-settings"></button>
        <table id="stats-table"></table>
        <div id="toast"></div>
      </div>
      <source-diff-dialog id="source-diff-dialog"></source-diff-dialog>
    `;

    adapter = new MockStorageAdapter();
    const storage = new StorageService(adapter);
    dataManager = new EventDayDataStore(storage);
    dataManager.eventRegistry = createRegistry();
  });

  function setupApp(): ComiPathBrowserRuntime {
    const app = new ComiPathBrowserRuntime();
    (app as unknown as { dm: EventDayDataStore }).dm = dataManager;
    app.ui.init(dataManager);
    app.setupEvents();
    return app;
  }

  it("applies CSV replacement preview when source-preview-apply is dispatched", async () => {
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await dataManager.openEventDay(ref);

    const csvText =
      "space,priority,isSale,account,tweet,memo\r\n東1-A01a,10,o,circleA,http://x.com,memoA";
    const preview = await dataManager.previewCsvReplacement(
      ref,
      "test.csv",
      csvText,
    );

    const app = setupApp();
    app.session.setActivePreview({
      kind: "csv",
      ref,
      previewId: preview.previewId,
      expectedSourceGeneration: preview.expectedSourceGeneration,
    });

    const dialogEl = document.getElementById("source-diff-dialog");
    expect(dialogEl).not.toBeNull();

    // Dispatch source-preview-apply event from dialog
    const applyEvent = new CustomEvent("source-preview-apply", {
      bubbles: true,
      detail: { previewId: preview.previewId },
    });
    dialogEl?.dispatchEvent(applyEvent);

    // After apply, session preview should be cleared and activeState updated
    expect(app.session.getActivePreview()).toBeNull();
    expect(dataManager.activeState?.source).toEqual({
      type: "csv",
      fileName: "test.csv",
    });
    expect(dataManager.activeState?.circles.length).toBe(1);
  });

  it("cancels CSV preview when source-preview-cancel is dispatched", async () => {
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await dataManager.openEventDay(ref);

    const csvText =
      "space,priority,isSale,account,tweet,memo\r\n東1-A01a,10,o,circleA,http://x.com,memoA";
    const preview = await dataManager.previewCsvReplacement(
      ref,
      "test.csv",
      csvText,
    );

    const app = setupApp();
    app.session.setActivePreview({
      kind: "csv",
      ref,
      previewId: preview.previewId,
      expectedSourceGeneration: preview.expectedSourceGeneration,
    });

    const cancelSpy = vi.spyOn(dataManager, "cancelCsvPreview");
    const dialogEl = document.getElementById("source-diff-dialog");

    const cancelEvent = new CustomEvent("source-preview-cancel", {
      bubbles: true,
      detail: {},
    });
    dialogEl?.dispatchEvent(cancelEvent);

    expect(cancelSpy).toHaveBeenCalledWith(preview.previewId);
    expect(app.session.getActivePreview()).toBeNull();
  });

  it("cancels active preview when switching event/day or closing settings", async () => {
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await dataManager.openEventDay(ref);

    const csvText =
      "space,priority,isSale,account,tweet,memo\r\n東1-A01a,10,o,circleA,http://x.com,memoA";
    const preview = await dataManager.previewCsvReplacement(
      ref,
      "test.csv",
      csvText,
    );

    const app = setupApp();
    app.session.setActivePreview({
      kind: "csv",
      ref,
      previewId: preview.previewId,
      expectedSourceGeneration: preview.expectedSourceGeneration,
    });

    app.session.onEventDayChange();
    expect(app.session.getActivePreview()).toBeNull();

    // Re-set preview
    const preview2 = await dataManager.previewCsvReplacement(
      ref,
      "test2.csv",
      csvText,
    );
    app.session.setActivePreview({
      kind: "csv",
      ref,
      previewId: preview2.previewId,
      expectedSourceGeneration: preview2.expectedSourceGeneration,
    });

    app.session.onSettingsClose();
    expect(app.session.getActivePreview()).toBeNull();
  });

  it("keeps the dialog open with a safe message when apply fails", async () => {
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await dataManager.openEventDay(ref);

    const preview = await dataManager.previewCsvReplacement(
      ref,
      "test.csv",
      "space,priority,isSale,account,tweet,memo\r\n東1-A01a,10,o,circleA,http://x.com,memoA",
    );
    const app = setupApp();
    app.session.setActivePreview({
      kind: "csv",
      ref,
      previewId: preview.previewId,
      expectedSourceGeneration: preview.expectedSourceGeneration,
    });
    const dialog = document.getElementById(
      "source-diff-dialog",
    ) as HTMLElement & {
      model?: unknown;
    };
    dialog.model = {
      open: true,
      previewId: preview.previewId,
      sourceLabel: "test.csv",
      diff: {
        added: [],
        updated: [],
        removed: [],
        countsLabel: "追加: 0件 / 更新: 0件 / 削除: 0件",
      },
      busy: false,
      errorMessage: "",
    };

    vi.spyOn(dataManager, "applyCsvReplacement").mockImplementation(() => {
      throw Object.assign(new Error("private storage details"), {
        name: "StaleCsvPreviewError",
      });
    });

    document.getElementById("source-diff-dialog")?.dispatchEvent(
      new CustomEvent("source-preview-apply", {
        bubbles: true,
        detail: { previewId: preview.previewId },
      }),
    );
    await Promise.resolve();

    const dialogModel = dialog as HTMLElement & {
      model?: { open: boolean; errorMessage: string };
    };
    expect(dialogModel.model?.open).toBe(true);
    expect(dialogModel.model?.errorMessage).toContain(
      "プレビューが古くなっています",
    );
    expect(dialogModel.model?.errorMessage).not.toContain(
      "private storage details",
    );
    expect(app.session.getActivePreview()?.previewId).toBe(preview.previewId);
  });

  it("cancels the active preview when the settings toggle closes the panel", async () => {
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };
    await dataManager.openEventDay(ref);
    const preview = await dataManager.previewCsvReplacement(
      ref,
      "test.csv",
      "space,priority,isSale,account,tweet,memo\r\n東1-A01a,10,o,circleA,http://x.com,memoA",
    );
    const app = setupApp();
    app.ui.els.settingsArea.open = true;
    app.session.setActivePreview({
      kind: "csv",
      ref,
      previewId: preview.previewId,
      expectedSourceGeneration: preview.expectedSourceGeneration,
    });
    const cancelSpy = vi.spyOn(dataManager, "cancelCsvPreview");

    document.getElementById("toggle-settings")?.click();

    expect(cancelSpy).toHaveBeenCalledWith(preview.previewId);
    expect(app.session.getActivePreview()).toBeNull();
  });
});
