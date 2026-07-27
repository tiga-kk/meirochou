import { parseDayId, parseEventId } from "../types/boundary-parsers";
import type { EventDayRef, LocalEventDayState } from "../types/domain";
import { parseLocalEventDayState } from "./storage-schema";
import type { StorageService } from "./storage-service";

export type StorageRollbackKey = "state" | "index" | "last-opened";

export interface StorageRollbackReport {
  readonly attempted: true;
  readonly failedKeys: readonly StorageRollbackKey[];
}

export class StorageWriteError extends Error {
  readonly cause: unknown;
  readonly rollbackReport?: StorageRollbackReport;

  constructor(
    message: string,
    cause: unknown,
    rollbackReport?: StorageRollbackReport,
  ) {
    super(message);
    this.name = "StorageWriteError";
    this.cause = cause;
    this.rollbackReport = rollbackReport
      ? Object.freeze({
          attempted: true as const,
          failedKeys: Object.freeze([...rollbackReport.failedKeys]),
        })
      : undefined;
    Object.setPrototypeOf(this, StorageWriteError.prototype);
  }
}

const INDEX_KEY = "comipath:v1:index:event-days";
const LAST_OPENED_KEY = "comipath:v1:last-opened";

function parseEventDayRef(eventId: unknown, dayId: unknown): EventDayRef {
  return {
    eventId: parseEventId(eventId),
    dayId: parseDayId(dayId),
  };
}

function getEventDayStateKey(ref: EventDayRef): string {
  const parsed = parseEventDayRef(ref.eventId, ref.dayId);
  return `comipath:v1:${parsed.eventId}:${parsed.dayId}:state`;
}

export class EventDayRepository {
  constructor(private readonly storageService: StorageService) {}

  load(ref: EventDayRef): LocalEventDayState | null {
    const key = getEventDayStateKey(ref);
    const raw = this.storageService.getJson<unknown | null>(key, null);
    if (raw === null) {
      return null;
    }
    const parsed = parseLocalEventDayState(raw);
    if (
      typeof raw === "object" &&
      raw !== null &&
      !Array.isArray(raw) &&
      (raw as Record<string, unknown>).schemaVersion === 1
    ) {
      // Persist only after parsing succeeds; save() rolls back to the v1 raw
      // value if the migration write or index update fails.
      this.save(ref, parsed);
    }
    return parsed;
  }

  save(ref: EventDayRef, state: LocalEventDayState): void {
    // 1. Validate the state before saving
    parseLocalEventDayState(state);
    const parsedRef = parseEventDayRef(ref.eventId, ref.dayId);

    const stateKey = getEventDayStateKey(parsedRef);
    const previousStateRaw = this.storageService.getString(stateKey, "");
    const previousIndexRaw = this.storageService.getString(INDEX_KEY, "");

    try {
      // 2. Save state data
      this.storageService.setJson(stateKey, state);

      // 3. Update index list
      const indexList = this.list();
      const exists = indexList.some(
        (r) => r.eventId === parsedRef.eventId && r.dayId === parsedRef.dayId,
      );
      if (!exists) {
        const nextList = [...indexList, parsedRef];
        this.storageService.setJson(INDEX_KEY, nextList);
      }
    } catch (error) {
      // Rollback on any failure to maintain consistency
      try {
        if (previousStateRaw === "") {
          this.storageService.remove(stateKey);
        } else {
          this.storageService.setString(stateKey, previousStateRaw);
        }
      } catch {
        // Suppress state key rollback errors
      }

      try {
        if (previousIndexRaw === "") {
          this.storageService.remove(INDEX_KEY);
        } else {
          this.storageService.setString(INDEX_KEY, previousIndexRaw);
        }
      } catch {
        // Suppress index key rollback errors
      }

      if (error instanceof StorageWriteError) {
        throw error;
      }
      throw new StorageWriteError("Failed to save event day state", error);
    }
  }

