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

export class PendingGasUpdatesController {
  constructor(
    private readonly sendUseCase: PendingGasUpdatesSender,
    private readonly discardUseCase: PendingGasUpdatesDiscarder,
  ) {}

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
