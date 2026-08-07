import { describe, expect, it, vi } from "vitest";
import { DefaultPendingGasUpdateBackgroundProcess } from "../apps/webapp/js/features/circle-status/use-cases/pending-gas-update-background-process";

describe("DefaultPendingGasUpdateBackgroundProcess", () => {
  it("starts the sender and initial request only once when startup is assembled twice", async () => {
    let resolveSend: (() => void) | undefined;
    const sendUseCase = {
      start: vi.fn(),
      stop: vi.fn(),
      execute: vi.fn(
        () =>
          new Promise<{ readonly processedCount: number }>((resolve) => {
            resolveSend = () => resolve({ processedCount: 0 });
          }),
      ),
    };
    const process = new DefaultPendingGasUpdateBackgroundProcess(sendUseCase);

    process.start();
    process.start();
    expect(sendUseCase.start).toHaveBeenCalledOnce();
    expect(sendUseCase.execute).toHaveBeenCalledOnce();

    resolveSend?.();
    await vi.waitFor(() => expect(sendUseCase.execute).toHaveBeenCalledOnce());
  });
});
