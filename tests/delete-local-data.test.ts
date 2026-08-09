import { describe, expect, it, vi } from "vitest";
import type {
  EventDayRepository,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import { DeleteLocalDataUseCase } from "../apps/webapp/js/features/local-data-deletion/use-cases/delete-local-data";

const state: LocalEventDayState = {
  schemaVersion: 2,
  source: { type: "csv", fileName: "circles.csv" },
  sourceGeneration: "generation-1",
  circles: [{ space: "A01" }],
  circleStates: { A01: "purchased" },
  gasOutbox: [],
  timestamps: {
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    sourceUpdatedAt: "2026-08-04T00:00:00.000Z",
  },
};

describe("DeleteLocalDataUseCase", () => {
  it("resets activity while preserving circles and route matrices", async () => {
    let current: LocalEventDayState | null = state;
    const repository: EventDayRepository = {
      load: () => current,
      save: vi.fn((_ref, next) => {
        current = next;
      }),
      saveAndRememberLastOpened: vi.fn(),
      listEventDays: () => [],
      getLastOpenedEventDay: () => null,
      rememberLastOpenedEventDay: vi.fn(),
      deleteEventDay: vi.fn(),
      listEventDaysForDeletion: () => [],
      deleteAllEventDays: vi.fn(),
    };
    const routeGuidanceCleanup = {
      deleteActivitySnapshot: vi.fn(),
      deleteAllRouteData: vi.fn(),
    };
    const useCase = new DeleteLocalDataUseCase(
      repository,
      routeGuidanceCleanup,
      { now: () => "2026-08-04T01:00:00.000Z" },
    );

    await useCase.execute({
      kind: "activity",
      eventDay: { eventId: "c108", dayId: "day1" },
    });

    expect(current?.circles).toEqual([{ space: "A01" }]);
    expect(current?.circleStates).toEqual({});
    expect(routeGuidanceCleanup.deleteActivitySnapshot).toHaveBeenCalledOnce();
    expect(routeGuidanceCleanup.deleteAllRouteData).not.toHaveBeenCalled();
  });

  it("blocks destructive scopes when pending GAS updates exist", async () => {
    const pendingState = {
      ...state,
      gasOutbox: [{ id: "pending" }],
    } as LocalEventDayState;
    const repository: EventDayRepository = {
      load: () => pendingState,
      save: vi.fn(),
      saveAndRememberLastOpened: vi.fn(),
      listEventDays: () => [],
      getLastOpenedEventDay: () => null,
      rememberLastOpenedEventDay: vi.fn(),
      deleteEventDay: vi.fn(),
      listEventDaysForDeletion: () => [],
      deleteAllEventDays: vi.fn(),
    };
    const cleanup = {
      deleteActivitySnapshot: vi.fn(),
      deleteAllRouteData: vi.fn(),
    };
    const useCase = new DeleteLocalDataUseCase(repository, cleanup);

    await expect(
      useCase.execute({
        kind: "event-day",
        eventDay: { eventId: "c108", dayId: "day1" },
      }),
    ).rejects.toThrow("Pending GAS updates");
    expect(repository.deleteEventDay).not.toHaveBeenCalled();
  });
});
