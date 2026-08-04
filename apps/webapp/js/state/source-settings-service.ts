import type {
  EventDayRef,
  LocalEventDayState,
  ProtectedSourceOperation,
} from "../features/event-day/domain/application-contract-types";
import type { EventDayRepository } from "../features/event-day/use-cases/event-day-repository";
import { parseLocalEventDayState } from "./storage-schema";

export class PendingOutboxError extends Error {
  readonly operation: ProtectedSourceOperation;
  readonly pendingCount: number;
  readonly entryIds: readonly string[];

  constructor(
    operation: ProtectedSourceOperation,
    pendingCount: number,
    entryIds: readonly string[],
  ) {
    super(
      `Operation '${operation}' is blocked by ${pendingCount} pending outbox entries`,
    );
    this.name = "PendingOutboxError";
    this.operation = operation;
    this.pendingCount = pendingCount;
    this.entryIds = Object.freeze([...entryIds]);
    Object.setPrototypeOf(this, PendingOutboxError.prototype);
  }
}

export class StaleSourceStateError extends Error {
  constructor(message = "Stale source generation or missing state") {
    super(message);
    this.name = "StaleSourceStateError";
    Object.setPrototypeOf(this, StaleSourceStateError.prototype);
  }
}

export interface GuardedStateUpdate {
  readonly ref: EventDayRef;
  readonly operation: ProtectedSourceOperation;
  readonly expectedSourceGeneration: string;
  readonly nextState: LocalEventDayState;
}

const REPLACEMENT_OPERATIONS: readonly ProtectedSourceOperation[] = [
  "csv-replacement",
  "gas-initial-import",
  "gas-url-change",
  "sheet-name-change",
  "source-type-change",
  "circles-delete",
];

function isReplacementOperation(operation: ProtectedSourceOperation): boolean {
  return REPLACEMENT_OPERATIONS.includes(operation);
}

function sameSource(
  left: LocalEventDayState["source"],
  right: LocalEventDayState["source"],
): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "csv" && right.type === "csv") {
    return left.fileName === right.fileName;
  }
  if (left.type === "gas" && right.type === "gas") {
    return left.gasUrl === right.gasUrl && left.sheetName === right.sheetName;
  }
  return false;
}

function assertNewSourceApplyTimestamps(
  current: LocalEventDayState,
  nextState: LocalEventDayState,
): void {
  const currentTimestamp = Math.max(
    Date.parse(current.timestamps.updatedAt),
    Date.parse(current.timestamps.sourceUpdatedAt),
  );
  const nextUpdatedAt = Date.parse(nextState.timestamps.updatedAt);
  const nextSourceUpdatedAt = Date.parse(nextState.timestamps.sourceUpdatedAt);
  if (
    !Number.isFinite(nextUpdatedAt) ||
    !Number.isFinite(nextSourceUpdatedAt) ||
    nextUpdatedAt <= currentTimestamp ||
    nextSourceUpdatedAt <= currentTimestamp
  ) {
    throw new Error(
      "Source apply timestamps.updatedAt and sourceUpdatedAt must be new and later than the current state",
    );
  }
}

function isEmptyGasImportSentinel(state: LocalEventDayState): boolean {
  return (
    state.source.type === "csv" &&
    state.source.fileName === "empty.csv" &&
    state.circles.length === 0 &&
    Object.keys(state.circleStates).length === 0 &&
    state.gasOutbox.length === 0
  );
}

export class SourceSettingsService {
  constructor(private readonly repository: EventDayRepository) {}

  private requireCurrent(ref: EventDayRef): LocalEventDayState {
    const current = this.repository.load(ref);
    if (!current) {
      throw new StaleSourceStateError("No state found for ref");
    }
    return current;
  }

  private assertNoPending(
    current: LocalEventDayState,
    operation: ProtectedSourceOperation,
  ): void {
    if (current.gasOutbox.length === 0) return;
    throw new PendingOutboxError(
      operation,
      current.gasOutbox.length,
      current.gasOutbox.map((entry) => entry.id),
    );
  }

