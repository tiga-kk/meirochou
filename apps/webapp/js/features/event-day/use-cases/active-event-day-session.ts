import type {
  ActiveEventDaySnapshot,
  EventDayRef,
  LocalEventDayState,
} from "../domain/event-day-types";

export interface ActiveEventDaySession {
  getActiveEventDay(): ActiveEventDaySnapshot | null;
  setActiveEventDay(ref: EventDayRef, state: LocalEventDayState): void;
  replaceActiveEventDayState(state: LocalEventDayState): void;
  clearActiveEventDay(): void;
  subscribe(
    listener: (snapshot: ActiveEventDaySnapshot | null) => void,
  ): () => void;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      freeze(child);
    }
  }
  return value;
}

function snapshot(
  ref: EventDayRef,
  state: LocalEventDayState,
): ActiveEventDaySnapshot {
  return freeze({ ref: freeze(clone(ref)), state: freeze(clone(state)) });
}

export function createActiveEventDaySession(): ActiveEventDaySession {
  let current: ActiveEventDaySnapshot | null = null;
  const listeners = new Set<(value: ActiveEventDaySnapshot | null) => void>();

  const notify = (): void => {
    const value = current;
    for (const listener of listeners) listener(value);
  };

  return {
    getActiveEventDay: () => current,
    setActiveEventDay(ref, state) {
      current = snapshot(ref, state);
      notify();
    },
    replaceActiveEventDayState(state) {
      if (!current) throw new Error("No event/day is active");
      current = snapshot(current.ref, state);
      notify();
    },
    clearActiveEventDay() {
      current = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
