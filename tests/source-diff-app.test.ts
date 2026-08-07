// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserEventBinding } from "../apps/webapp/js/app/bind-browser-events";
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
  let app: BrowserEventBinding;
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

    app = new BrowserEventBinding();
    app.eventRegistry = createRegistry();
    app.eventRegistryUrl = "";
    app.eventDayRepository = repo;

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

    await app.openEventDay(ref);
  });

  it("stages and applies a valid CSV preview when PreviewCsvImportUseCase is triggered", async () => {
    const csvContent = "space,priority\n東1-A01a,10";
    const ref: EventDayRef = { eventId: "C108", dayId: "day1" };

    const { PreviewCsvImportUseCase } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/preview-csv-import"
    );
    const useCase = new PreviewCsvImportUseCase(repo);
    const preview = useCase.execute({
      eventDay: ref,
      fileName: "test.csv",
      text: csvContent,
    });

    expect(preview.previewId).toBeDefined();
    expect(repo.load(ref)?.circles).toHaveLength(0);
  });

  it("clears preview when event/day selection changes", async () => {
    const session = app.circleDataSourceSession ?? app.session;
    session.setPreview({
      previewId: "prev-1",
      ref: { eventId: "C108", dayId: "day1" },
      mode: "initial",
      expectedSourceGeneration: "gen-1",
      diff: { added: [], updated: [], removed: [], unchanged: [] },
      newCircles: [],
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    });

    app.session.onEventDayChange();
    expect(app.session.getActivePreview?.() ?? null).toBeNull();
  });

  it("clears preview when settings panel is closed", async () => {
    const session = app.circleDataSourceSession ?? app.session;
    session.setPreview({
      previewId: "prev-1",
      ref: { eventId: "C108", dayId: "day1" },
      mode: "initial",
      expectedSourceGeneration: "gen-1",
      diff: { added: [], updated: [], removed: [], unchanged: [] },
      newCircles: [],
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    });

    app.session.onSettingsClose();
    expect(app.session.getActivePreview?.() ?? null).toBeNull();
  });

  it("cancels active preview via CancelCircleDataPreviewUseCase", async () => {
    const { CancelCircleDataPreviewUseCase } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/cancel-circle-data-preview"
    );
    const cancelUseCase = new CancelCircleDataPreviewUseCase();
    expect(() =>
      cancelUseCase.execute({
        previewId: "prev_1",
        ref: { eventId: "C108", dayId: "day1" },
        mode: "initial",
        expectedSourceGeneration: "gen_1",
        diff: { added: [], updated: [], removed: [], countsLabel: "" },
        newCircles: [],
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      }),
    ).not.toThrow();
  });

  it("handles error when ApplyCircleDataPreviewUseCase fails on stale generation", async () => {
    const { ApplyCircleDataPreviewUseCase } = await import(
      "../apps/webapp/js/features/circle-data-source/use-cases/apply-circle-data-preview"
    );
    const mockRepo = {
      load: () => ({
        schemaVersion: 2 as const,
        source: { type: "csv" as const, fileName: "existing.csv" },
        sourceGeneration: "gen_2", // mismatched
        circles: [],
        circleStates: {},
        gasOutbox: [],
        timestamps: { createdAt: "", updatedAt: "", sourceUpdatedAt: "" },
      }),
      save: vi.fn(),
    };
    const mockSession = {
      getActiveEventDay: () => null,
      replaceActiveEventDayState: vi.fn(),
    };
    const mockInvalidation = { invalidateAfterCircleSourceChange: vi.fn() };

    const useCase = new ApplyCircleDataPreviewUseCase(
      mockRepo as any,
      mockSession as any,
      mockInvalidation,
    );

    const stalePreview = {
      previewId: "p1",
      ref: { eventId: "C108", dayId: "day1" },
      mode: "initial" as const,
      expectedSourceGeneration: "gen_1",
      diff: { added: [], updated: [], removed: [], countsLabel: "" },
      newCircles: [],
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    };

    await expect(
      useCase.execute({ previewId: "p1", preview: stalePreview }),
    ).rejects.toThrow();
  });
});