  private assertExpectedGeneration(
    current: LocalEventDayState,
    expectedSourceGeneration: string,
  ): void {
    if (current.sourceGeneration !== expectedSourceGeneration) {
      throw new StaleSourceStateError(
        `Source generation mismatch: expected '${expectedSourceGeneration}', got '${current.sourceGeneration}'`,
      );
    }
  }

  assertCanMutate(
    ref: EventDayRef,
    operation: ProtectedSourceOperation,
  ): LocalEventDayState {
    const current = this.requireCurrent(ref);
    this.assertNoPending(current, operation);
    return current;
  }

  saveGuarded(update: GuardedStateUpdate): LocalEventDayState {
    const current = this.requireCurrent(update.ref);
    this.assertExpectedGeneration(current, update.expectedSourceGeneration);
    this.assertNoPending(current, update.operation);

    const isReplacement = isReplacementOperation(update.operation);
    const isInitialImport = update.operation === "gas-initial-import";
    if (isInitialImport && !isEmptyGasImportSentinel(current)) {
      throw new Error("Initial GAS import requires an empty sentinel state");
    }
    if (
      update.operation === "gas-refresh-apply" &&
      current.source.type !== "gas"
    ) {
      throw new Error("GAS refresh requires a GAS source");
    }

    if (
      isReplacement &&
      update.nextState.sourceGeneration === current.sourceGeneration
    ) {
      throw new Error(
        `Operation '${update.operation}' requires a new sourceGeneration`,
      );
    }

    if (
      !isReplacement &&
      update.nextState.sourceGeneration !== current.sourceGeneration
    ) {
      throw new Error(
        `Operation '${update.operation}' must preserve current sourceGeneration`,
      );
    }

    if (!isReplacement && update.operation !== "gas-refresh-apply") {
      if (!sameSource(current.source, update.nextState.source)) {
        throw new Error(
          `Operation '${update.operation}' must preserve the current source`,
        );
      }
    }

    if (isReplacement || update.operation === "gas-refresh-apply") {
      assertNewSourceApplyTimestamps(current, update.nextState);
    }

    let finalNextState: LocalEventDayState;

    if (isReplacement) {
      // Source replacement preserves local activity and starts with empty outbox.
      // The empty GAS sentinel is the one replacement that may derive initial
      // purchase entries from the fetched source in the same save.
      finalNextState = {
        ...update.nextState,
        circleStates: isInitialImport
          ? update.nextState.circleStates
          : current.circleStates,
        gasOutbox: [],
        timestamps: {
          ...update.nextState.timestamps,
          createdAt: current.timestamps.createdAt,
        },
      };
    } else if (update.operation === "gas-refresh-apply") {
      // Refresh preserves source, generation, activity, and outbox, updating only circles & timestamps
      finalNextState = {
        ...update.nextState,
        source: current.source,
        sourceGeneration: current.sourceGeneration,
        circleStates: current.circleStates,
        gasOutbox: current.gasOutbox,
        timestamps: {
          ...update.nextState.timestamps,
          createdAt: current.timestamps.createdAt,
        },
      };
    } else {
      finalNextState = {
        ...update.nextState,
        timestamps: {
          ...update.nextState.timestamps,
          createdAt: current.timestamps.createdAt,
        },
      };
    }

    // Validate schema before the final state re-check and save.
    parseLocalEventDayState(finalNextState);

    // The lock must be checked again immediately before the repository write.
    const latest = this.requireCurrent(update.ref);
    this.assertExpectedGeneration(latest, update.expectedSourceGeneration);
    this.assertNoPending(latest, update.operation);

    this.repository.save(update.ref, finalNextState);
    return finalNextState;
  }

  deleteEventDay(ref: EventDayRef, expectedSourceGeneration: string): void {
    const current = this.requireCurrent(ref);
    this.assertExpectedGeneration(current, expectedSourceGeneration);
    this.assertNoPending(current, "event-day-delete");

    const latest = this.requireCurrent(ref);
    this.assertExpectedGeneration(latest, expectedSourceGeneration);
    this.assertNoPending(latest, "event-day-delete");
    this.repository.deleteEventDay(ref);
  }
}