  /** Save state, index, and last-opened as one rollback-protected operation. */
  saveWithLastOpened(ref: EventDayRef, state: LocalEventDayState): void {
    parseLocalEventDayState(state);
    const parsedRef = parseEventDayRef(ref.eventId, ref.dayId);

    const stateKey = getEventDayStateKey(parsedRef);
    const previousStateRaw = this.storageService.getString(stateKey, "");
    const previousIndexRaw = this.storageService.getString(INDEX_KEY, "");
    const previousLastOpenedRaw = this.storageService.getString(
      LAST_OPENED_KEY,
      "",
    );

    try {
      this.storageService.setJson(stateKey, state);

      const indexList = this.list();
      const exists = indexList.some(
        (r) => r.eventId === parsedRef.eventId && r.dayId === parsedRef.dayId,
      );
      if (!exists) {
        const nextList = [...indexList, parsedRef];
        this.storageService.setJson(INDEX_KEY, nextList);
      }

      this.storageService.setJson(LAST_OPENED_KEY, parsedRef);
    } catch (error) {
      // Rollback all three keys on failure
      try {
        if (previousStateRaw === "") {
          this.storageService.remove(stateKey);
        } else {
          this.storageService.setString(stateKey, previousStateRaw);
        }
      } catch {
        // Suppress
      }

      try {
        if (previousIndexRaw === "") {
          this.storageService.remove(INDEX_KEY);
        } else {
          this.storageService.setString(INDEX_KEY, previousIndexRaw);
        }
      } catch {
        // Suppress
      }

      try {
        if (previousLastOpenedRaw === "") {
          this.storageService.remove(LAST_OPENED_KEY);
        } else {
          this.storageService.setString(LAST_OPENED_KEY, previousLastOpenedRaw);
        }
      } catch {
        // Suppress
      }

      if (error instanceof StorageWriteError) {
        throw error;
      }
      throw new StorageWriteError(
        "Failed to save state and last opened event day",
        error,
      );
    }
  }

  list(): EventDayRef[] {
    const raw = this.storageService.getJson<unknown>(INDEX_KEY, []);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.flatMap((item): EventDayRef[] => {
      if (typeof item !== "object" || item === null) {
        return [];
      }
      const obj = item as Record<string, unknown>;
      try {
        return [
          {
            eventId: parseEventId(obj.eventId),
            dayId: parseDayId(obj.dayId),
          },
        ];
      } catch {
        return [];
      }
    });
  }

  getLastOpened(): EventDayRef | null {
    try {
      const item = this.storageService.getJson<unknown | null>(
        LAST_OPENED_KEY,
        null,
      );
      if (typeof item !== "object" || item === null) {
        return null;
      }
      const obj = item as Record<string, unknown>;
      return parseEventDayRef(obj.eventId, obj.dayId);
    } catch (error) {
      console.error(
        "Failed to retrieve or parse last opened event day:",
        error,
      );
      return null;
    }
  }

  setLastOpened(ref: EventDayRef): void {
    const parsedRef = parseEventDayRef(ref.eventId, ref.dayId);
    try {
      this.storageService.setJson(LAST_OPENED_KEY, parsedRef);
    } catch (error) {
      throw new StorageWriteError(
        "Failed to save last opened event day",
        error,
      );
    }
  }

  deleteState(ref: EventDayRef): void {
    const parsedRef = parseEventDayRef(ref.eventId, ref.dayId);
    const stateKey = getEventDayStateKey(parsedRef);
    const previousStateRaw = this.storageService.getString(stateKey, "");
    const previousIndexRaw = this.storageService.getString(INDEX_KEY, "");
    const previousLastOpenedRaw = this.storageService.getString(
      LAST_OPENED_KEY,
      "",
    );

    const lastOpened = this.getLastOpened();
    const isMatchingLastOpened =
      lastOpened !== null &&
      lastOpened.eventId === parsedRef.eventId &&
      lastOpened.dayId === parsedRef.dayId;
    const strictList = this.listForDeletionStrict();
    if (
      !strictList.some(
        (item) =>
          item.ref.eventId === parsedRef.eventId &&
          item.ref.dayId === parsedRef.dayId,
      )
    ) {
      throw new Error("Event/day ref is not present in the strict index");
    }

    try {
      this.storageService.remove(stateKey);

      const indexList = strictList.map((item) => item.ref);
      const nextList = indexList.filter(
        (r) =>
          !(r.eventId === parsedRef.eventId && r.dayId === parsedRef.dayId),
      );
      this.storageService.setJson(INDEX_KEY, nextList);

      if (isMatchingLastOpened) {
        this.storageService.remove(LAST_OPENED_KEY);
      }
    } catch (error) {
      // Rollback on failure
      try {
        if (previousStateRaw === "") {
          this.storageService.remove(stateKey);
        } else {
          this.storageService.setString(stateKey, previousStateRaw);
        }
      } catch {
        // Suppress state key rollback errors
      }

      try {
        if (previousIndexRaw === "") {
          this.storageService.remove(INDEX_KEY);
        } else {
          this.storageService.setString(INDEX_KEY, previousIndexRaw);
        }
      } catch {
        // Suppress index key rollback errors
      }

      try {
        if (isMatchingLastOpened) {
          if (previousLastOpenedRaw === "") {
            this.storageService.remove(LAST_OPENED_KEY);
          } else {
            this.storageService.setString(
              LAST_OPENED_KEY,
              previousLastOpenedRaw,
            );
          }
        }
      } catch {
        // Suppress
      }

      throw new StorageWriteError("Failed to delete event day state", error);
    }
  }

