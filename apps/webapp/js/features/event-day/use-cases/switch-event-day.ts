import type {
  EventDayRef,
  LocalEventDayState,
} from "../domain/event-day-types";
import type { EventDayRepository } from "./event-day-repository";

export interface SwitchEventDayInput {
  readonly eventId: string;
  readonly dayId: string;
}

export interface SwitchEventDayCollaborators {
  beforeSwitch?: (currentRef: EventDayRef) => Promise<void>;
  afterSwitch?: (newRef: EventDayRef) => Promise<void>;
  onSwitchFailure?: (requestedRef: EventDayRef, error: unknown) => void;
}

export interface SwitchEventDayOptions {
  readonly now?: () => string;
  readonly createSourceGeneration?: () => string;
}

export interface SwitchEventDayOperation {
  execute(input: SwitchEventDayInput): Promise<void>;
}

function parseRef(input: SwitchEventDayInput): EventDayRef {
  if (
    typeof input?.eventId !== "string" ||
    input.eventId.trim() === "" ||
    typeof input.dayId !== "string" ||
    input.dayId.trim() === ""
  ) {
    throw new Error("Invalid event/day selection");
  }
  return Object.freeze({ eventId: input.eventId, dayId: input.dayId });
}

function createEmptyState(
  now: string,
  sourceGeneration: string,
): LocalEventDayState {
  return {
    schemaVersion: 2,
    source: { type: "csv", fileName: "empty.csv" },
    sourceGeneration,
    circles: [],
    circleStates: {},
    gasOutbox: [],
    timestamps: { createdAt: now, updatedAt: now, sourceUpdatedAt: now },
  };
}

export class SwitchEventDayUseCase implements SwitchEventDayOperation {
  private switching = false;
  private readonly now: () => string;
  private readonly createSourceGeneration: () => string;

  constructor(
    private readonly repository: EventDayRepository,
    private readonly collaborators: SwitchEventDayCollaborators = {},
    options: SwitchEventDayOptions = {},
  ) {
    let generation = 0;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createSourceGeneration =
      options.createSourceGeneration ??
      (() => `event-day-${Date.now()}-${++generation}`);
  }

  async execute(input: SwitchEventDayInput): Promise<void> {
    const requestedRef = parseRef(input);
    if (this.switching)
      throw new Error("Event/day switch is already in progress");

    const currentRef = this.repository.getLastOpenedEventDay();
    if (
      currentRef &&
      currentRef.eventId === requestedRef.eventId &&
      currentRef.dayId === requestedRef.dayId
    ) {
      return;
    }

    this.switching = true;
    try {
      if (currentRef) await this.collaborators.beforeSwitch?.(currentRef);
      const state =
        this.repository.load(requestedRef) ??
        createEmptyState(this.now(), this.createSourceGeneration());

      // This repository method atomically persists the state and last-opened ref.
      this.repository.saveAndRememberLastOpened(requestedRef, state);
      await this.collaborators.afterSwitch?.(requestedRef);
    } catch (error: unknown) {
      this.collaborators.onSwitchFailure?.(requestedRef, error);
      throw error;
    } finally {
      this.switching = false;
    }
  }
}
