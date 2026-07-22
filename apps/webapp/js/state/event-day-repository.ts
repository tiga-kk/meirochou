import { parseDayId, parseEventId } from "../types/boundary-parsers";
import type { EventDayRef, LocalEventDayState } from "../types/domain";
import { parseLocalEventDayState } from "./storage-schema";
import type { StorageService } from "./storage-service";

export class StorageWriteError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "StorageWriteError";
    this.cause = cause;
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
    // parseLocalEventDayState will throw StorageSchemaError if validation fails.
    // In-memory format parsing may throw SyntaxError if not proper JSON, but
    // storageService.getJson already handles JSON parsing. If it's malformed JSON string,
    // getJson might throw, which is fine and will propagate.
    return parseLocalEventDayState(raw);
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

    try {
      this.storageService.remove(stateKey);

      const indexList = this.list();
      const nextList = indexList.filter(
        (r) =>
          !(r.eventId === parsedRef.eventId && r.dayId === parsedRef.dayId),
      );
      this.storageService.setJson(INDEX_KEY, nextList);
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

      throw new StorageWriteError("Failed to delete event day state", error);
    }
  }
}
