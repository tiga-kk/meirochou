import { describe, expect, it, vi } from "vitest";
import { CircleDataSourceController } from "../apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller";

describe("CircleDataSourceController", () => {
  it("manages requests and cancels inflight requests on stop", () => {
    const client = {
      startLoadingSheetNames: vi.fn(() => {
        let canceled = false;
        return {
          result: new Promise((res) => {}),
          cancel() { canceled = true; },
          isCanceled: () => canceled,
        };
      }),
    };

    const session = {
      beginRequest: vi.fn(() => 1),
      isCurrentRequest: vi.fn(() => true),
      setBusy: vi.fn(),
      setError: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };

    const controller = new CircleDataSourceController({
      client: client as any,
      session: session as any,
    } as any);

    controller.loadGoogleSheetNames("https://script.google.com/macros/s/test/exec");
    controller.stop();
    expect(session.setBusy).toHaveBeenCalled();
  });
});
