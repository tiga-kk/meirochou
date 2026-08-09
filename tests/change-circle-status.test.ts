import { describe, expect, it, vi } from "vitest";
import { ChangeCircleStatusUseCase } from "../apps/webapp/js/features/circle-status/use-cases/change-circle-status";
import type {
  ActiveEventDaySession,
  EventDayRef,
  EventDayRepository,
  LocalEventDayState,
} from "../apps/webapp/js/features/event-day/public-api";
import { createEmptyEventDayState } from "../apps/webapp/js/state/storage-schema";

const REF: EventDayRef = { eventId: "c108", dayId: "day1" };
const NOW = "2026-08-04T00:00:00.000Z";

describe("ChangeCircleStatusUseCase", () => {
  it("persists status change and pending gas update atomically in one repository save", () => {
    const initialState = createEmptyEventDayState(
      { type: "gas", gasUrl: "https://example.test/gas", sheetName: "demo" },
      "gen-1",
      NOW,
    );
    const circleState: LocalEventDayState = {
      ...initialState,
      circles: [{ space: "A01" }],
    };

    let savedState: LocalEventDayState | null = null;
    const saveCalls: LocalEventDayState[] = [];

    const repository: EventDayRepository = {
      load: (_ref: EventDayRef) => circleState,
      save: (_ref: EventDayRef, nextState: LocalEventDayState) => {
        saveCalls.push(nextState);
        savedState = nextState;
      },
    };

    let sessionState: LocalEventDayState | null = null;
    const activeEventDaySession: ActiveEventDaySession = {
      getActiveEventDay: () => ({ ref: REF, state: circleState }),
      replaceActiveEventDayState: (nextState: LocalEventDayState) => {
        sessionState = nextState;
      },
      setActiveEventDay: () => {},
      clearActiveEventDay: () => {},
      subscribe: () => () => {},
    };

    const backgroundProcess = {
      requestSend: vi.fn(),
    };

    const useCase = new ChangeCircleStatusUseCase(
      repository,
      activeEventDaySession,
      backgroundProcess,
      { createPendingGasUpdateId: () => "pending-1" },
    );

    const result = useCase.execute({
      eventDay: REF,
      circleSpace: "A01",
      nextStatus: "purchased",
      expectedSourceGeneration: "gen-1",
      changedAt: NOW,
    });

    expect(saveCalls).toHaveLength(1);
    expect(savedState?.circleStates.A01).toBe("purchased");
    expect(savedState?.gasOutbox).toHaveLength(1);
    expect(savedState?.gasOutbox[0].space).toBe("A01");
    expect(savedState?.gasOutbox[0].purchased).toBe(true);
    expect(result.pendingGasUpdateId).toBe(savedState?.gasOutbox[0].id);
    expect(sessionState).toBe(savedState);
    expect(backgroundProcess.requestSend).toHaveBeenCalledOnce();
  });

  it("returns a single-use undo token with an injected clock and id", () => {
    const state = createEmptyEventDayState(
      { type: "csv", fileName: "demo.csv" },
      "gen-1",
      NOW,
    );
    const repository: EventDayRepository = {
      load: () => ({ ...state, circles: [{ space: "A01" }] }),
      save: () => {},
    };
    const session: ActiveEventDaySession = {
      getActiveEventDay: () => null,
      replaceActiveEventDayState: () => {},
      setActiveEventDay: () => {},
      clearActiveEventDay: () => {},
      subscribe: () => () => {},
    };
    const useCase = new ChangeCircleStatusUseCase(
      repository,
      session,
      undefined,
      {
        createUndoId: () => "undo-1",
        createPendingGasUpdateId: () => "pending-1",
      },
    );

    const result = useCase.execute({
      eventDay: REF,
      circleSpace: "A01",
      nextStatus: "held",
      expectedSourceGeneration: "gen-1",
      changedAt: NOW,
    });

    expect(result.undoToken).toMatchObject({
      undoId: "undo-1",
      previousStatus: "pending",
      currentStatus: "held",
      createdAt: NOW,
    });
  });
});
