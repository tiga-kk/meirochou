import type {
  EventDayRef,
  LocalEventDayState,
} from "../../event-day/public-api";

export type CircleStatus = "pending" | "held" | "purchased" | "excluded";

export interface ChangeCircleStatusInput {
  readonly eventDay: EventDayRef;
  readonly circleSpace: string;
  readonly nextStatus: CircleStatus;
  readonly expectedSourceGeneration: string;
  readonly changedAt: string;
}

export interface CircleStatusUndoToken {
  readonly undoId: string;
  readonly eventDay: EventDayRef;
  readonly circleSpace: string;
  readonly previousStatus: CircleStatus;
  readonly currentStatus: CircleStatus;
  readonly expectedSourceGeneration: string;
  readonly createdAt: string;
}

export interface ChangeCircleStatusResult {
  readonly state: LocalEventDayState;
  readonly previousStatus: CircleStatus;
  readonly currentStatus: CircleStatus;
  readonly undoToken: CircleStatusUndoToken | null;
  readonly pendingGasUpdateId: string | null;
}
