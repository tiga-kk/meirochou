import type {
  EventDayRef,
  GasOutboxEntry,
  LocalEventDayState,
} from "../../event-day/public-api";
import type { CircleStatus } from "./circle-status-types";

export type PendingGasUpdateIdFactory = () => string;

export function appendPendingGasUpdate(
  state: LocalEventDayState,
  eventDay: EventDayRef,
  circleSpace: string,
  nextStatus: CircleStatus,
  changedAt: string,
  createId: PendingGasUpdateIdFactory,
): {
  readonly state: LocalEventDayState;
  readonly pendingGasUpdateId: string | null;
} {
  if (state.source.type !== "gas") {
    return { state, pendingGasUpdateId: null };
  }

  // Only purchase and purchase cancellation generate GAS outbox updates
  const isPurchase = nextStatus === "purchased";
  const id = createId();
  if (!id || state.gasOutbox.some((entry) => entry.id === id)) {
    throw new Error("Pending GAS update ID must be unique and non-empty");
  }
  const entry: GasOutboxEntry = {
    id,
    eventId: eventDay.eventId,
    dayId: eventDay.dayId,
    sourceGeneration: state.sourceGeneration,
    gasUrl: state.source.gasUrl,
    sheetName: state.source.sheetName,
    space: circleSpace,
    purchased: isPurchase,
    createdAt: changedAt,
    attempts: 0,
    lastError: null,
  };

  return {
    state: {
      ...state,
      gasOutbox: Object.freeze([...state.gasOutbox, entry]),
      timestamps: { ...state.timestamps, updatedAt: changedAt },
    },
    pendingGasUpdateId: entry.id,
  };
}
