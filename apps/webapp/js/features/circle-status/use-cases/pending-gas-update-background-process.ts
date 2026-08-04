import type { SendPendingGasUpdatesUseCase } from "./send-pending-gas-updates";

export interface PendingGasUpdateBackgroundProcess {
  start(): void;
  requestSend(): void;
  stop(): void;
}

export class DefaultPendingGasUpdateBackgroundProcess
  implements PendingGasUpdateBackgroundProcess
{
  private stopped = false;
  private isProcessing = false;
  private pendingRequest = false;

  constructor(
    private readonly sendUseCase: SendPendingGasUpdatesUseCase,
    private readonly windowObj?: Window,
  ) {}

  start(): void {
    if (this.stopped) return;
    this.sendUseCase.start();
    if (
      this.windowObj &&
      typeof this.windowObj.addEventListener === "function"
    ) {
      this.windowObj.addEventListener("online", this.handleOnline);
    }
    this.requestSend();
  }

  private handleOnline = (): void => {
    this.requestSend();
  };

  requestSend(): void {
    if (this.stopped) return;
    if (this.isProcessing) {
      this.pendingRequest = true;
      return;
    }

    this.isProcessing = true;
    void this.sendUseCase
      .execute()
      .catch(() => {})
      .finally(() => {
        this.isProcessing = false;
        if (this.pendingRequest && !this.stopped) {
          this.pendingRequest = false;
          this.requestSend();
        }
      });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.sendUseCase.stop();
    if (
      this.windowObj &&
      typeof this.windowObj.removeEventListener === "function"
    ) {
      this.windowObj.removeEventListener("online", this.handleOnline);
    }
  }
}
