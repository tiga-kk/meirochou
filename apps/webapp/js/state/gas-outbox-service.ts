import {
  type GasApiClient,
  GasResponseError,
  GasTransportError,
} from "../api/gas-api-client";
import { parseDayId, parseEventId } from "../types/boundary-parsers";
import type {
  AppendedOutboxState,
  EventDayRef,
  GasOutboxEntry,
  GasOutboxResult,
  LocalEventDayState,
} from "../types/domain";
import type { EventDayRepository } from "./event-day-repository";

export interface GasOutboxServiceOptions {
  readonly createId?: () => string;
}

function redactErrorCategory(err: unknown): string {
  if (err instanceof GasTransportError) {
    if (err.status !== null && err.status !== undefined) {
      return `http-${err.status}`;
    }
    if (
      err.message.toLowerCase().includes("timeout") ||
      err.message.toLowerCase().includes("timed out")
    ) {
      return "timeout";
    }
    return "network";
  }
  if (err instanceof GasResponseError) {
    return "server-contract";
  }
  if (err instanceof Error) {
    if (
      err.name === "AbortError" ||
      err.message.toLowerCase().includes("timeout") ||
      err.message.toLowerCase().includes("timed out")
    ) {
      return "timeout";
    }
  }
  return "unknown";
}

function makeRefKey(ref: EventDayRef): string {
  return `${ref.eventId}:${ref.dayId}`;
}

export class GasOutboxService {
  private readonly repository: EventDayRepository;
  private readonly client: GasApiClient;
  private readonly createId: () => string;
  private readonly inFlight = new Map<string, Promise<GasOutboxResult>>();
  private readonly processingEntryIds = new Map<string, string>();

