// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import {
  ApplyCircleDataPreviewUseCase,
  ExportCirclesToCsvUseCase,
  PreviewCsvImportUseCase,
  serializeCircleCsv,
} from "../apps/webapp/js/features/circle-data-source/public-api";
import type {
  EventDayRef,
  EventRegistry,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import { LocalStorageEventDayRepository } from "../apps/webapp/js/features/event-day/infrastructure/local-storage-event-day-repository";
import { createActiveEventDaySession } from "../apps/webapp/js/features/event-day/public-api";
import { SwitchEventDayUseCase } from "../apps/webapp/js/features/event-day/use-cases/switch-event-day";
import { CircleStatusController } from "../apps/webapp/js/features/circle-status/ui/circle-status-controller";
import { ChangeCircleStatusUseCase } from "../apps/webapp/js/features/circle-status/use-cases/change-circle-status";
import { UndoCircleStatusChangeUseCase } from "../apps/webapp/js/features/circle-status/use-cases/undo-circle-status-change";
import { getCircleVisitState } from "../apps/webapp/js/state/storage-schema";
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

const REGISTRY: EventRegistry = {
  schemaVersion: 1,
  events: [
    {
      eventId: "C108",
      displayName: "Comiket 108",
      mapBundle: "../maps/demo-v1/manifest.json",
      days: [
        { dayId: "day1", displayName: "1日目" },
        { dayId: "day2", displayName: "2日目" },
      ],
    },
  ],
};
const REGISTRY_URL = "https://example.test/assets/events/manifest.json";
const MANIFEST = {
  schemaVersion: 1 as const,
  eventId: "C108",
  displayName: "Comiket 108",
  areas: [],
};
const NOW = "2026-07-21T07:45:00.000Z";
const csv = (rows: string) =>
  `space,priority,isSale,account,tweet,memo\r\n${rows}`;

function createFixture(adapter = new MockStorageAdapter()) {
  const storage = new StorageService(adapter);
  const repository = new LocalStorageEventDayRepository(storage);
  const session = createActiveEventDaySession();
  const backgroundProcess = { requestSend: vi.fn() };
  const changeStatus = new ChangeCircleStatusUseCase(
    repository,
    session,
    backgroundProcess,
    { createPendingGasUpdateId: () => "pending-1", createUndoId: () => "undo-1" },
  );
  const statusController = new CircleStatusController(
    changeStatus,
    new UndoCircleStatusChangeUseCase(repository, session),
  );
  const switchEventDay = new SwitchEventDayUseCase({
    repository,
    registry: REGISTRY,
    registryUrl: REGISTRY_URL,
    currentManifest: MANIFEST,
    loadManifest: async () => MANIFEST,
    collaborators: {
      afterSwitch: async (ref) => {
        const state = repository.load(ref);
        if (state) session.setActiveEventDay(ref, state);
      },
    },
  });
  let now = new Date(NOW);
  let generation = 0;
  const previewCsv = new PreviewCsvImportUseCase(repository, {
    now: () => now.toISOString(),
    createPreviewId: () => `preview-${++generation}`,
    previewTtlMs: 1_000,
  });
  const applyCsv = new ApplyCircleDataPreviewUseCase(
    repository,
    session,
    { invalidateAfterCircleSourceChange: vi.fn() },
    {
      now: () => now.toISOString(),
      createSourceGeneration: () => `generation-${++generation}`,
    },
  );
  const open = (ref: EventDayRef) => switchEventDay.execute(ref);
  const applyPreview = async (ref: EventDayRef, fileName: string, text: string) => {
    const preview = previewCsv.execute({ eventDay: ref, fileName, text });
    const state = await applyCsv.execute({ previewId: preview.previewId, preview });
    return { preview, state };
  };
  return {
    adapter,
    repository,
    session,
    statusController,
    backgroundProcess,
    open,
    previewCsv,
    applyCsv,
    applyPreview,
    advanceTime: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe("event-day feature composition", () => {
  test("switching commits the repository and active session together", async () => {
    const fixture = createFixture();
    await fixture.open({ eventId: "C108", dayId: "day1" });
    await fixture.open({ eventId: "C108", dayId: "day2" });

    expect(fixture.repository.getLastOpenedEventDay()).toEqual({
      eventId: "C108",
      dayId: "day2",
    });
    expect(fixture.session.getActiveEventDay()).toMatchObject({
      ref: { eventId: "C108", dayId: "day2" },
      state: { source: { type: "csv", fileName: "empty.csv" } },
    });
  });

  test("rejects an unregistered event/day without changing durable state", async () => {
    const fixture = createFixture();
    await expect(fixture.open({ eventId: "C108", dayId: "day3" })).rejects.toThrow(
      "Event/Day not found in registry",
    );
    expect(fixture.repository.getLastOpenedEventDay()).toBeNull();
  });

  test("CSV source replacement preserves purchased status and rejects stale previews", async () => {
    const fixture = createFixture();
    const ref = { eventId: "C108", dayId: "day1" };
    await fixture.open(ref);
    await fixture.applyPreview(ref, "day1.csv", csv("A-01,1,,,,\r\n"));
    const current = fixture.repository.load(ref)!;
    fixture.statusController.changeStatus({
      eventDay: ref,
      circleSpace: "A-01",
      nextStatus: "purchased",
      expectedSourceGeneration: current.sourceGeneration,
    });

    const stale = fixture.previewCsv.execute({
      eventDay: ref,
      fileName: "stale.csv",
      text: csv("A-01,1,,,,\r\nB-01,1,,,,\r\n"),
    });
    await fixture.applyPreview(ref, "fresh.csv", csv("A-01,2,,,,\r\n"));
    await expect(
      fixture.applyCsv.execute({ previewId: stale.previewId, preview: stale }),
    ).rejects.toThrow("CSV preview source generation is stale");
    expect(getCircleVisitState(fixture.repository.load(ref)!.circleStates, "A-01")).toBe(
      "purchased",
    );
  });

  test("expired and pending-outbox previews do not mutate source state", async () => {
    const fixture = createFixture();
    const ref = { eventId: "C108", dayId: "day1" };
    await fixture.open(ref);
    await fixture.applyPreview(ref, "day1.csv", csv("A-01,1,,,,\r\n"));
    const preview = fixture.previewCsv.execute({
      eventDay: ref,
      fileName: "replacement.csv",
      text: csv("A-01,2,,,,\r\n"),
    });
    fixture.advanceTime(1_001);
    await expect(
      fixture.applyCsv.execute({ previewId: preview.previewId, preview }),
    ).rejects.toThrow("CSV preview has expired");

    const current = fixture.repository.load(ref)!;
    fixture.repository.save(ref, {
      ...current,
      gasOutbox: [
        {
          id: "pending-1",
          eventId: ref.eventId,
          dayId: ref.dayId,
          sourceGeneration: current.sourceGeneration,
          gasUrl: "https://example.test/gas",
          sheetName: "Day1",
          space: "A-01",
          purchased: true,
          createdAt: NOW,
          attempts: 0,
          lastError: null,
        },
      ],
    });
    const blocked = fixture.previewCsv.execute({
      eventDay: ref,
      fileName: "blocked.csv",
      text: csv("A-01,3,,,,\r\n"),
    });
    await expect(
      fixture.applyCsv.execute({ previewId: blocked.previewId, preview: blocked }),
    ).rejects.toThrow("blocked by 1 pending outbox entries");
  });

  test("circle status is local-first and emits an outbox entry only for GAS data", async () => {
    const fixture = createFixture();
    const ref = { eventId: "C108", dayId: "day1" };
    await fixture.open(ref);
    await fixture.applyPreview(ref, "day1.csv", csv("A-01,1,,,,\r\n"));
    let state = fixture.repository.load(ref)!;
    fixture.statusController.changeStatus({
      eventDay: ref,
      circleSpace: "A-01",
      nextStatus: "purchased",
      expectedSourceGeneration: state.sourceGeneration,
    });
    expect(fixture.repository.load(ref)!.gasOutbox).toHaveLength(0);

    state = {
      ...fixture.repository.load(ref)!,
      source: { type: "gas", gasUrl: "https://example.test/gas", sheetName: "Day1" },
      sourceGeneration: "gas-generation",
    };
    fixture.repository.save(ref, state);
    fixture.session.setActiveEventDay(ref, state);
    fixture.statusController.changeStatus({
      eventDay: ref,
      circleSpace: "A-01",
      nextStatus: "held",
      expectedSourceGeneration: state.sourceGeneration,
    });
    expect(fixture.repository.load(ref)!.gasOutbox).toHaveLength(1);
    expect(fixture.backgroundProcess.requestSend).toHaveBeenCalled();
  });

  test("CSV export excludes removed circles and derives sale from circle state", async () => {
    const fixture = createFixture();
    const ref = { eventId: "C108", dayId: "day1" };
    await fixture.open(ref);
    const state: LocalEventDayState = {
      ...fixture.repository.load(ref)!,
      circles: [
        { space: "東A-01a", priority: 1, account: "@admin", memo: "=SUM(A1)" },
        { space: "東A-02b", priority: 2, memo: "+123" },
        { space: "東A-03c", priority: 3, removedFromSource: true },
      ],
      circleStates: { "東A-01a": "purchased" },
    };
    fixture.repository.save(ref, state);
    const result = { text: "" };
    new ExportCirclesToCsvUseCase(fixture.repository, {
      downloadCirclesAsCsv: (_filename, circles, purchased) => {
        result.text = serializeCircleCsv(circles, purchased);
      },
    }).execute({ eventDay: ref });

    expect(result.text).not.toContain("東A-03c");
    expect(result.text).toContain("東A-01a,1,x,@admin,,=SUM(A1)");
    expect(result.text).toContain("東A-02b,2,,,,+123");
  });

  test("repository failure does not update the active session", async () => {
    const fixture = createFixture();
    const ref = { eventId: "C108", dayId: "day1" };
    await fixture.open(ref);
    await fixture.applyPreview(ref, "day1.csv", csv("A-01,1,,,,\r\n"));
    fixture.adapter.failWrites = true;
    const before = fixture.session.getActiveEventDay();

    expect(() =>
      fixture.statusController.changeStatus({
        eventDay: ref,
        circleSpace: "A-01",
        nextStatus: "purchased",
        expectedSourceGeneration: before!.state.sourceGeneration,
      }),
    ).toThrow("Failed to save event day state");
    expect(fixture.session.getActiveEventDay()).toEqual(before);
  });
});
