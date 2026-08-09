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

export interface PendingGasUpdatesViewState {
  readonly busy: boolean;
  readonly resultMessage: string;
  readonly errorMessage: string;
}

interface PendingGasUpdatesControllerOptions {
  readonly eventBindings?: PendingGasUpdatesEventBindings;
  readonly onStateChange?: () => void;
}

export class PendingGasUpdatesController {
  private eventCleanup: (() => void) | null = null;
  private requestVersion = 0;
  private state: PendingGasUpdatesViewState = {
    busy: false,
    resultMessage: "",
    errorMessage: "",
  };

  constructor(
    private readonly sendUseCase: PendingGasUpdatesSender,
    private readonly discardUseCase: PendingGasUpdatesDiscarder,
    options?: PendingGasUpdatesEventBindings | PendingGasUpdatesControllerOptions,
  ) {
    this.options = options && "targetElement" in options
      ? { eventBindings: options }
      : options;
  }

  private readonly options?: PendingGasUpdatesControllerOptions;

  getViewState(): PendingGasUpdatesViewState {
    return { ...this.state };
  }

  invalidateRequests(): void {
    this.requestVersion += 1;
    this.state = { ...this.state, busy: false };
    this.options?.onStateChange?.();
  }

  start(): void {
    this.stop();
    const bindings = this.options?.eventBindings;
    if (!bindings) return;
    const { targetElement, onRetryRequest, onDiscardRequest } = bindings;
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
    this.invalidateRequests();
  }

  async retryAll(eventDay?: EventDayRef): Promise<number | null> {
    const requestVersion = ++this.requestVersion;
    this.state = { busy: true, resultMessage: "", errorMessage: "" };
    this.options?.onStateChange?.();
    try {
      const result = await this.sendUseCase.execute({ eventDay });
      if (requestVersion !== this.requestVersion) return null;
      this.state = {
        busy: false,
        resultMessage: `送信完了 (${result.processedCount}件)`,
        errorMessage: "",
      };
      this.options?.onStateChange?.();
      return result.processedCount;
    } catch (error) {
      if (requestVersion === this.requestVersion) {
        this.state = {
          busy: false,
          resultMessage: "",
          errorMessage: "再送処理中にエラーが発生しました。",
        };
        this.options?.onStateChange?.();
        throw error;
      }
      return null;
    }
  }

  discardAll(eventDay: EventDayRef): void {
    this.discardUseCase.execute({ eventDay });
  }

  discardOne(eventDay: EventDayRef, updateId: string): void {
    try {
      this.discardUseCase.execute({ eventDay, updateId });
      this.state = {
        busy: false,
        resultMessage: "選択した未送信データを破棄しました",
        errorMessage: "",
      };
      this.options?.onStateChange?.();
    } catch (error) {
      this.state = {
        busy: false,
        resultMessage: "",
        errorMessage: "未送信データの破棄に失敗しました",
      };
      this.options?.onStateChange?.();
      throw error;
    }
  }
}
