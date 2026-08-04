import { describe, expect, it, vi } from "vitest";
import { SendPendingGasUpdatesUseCase } from "../apps/webapp/js/features/circle-status/use-cases/send-pending-gas-updates";
import type {
  ActiveEventDaySession,
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import { createEmptyEventDayState } from "../apps/webapp/js/state/storage-schema";

const REF: EventDayRef = { eventId: "c108", dayId: "day1" };
const NOW = "2026-08-04T00:00:00.000Z";

describe("SendPendingGasUpdatesUseCase", () => {
  it("sends pending GAS update, removes it from outbox on success, and updates active session", async () => {
    const initialState = createEmptyEventDayState(
      { type: "gas", gasUrl: "https://example.test/gas", sheetName: "demo" },
      "gen-1",
      NOW,
    );
    const stateWithOutbox: LocalEventDayState = {
      ...initialState,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: "c108",
          dayId: "day1",
          sourceGeneration: "gen-1",
          gasUrl: "https://example.test/gas",
          sheetName: "demo",
          space: "A01",
          purchased: true,
          createdAt: NOW,
          attempts: 0,
          lastError: null,
        },
      ],
    };

    let currentState = stateWithOutbox;
    const repository: EventDayRepository = {
      listEventDays: () => [REF],
      load: () => currentState,
      save: (_ref: EventDayRef, next: LocalEventDayState) => {
        currentState = next;
      },
    };

    let sessionState: LocalEventDayState | null = null;
    const activeEventDaySession: ActiveEventDaySession = {
      getActiveEventDay: () => ({ ref: REF, state: currentState }),
      replaceActiveEventDayState: (_nextState: LocalEventDayState) => {
        sessionState = _nextState;
      },
    };

    const delivery = {
      deliver: vi.fn(async () => {}),
    };

    const useCase = new SendPendingGasUpdatesUseCase(
      repository,
      activeEventDaySession,
      delivery,
    );

    const result = await useCase.execute({ eventDay: REF });

    expect(result.processedCount).toBe(1);
    expect(delivery.deliver).toHaveBeenCalledOnce();
    expect(currentState.gasOutbox).toHaveLength(0);
    expect(sessionState).toBe(currentState);
  });

  it("stores a safe error category and never the transport message", async () => {
    const state = createEmptyEventDayState(
      { type: "gas", gasUrl: "https://example.test/gas", sheetName: "demo" },
      "gen-1",
      NOW,
    );
    const currentState: LocalEventDayState = {
      ...state,
      gasOutbox: [
        {
          id: "entry-1",
          eventId: REF.eventId,
          dayId: REF.dayId,
          sourceGeneration: state.sourceGeneration,
          gasUrl: "https://example.test/gas",
          sheetName: "demo",
          space: "A01",
          purchased: true,
          createdAt: NOW,
          attempts: 0,
          lastError: null,
        },
      ],
    };
    let saved = currentState;
    const repository: EventDayRepository = {
      listEventDays: () => [REF],
      load: () => saved,
      save: (_ref, next) => {
        saved = next;
      },
    };
    const session: ActiveEventDaySession = {
      getActiveEventDay: () => null,
      replaceActiveEventDayState: () => {},
      setActiveEventDay: () => {},
      clearActiveEventDay: () => {},
      subscribe: () => () => {},
    };
    const delivery = {
      deliver: async () => {
        throw new Error("raw response body with credential");
      },
    };
    const useCase = new SendPendingGasUpdatesUseCase(
      repository,
      session,
      delivery,
    );

    await useCase.execute({ eventDay: REF });

    expect(saved.gasOutbox[0].attempts).toBe(1);
    expect(saved.gasOutbox[0].lastError).toBe("unknown");
  });
});
