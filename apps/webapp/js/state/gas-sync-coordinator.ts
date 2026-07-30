import type { EventDayRepository } from "../features/event-day/use-cases/event-day-repository";
import type {
  EventDayRef,
  GasSyncSummary,
  OnlineEventTarget,
} from "../types/domain";
import type { GasOutboxService } from "./gas-outbox-service";

const SAFE_FAILURE_CATEGORIES = new Set([
  "network",
  "timeout",
  "server-contract",
  "unknown",
]);

function safeFailureCategory(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  if (SAFE_FAILURE_CATEGORIES.has(error.message)) return error.message;
  if (/^http-\d{3}$/.test(error.message)) return error.message;
  return "unknown";
}

class NoopOnlineTarget implements OnlineEventTarget {
  addEventListener(): void {}
  removeEventListener(): void {}
}

/** Coordinates non-blocking startup and online retry for every persisted queue. */
export class GasSyncCoordinator {
  private readonly onlineTarget: OnlineEventTarget;
  private started = false;
  private inFlightProcess: Promise<GasSyncSummary> | null = null;
  private readonly handleOnline = () => {
    void this.processAll().catch(() => {});
  };

  constructor(
    private readonly repository: EventDayRepository,
    private readonly outbox: GasOutboxService,
    onlineTarget?: OnlineEventTarget,
  ) {
    if (onlineTarget) {
      this.onlineTarget = onlineTarget;
    } else if (
      typeof globalThis !== "undefined" &&
      typeof (globalThis as unknown as Window).addEventListener === "function"
    ) {
      this.onlineTarget = globalThis as unknown as OnlineEventTarget;
    } else {
      this.onlineTarget = new NoopOnlineTarget();
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.onlineTarget.addEventListener("online", this.handleOnline);
    void this.processAll().catch(() => {});
  }

  processAll(): Promise<GasSyncSummary> {
    if (this.inFlightProcess) {
      return this.inFlightProcess;
    }
    this.inFlightProcess = this.executeProcessAll().finally(() => {
      this.inFlightProcess = null;
    });
    return this.inFlightProcess;
  }

  /** Manually retries one event/day queue or every indexed queue. */
  async retry(ref: EventDayRef | null): Promise<GasSyncSummary> {
    if (ref === null) {
      return this.processAll();
    }

    let state: ReturnType<EventDayRepository["load"]>;
    try {
      state = this.repository.load(ref);
    } catch (error: unknown) {
      return {
        processedRefs: 1,
        sent: 0,
        pending: 0,
        failures: [{ ref, category: safeFailureCategory(error) }],
      };
    }

    if (state?.source.type !== "gas" || state.gasOutbox.length === 0) {
      return {
        processedRefs: 1,
        sent: 0,
        pending: 0,
        failures: [],
      };
    }

    try {
      const result = await this.outbox.process(ref);
      const failures: Array<{ ref: EventDayRef; category: string }> = [];
      if (result.error) {
        failures.push({
          ref: { eventId: ref.eventId, dayId: ref.dayId },
          category: safeFailureCategory(result.error),
        });
      }
      return {
        processedRefs: 1,
        sent: result.sent,
        pending: result.pending,
        failures,
      };
    } catch (err: unknown) {
      let latestState: ReturnType<EventDayRepository["load"]> = null;
      try {
        latestState = this.repository.load(ref);
      } catch {
        // Keep original
      }
      return {
        processedRefs: 1,
        sent: 0,
        pending: latestState?.gasOutbox.length ?? 0,
        failures: [
          {
            ref: { eventId: ref.eventId, dayId: ref.dayId },
            category: safeFailureCategory(err),
          },
        ],
      };
    }
  }

  private async executeProcessAll(): Promise<GasSyncSummary> {
    let processedRefs = 0;
    let sent = 0;
    let pending = 0;
    const failures: Array<{ ref: EventDayRef; category: string }> = [];

    const refs = [...this.repository.listEventDays()].sort((a, b) => {
      if (a.eventId !== b.eventId) {
        return a.eventId.localeCompare(b.eventId);
      }
      return a.dayId.localeCompare(b.dayId);
    });

    for (const ref of refs) {
      let state: ReturnType<EventDayRepository["load"]>;
      try {
        state = this.repository.load(ref);
      } catch (error: unknown) {
        processedRefs++;
        failures.push({ ref, category: safeFailureCategory(error) });
        continue;
      }
      if (state?.source.type !== "gas" || state.gasOutbox.length === 0) {
        continue;
      }

      processedRefs++;
      try {
        const result = await this.outbox.process(ref);
        sent += result.sent;
        pending += result.pending;
        if (result.error) {
          failures.push({
            ref: { eventId: ref.eventId, dayId: ref.dayId },
            category: safeFailureCategory(result.error),
          });
        }
      } catch (err: unknown) {
        const category = safeFailureCategory(err);
        let latestState: ReturnType<EventDayRepository["load"]> = null;
        try {
          latestState = this.repository.load(ref);
        } catch {
          // Keep the original processing failure category if state inspection also fails.
        }
        pending += latestState?.gasOutbox.length ?? 0;
        failures.push({
          ref: { eventId: ref.eventId, dayId: ref.dayId },
          category,
        });
      }
    }

    return {
      processedRefs,
      sent,
      pending,
      failures,
    };
  }

  dispose(): void {
    if (!this.started) return;
    this.started = false;
    this.onlineTarget.removeEventListener("online", this.handleOnline);
  }
}
