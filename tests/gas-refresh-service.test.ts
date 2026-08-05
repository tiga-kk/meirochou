import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApplyCircleDataPreviewUseCase,
  CancelCircleDataPreviewUseCase,
  createCircleDataSourceSession,
  LoadGoogleSheetNamesUseCase,
  PreviewGoogleSheetImportUseCase,
  type GoogleSheetCircleClient,
} from "../apps/webapp/js/features/circle-data-source/public-api";
import {
  createActiveEventDaySession,
  type ActiveEventDaySession,
  type CircleRecord,
  type EventDayRef,
  type EventDayRepository,
  type LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";

class InMemoryEventDayRepository implements EventDayRepository {
  private states = new Map<string, LocalEventDayState>();
  private lastOpened: EventDayRef | null = null;

  private key(ref: EventDayRef): string {
    return `${ref.eventId}:${ref.dayId}`;
  }

  load(ref: EventDayRef): LocalEventDayState | null {
    return this.states.get(this.key(ref)) ?? null;
  }

  save(ref: EventDayRef, state: LocalEventDayState): void {
    this.states.set(this.key(ref), state);
  }

  saveAndRememberLastOpened(ref: EventDayRef, state: LocalEventDayState): void {
    this.save(ref, state);
    this.lastOpened = ref;
  }

  rememberLastOpenedEventDay(ref: EventDayRef): void {
    this.lastOpened = ref;
  }

  loadLastOpenedEventDay(): EventDayRef | null {
    return this.lastOpened;
  }

  listEventDays(): EventDayRef[] {
    return Array.from(this.states.keys()).map((k) => {
      const [eventId, dayId] = k.split(":");
      return { eventId, dayId };
    });
  }

  deleteEventDay(ref: EventDayRef): void {
    this.states.delete(this.key(ref));
  }
}

class MockGoogleSheetClient implements GoogleSheetCircleClient {
  startLoadingSheetNamesFn = vi.fn<[string], { result: Promise<readonly string[]>; cancel: () => void }>();
  startLoadingCirclesFn = vi.fn<
    [{ type: "gas"; gasUrl: string; sheetName: string }],
    { result: Promise<readonly CircleRecord[]>; cancel: () => void }
  >();

  startLoadingSheetNames(webAppUrl: string) {
    return this.startLoadingSheetNamesFn(webAppUrl);
  }

  startLoadingCircles(source: { type: "gas"; gasUrl: string; sheetName: string }) {
    return this.startLoadingCirclesFn(source);
  }
}

describe("Google Sheet Data Source Use Cases (GAS Refresh)", () => {
  let repository: InMemoryEventDayRepository;
  let client: MockGoogleSheetClient;
  let session: ActiveEventDaySession;

  beforeEach(() => {
    repository = new InMemoryEventDayRepository();
    client = new MockGoogleSheetClient();
    session = createActiveEventDaySession();
  });

  it("loads sheet names via LoadGoogleSheetNamesUseCase", async () => {
    client.startLoadingSheetNamesFn.mockReturnValue({
      result: Promise.resolve(["Day1", "Day2", "Day3"]),
      cancel: vi.fn(),
    });
    const dsSession = createCircleDataSourceSession();
    const useCase = new LoadGoogleSheetNamesUseCase(client, dsSession);

    const req = useCase.start({ webAppUrl: "https://script.google.com/macros/s/test/exec" });
    const names = await req.result;

    expect(names).toEqual(["Day1", "Day2", "Day3"]);
    expect(client.startLoadingSheetNamesFn).toHaveBeenCalledWith(
      "https://script.google.com/macros/s/test/exec",
    );
  });

  it("previews Google Sheet import with circle diff calculation", async () => {
    const ref: EventDayRef = { eventId: "c104", dayId: "day1" };
    const initialState: LocalEventDayState = {
      schemaVersion: 2,
      source: { type: "csv", fileName: "initial.csv" },
      sourceGeneration: "gen-1",
      circles: [{ space: "東A01a", priority: 1 }],
      circleStates: { 東A01a: "purchased" },
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
      },
    };
    repository.save(ref, initialState);
    session.setActiveEventDay(ref, initialState);

    client.startLoadingCirclesFn.mockReturnValue({
      result: Promise.resolve([
        { space: "東A01a", priority: 2 },
        { space: "東A02b", priority: 1 },
      ]),
      cancel: vi.fn(),
    });

    const previewUseCase = new PreviewGoogleSheetImportUseCase(repository, client);
    const req = previewUseCase.start({
      eventDay: ref,
      source: {
        type: "gas",
        gasUrl: "https://script.google.com/macros/s/test/exec",
        sheetName: "Day1",
      },
    });

    const preview = await req.result;

    expect(preview.ref).toEqual(ref);
    expect(preview.diff.updated).toHaveLength(1);
    expect(preview.diff.added).toHaveLength(1);
  });

  it("applies Google Sheet preview and updates active event day state", async () => {
    const ref: EventDayRef = { eventId: "c104", dayId: "day1" };
    const initialState: LocalEventDayState = {
      schemaVersion: 2,
      source: { type: "csv", fileName: "initial.csv" },
      sourceGeneration: "gen-1",
      circles: [{ space: "東A01a", priority: 1 }],
      circleStates: { 東A01a: "purchased" },
      gasOutbox: [],
      timestamps: {
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
        sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
      },
    };
    repository.save(ref, initialState);
    session.setActiveEventDay(ref, initialState);

    client.startLoadingCirclesFn.mockReturnValue({
      result: Promise.resolve([
        { space: "東A01a", priority: 2 },
        { space: "東A02b", priority: 1 },
      ]),
      cancel: vi.fn(),
    });

    const routeInvalidation = { invalidateAfterCircleSourceChange: vi.fn() };
    const previewUseCase = new PreviewGoogleSheetImportUseCase(repository, client);
    const applyUseCase = new ApplyCircleDataPreviewUseCase(
      repository,
      session,
      routeInvalidation,
    );

    const req = previewUseCase.start({
      eventDay: ref,
      source: {
        type: "gas",
        gasUrl: "https://script.google.com/macros/s/test/exec",
        sheetName: "Day1",
      },
    });
    const preview = await req.result;

    const appliedState = await applyUseCase.execute({ previewId: preview.previewId, preview });

    expect(appliedState.circles).toHaveLength(2);
    expect(appliedState.circleStates["東A01a"]).toBe("purchased");
    expect(routeInvalidation.invalidateAfterCircleSourceChange).toHaveBeenCalled();
  });

  it("cancels Google Sheet preview via CancelCircleDataPreviewUseCase", () => {
    const cancelUseCase = new CancelCircleDataPreviewUseCase();
    expect(() => cancelUseCase.execute({
      previewId: "p1",
      ref: { eventId: "c104", dayId: "day1" },
      mode: "initial",
      expectedSourceGeneration: "gen-1",
      diff: { added: [], updated: [], removed: [], countsLabel: "" },
      newCircles: [],
      fetchedAt: "2026-08-05T00:00:00.000Z",
      expiresAt: "2026-08-05T01:00:00.000Z",
    })).not.toThrow();
  });
});