  constructor(
    repository: EventDayRepository,
    client: GasApiClient,
    options?: GasOutboxServiceOptions,
  ) {
    this.repository = repository;
    this.client = client;
    this.createId =
      options?.createId ??
      (() =>
        `outbox_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  }

  append(
    state: LocalEventDayState,
    ref: EventDayRef,
    space: string,
    purchased: boolean,
    now: string,
  ): AppendedOutboxState {
    const validEventId = parseEventId(ref.eventId);
    const validDayId = parseDayId(ref.dayId);

    if (state.source.type !== "gas") {
      throw new Error("Cannot append outbox entry for non-GAS data source");
    }

    for (const entry of state.gasOutbox) {
      if (entry.eventId !== validEventId || entry.dayId !== validDayId) {
        throw new Error("Ref does not match existing outbox entries");
      }
    }

    const trimmedSpace = space.trim();
    if (!trimmedSpace) {
      throw new Error("Space must be a non-empty string");
    }

    const gasUrl = state.source.gasUrl;
    const sheetName = state.source.sheetName;
    const sourceGeneration = state.sourceGeneration;

    const tailIndex = state.gasOutbox.length - 1;
    const tail = tailIndex >= 0 ? state.gasOutbox[tailIndex] : null;
    const processingEntryId = this.processingEntryIds.get(
      makeRefKey({ eventId: validEventId, dayId: validDayId }),
    );

    if (
      tail &&
      tail.id !== processingEntryId &&
      tail.attempts === 0 &&
      tail.eventId === validEventId &&
      tail.dayId === validDayId &&
      tail.sourceGeneration === sourceGeneration &&
      tail.gasUrl === gasUrl &&
      tail.sheetName === sheetName &&
      tail.space === trimmedSpace
    ) {
      const coalescedEntry: GasOutboxEntry = {
        ...tail,
        purchased,
      };

      const updatedOutbox = [...state.gasOutbox];
      updatedOutbox[tailIndex] = coalescedEntry;

      const nextState: LocalEventDayState = {
        ...state,
        gasOutbox: updatedOutbox,
        timestamps: {
          ...state.timestamps,
          updatedAt: now,
        },
      };

      return { state: nextState, entry: coalescedEntry };
    }

    const id = this.createId();
    if (!id || state.gasOutbox.some((entry) => entry.id === id)) {
      throw new Error("Outbox entry ID must be unique and non-empty");
    }

    const newEntry: GasOutboxEntry = {
      id,
      eventId: validEventId,
      dayId: validDayId,
      sourceGeneration,
      gasUrl,
      sheetName,
      space: trimmedSpace,
      purchased,
      createdAt: now,
      attempts: 0,
      lastError: null,
    };

    const nextState: LocalEventDayState = {
      ...state,
      gasOutbox: [...state.gasOutbox, newEntry],
      timestamps: {
        ...state.timestamps,
        updatedAt: now,
      },
    };

    return { state: nextState, entry: newEntry };
  }

  process(ref: EventDayRef): Promise<GasOutboxResult> {
    const validRef = {
      eventId: parseEventId(ref.eventId),
      dayId: parseDayId(ref.dayId),
    };
    const key = makeRefKey(validRef);
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const promise = this.executeProcess(validRef).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private async executeProcess(ref: EventDayRef): Promise<GasOutboxResult> {
    let sentCount = 0;
    let lastError: Error | null = null;

    while (true) {
      const currentState = this.repository.load(ref);
      if (!currentState || currentState.gasOutbox.length === 0) {
        break;
      }

      const targetEntry = currentState.gasOutbox[0];
      if (
        targetEntry.eventId !== ref.eventId ||
        targetEntry.dayId !== ref.dayId
      ) {
        throw new Error("Outbox entry ref does not match process ref");
      }
      const refKey = makeRefKey(ref);
      this.processingEntryIds.set(refKey, targetEntry.id);
      try {
        try {
          await this.client.sendSaleUpdate(targetEntry.gasUrl, {
            action: "sale",
            sheetName: targetEntry.sheetName,
            space: targetEntry.space,
            undo: !targetEntry.purchased,
          });
        } catch (err: unknown) {
          const category = redactErrorCategory(err);
          lastError = new Error(category);

          const latestState = this.repository.load(ref);
          if (!latestState) {
            throw new Error("Outbox state missing while recording failure");
          }
          const nextOutbox = latestState.gasOutbox.map((entry) => {
            if (entry.id === targetEntry.id) {
              return {
                ...entry,
                attempts: entry.attempts + 1,
                lastError: category,
              };
            }
            return entry;
          });

          this.repository.save(ref, {
            ...latestState,
            gasOutbox: nextOutbox,
          });
          break;
        }

        const latestState = this.repository.load(ref);
        if (!latestState) {
          throw new Error("Outbox state missing after successful send");
        }
        if (
          !latestState.gasOutbox.some((entry) => entry.id === targetEntry.id)
        ) {
          throw new Error("Outbox entry missing after successful send");
        }
        const nextOutbox = latestState.gasOutbox.filter(
          (entry) => entry.id !== targetEntry.id,
        );
        this.repository.save(ref, {
          ...latestState,
          gasOutbox: nextOutbox,
        });
        sentCount++;
      } finally {
        if (this.processingEntryIds.get(refKey) === targetEntry.id) {
          this.processingEntryIds.delete(refKey);
        }
      }
    }

    const finalState = this.repository.load(ref);
    const remainingPending = finalState ? finalState.gasOutbox.length : 0;

    return {
      sent: sentCount,
      pending: remainingPending,
      error: lastError,
    };
  }

  list(ref: EventDayRef): readonly GasOutboxEntry[] {
    const state = this.repository.load(ref);
    return state ? state.gasOutbox : [];
  }

  pendingCount(ref: EventDayRef): number {
    return this.list(ref).length;
  }

  discard(
    ref: EventDayRef,
    ids: readonly string[],
    now: string,
  ): LocalEventDayState {
    if (ids.length === 0) {
      const state = this.repository.load(ref);
      if (!state) {
        throw new Error("No state found for ref");
      }
      return state;
    }

    const state = this.repository.load(ref);
    if (!state) {
      throw new Error("No state found for ref");
    }

    const requestedSet = new Set(ids);
    if (requestedSet.size !== ids.length) {
      throw new Error("Duplicate IDs in discard request");
    }

    const existingIds = new Set(state.gasOutbox.map((entry) => entry.id));
    for (const id of ids) {
      if (!existingIds.has(id)) {
        throw new Error(`Outbox entry '${id}' not found`);
      }
    }

    const nextOutbox = state.gasOutbox.filter(
      (entry) => !requestedSet.has(entry.id),
    );

    const nextState: LocalEventDayState = {
      ...state,
      gasOutbox: nextOutbox,
      timestamps: {
        ...state.timestamps,
        updatedAt: now,
      },
    };

    this.repository.save(ref, nextState);
    return nextState;
  }
}