  /** Strict index listing that fails closed on any malformed, duplicate, or missing state data. */
  listForDeletionStrict(): readonly {
    readonly ref: EventDayRef;
    readonly state: LocalEventDayState;
  }[] {
    const rawIndex = this.storageService.getJson<unknown>(INDEX_KEY, null);
    if (!Array.isArray(rawIndex)) {
      throw new Error("Invalid index payload: expected array");
    }

    const seenKeys = new Set<string>();
    const result: { ref: EventDayRef; state: LocalEventDayState }[] = [];

    for (const item of rawIndex) {
      if (typeof item !== "object" || item === null) {
        throw new Error("Invalid index entry: expected object");
      }
      const obj = item as Record<string, unknown>;
      const ref = parseEventDayRef(obj.eventId, obj.dayId);
      const key = `${ref.eventId}:${ref.dayId}`;
      if (seenKeys.has(key)) {
        throw new Error(`Duplicate ref in index: ${key}`);
      }
      seenKeys.add(key);

      const stateKey = getEventDayStateKey(ref);
      const rawState = this.storageService.getJson<unknown | null>(
        stateKey,
        null,
      );
      if (rawState === null) {
        throw new Error(`Missing state for indexed ref: ${key}`);
      }

      const state = parseLocalEventDayState(rawState);
      result.push({ ref, state });
    }

    return Object.freeze(result);
  }

  /** Atomic, failure-safe deletion of all event days with strict generation preflight and full rollback. */
  deleteAllFailureSafe(
    expected: readonly {
      readonly ref: EventDayRef;
      readonly sourceGeneration: string;
    }[],
  ): void {
    const currentList = this.listForDeletionStrict();

    if (currentList.length !== expected.length) {
      throw new Error("Index count changed before deletion");
    }

    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];
      const cur = currentList[i];
      if (
        exp.ref.eventId !== cur.ref.eventId ||
        exp.ref.dayId !== cur.ref.dayId ||
        exp.sourceGeneration !== cur.state.sourceGeneration
      ) {
        throw new Error(
          `Index or source generation changed before deletion at index ${i}`,
        );
      }
    }

    if (currentList.some((item) => item.state.gasOutbox.length > 0)) {
      throw new Error("Pending outbox entries exist before deletion");
    }

    // Capture raw snapshots of all keys before first write
    const stateSnapshots = new Map<string, string>();
    for (const item of currentList) {
      const key = getEventDayStateKey(item.ref);
      stateSnapshots.set(key, this.storageService.getString(key, ""));
    }
    const indexSnapshot = this.storageService.getString(INDEX_KEY, "");
    const lastOpenedSnapshot = this.storageService.getString(
      LAST_OPENED_KEY,
      "",
    );

    try {
      for (const item of currentList) {
        const key = getEventDayStateKey(item.ref);
        this.storageService.remove(key);
      }
      this.storageService.remove(INDEX_KEY);
      this.storageService.remove(LAST_OPENED_KEY);
    } catch (error) {
      // Rollback every key
      const failedKeysSet = new Set<StorageRollbackKey>();

      for (const [key, rawValue] of stateSnapshots.entries()) {
        try {
          if (rawValue === "") {
            this.storageService.remove(key);
          } else {
            this.storageService.setString(key, rawValue);
          }
        } catch {
          failedKeysSet.add("state");
        }
      }

      try {
        if (indexSnapshot === "") {
          this.storageService.remove(INDEX_KEY);
        } else {
          this.storageService.setString(INDEX_KEY, indexSnapshot);
        }
      } catch {
        failedKeysSet.add("index");
      }

      try {
        if (lastOpenedSnapshot === "") {
          this.storageService.remove(LAST_OPENED_KEY);
        } else {
          this.storageService.setString(LAST_OPENED_KEY, lastOpenedSnapshot);
        }
      } catch {
        failedKeysSet.add("last-opened");
      }

      const report: StorageRollbackReport = {
        attempted: true,
        failedKeys: Object.freeze(Array.from(failedKeysSet)),
      };

      throw new StorageWriteError(
        "Failed to delete all event days safely",
        error,
        report,
      );
    }
  }
}
