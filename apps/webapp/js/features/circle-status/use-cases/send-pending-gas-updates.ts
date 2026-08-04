import type {
  ActiveEventDaySession,
  EventDayRef,
  EventDayRepository,
  GasOutboxEntry,
  LocalEventDayState,
} from "../../event-day/public-api";
import type { PendingGasUpdateDelivery } from "./pending-gas-update-delivery";

function classifyDeliveryError(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown";
  const candidate = error as {
    readonly name?: unknown;
    readonly message?: unknown;
    readonly status?: unknown;
  };
  if (candidate.name === "AbortError") return "timeout";
  if (
    typeof candidate.status === "number" &&
    Number.isInteger(candidate.status)
  ) {
    return `http-${candidate.status}`;
  }
  if (
    typeof candidate.message === "string" &&
    /timeout|timed out/i.test(candidate.message)
  ) {
    return "timeout";
  }
  return "unknown";
}

export interface SendPendingGasUpdatesInput {
  readonly eventDay?: EventDayRef;
}

export class SendPendingGasUpdatesUseCase {
  private stopped = false;
  private activeExecution: Promise<{ readonly processedCount: number }> | null =
    null;

  constructor(
    private readonly repository: EventDayRepository,
    private readonly activeEventDaySession: ActiveEventDaySession,
    private readonly delivery: PendingGasUpdateDelivery,
  ) {}

  start(): void {
    this.stopped = false;
  }

  stop(): void {
    this.stopped = true;
  }

  execute(
    input: SendPendingGasUpdatesInput = {},
  ): Promise<{ readonly processedCount: number }> {
    if (this.activeExecution) return this.activeExecution;
    const execution = this.executePending(input);
    let trackedExecution: Promise<{ readonly processedCount: number }>;
    trackedExecution = execution.finally(() => {
      if (this.activeExecution === trackedExecution) {
        this.activeExecution = null;
      }
    });
    this.activeExecution = trackedExecution;
    return trackedExecution;
  }

  private async executePending(
    input: SendPendingGasUpdatesInput,
  ): Promise<{ readonly processedCount: number }> {
    const refs = input.eventDay
      ? [input.eventDay]
      : this.repository.listEventDays();

    let processedCount = 0;

    for (const ref of refs) {
      if (this.stopped) break;
      const state = this.repository.load(ref);
      if (!state || state.gasOutbox.length === 0) continue;

      const entries = [...state.gasOutbox];
      for (const entry of entries) {
        if (this.stopped) break;
        let currentState = this.repository.load(ref);
        if (!currentState) break;

        const currentEntry = currentState.gasOutbox.find(
          (e) => e.id === entry.id,
        );
        if (!currentEntry) continue; // Already removed or sent

        try {
          await this.delivery.deliver(currentEntry);
          if (this.stopped) break;
          // Remove from outbox on success
          currentState = this.repository.load(ref);
          if (currentState) {
            const nextOutbox = currentState.gasOutbox.filter(
              (e) => e.id !== entry.id,
            );
            const nextState: LocalEventDayState = {
              ...currentState,
              gasOutbox: Object.freeze(nextOutbox),
            };
            this.repository.save(ref, nextState);
            const snapshot = this.activeEventDaySession.getActiveEventDay();
            if (
              snapshot &&
              snapshot.ref.eventId === ref.eventId &&
              snapshot.ref.dayId === ref.dayId
            ) {
              this.activeEventDaySession.replaceActiveEventDayState(nextState);
            }
            processedCount += 1;
          }
        } catch (error: unknown) {
          // Increment attempts and set safe error category on failure
          currentState = this.repository.load(ref);
          if (currentState) {
            const nextOutbox = currentState.gasOutbox.map(
              (e): GasOutboxEntry => {
                if (e.id !== entry.id) return e;
                return {
                  ...e,
                  attempts: e.attempts + 1,
                  lastError: classifyDeliveryError(error),
                };
              },
            );
            const nextState: LocalEventDayState = {
              ...currentState,
              gasOutbox: Object.freeze(nextOutbox),
            };
            this.repository.save(ref, nextState);
            const snapshot = this.activeEventDaySession.getActiveEventDay();
            if (
              snapshot &&
              snapshot.ref.eventId === ref.eventId &&
              snapshot.ref.dayId === ref.dayId
            ) {
              this.activeEventDaySession.replaceActiveEventDayState(nextState);
            }
          }
        }
      }
    }

    return { processedCount };
  }
}
