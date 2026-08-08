import type { EventDayRef } from "../../event-day/public-api";

interface PendingGasUpdatesSender {
  execute(input?: {
    readonly eventDay?: EventDayRef;
  }): Promise<{ readonly processedCount: number }>;
}

interface PendingGasUpdatesDiscarder {
  execute(input: {
    readonly eventDay: EventDayRef;
    readonly updateId?: string;
  }): unknown;
}

interface PendingGasUpdatesEventBindings {
  readonly targetElement: EventTarget;
  readonly onRetryRequest: (detail: unknown) => void | Promise<void>;
  readonly onDiscardRequest: (detail: unknown) => void | Promise<void>;
}

export class PendingGasUpdatesController {
  private eventCleanup: (() => void) | null = null;

  constructor(
    private readonly sendUseCase: PendingGasUpdatesSender,
    private readonly discardUseCase: PendingGasUpdatesDiscarder,
    private readonly eventBindings?: PendingGasUpdatesEventBindings,
  ) {}

  start(): void {
    this.stop();
    if (!this.eventBindings) return;
    const { targetElement, onRetryRequest, onDiscardRequest } = this.eventBindings;
    const retry = (event: Event) => void onRetryRequest((event as CustomEvent).detail);
    const discard = (event: Event) => void onDiscardRequest((event as CustomEvent).detail);
    targetElement.addEventListener("gas-retry-request", retry);
    targetElement.addEventListener("gas-discard-request", discard);
    this.eventCleanup = () => {
      targetElement.removeEventListener("gas-retry-request", retry);
      targetElement.removeEventListener("gas-discard-request", discard);
      this.eventCleanup = null;
    };
  }

  stop(): void {
    this.eventCleanup?.();
  }

  async retryAll(eventDay?: EventDayRef): Promise<number> {
    const result = await this.sendUseCase.execute({ eventDay });
    return result.processedCount;
  }

  discardAll(eventDay: EventDayRef): void {
    this.discardUseCase.execute({ eventDay });
  }

  discardOne(eventDay: EventDayRef, updateId: string): void {
    this.discardUseCase.execute({ eventDay, updateId });
  }
}
