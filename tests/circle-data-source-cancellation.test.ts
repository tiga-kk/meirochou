import { describe, expect, it, vi } from "vitest";
import { CircleDataSourceController } from "../apps/webapp/js/features/circle-data-source/ui/circle-data-source-controller";
import type { CancelableRequest } from "../apps/webapp/js/features/circle-data-source/use-cases/cancelable-request";
import { createCircleDataSourceSession } from "../apps/webapp/js/features/circle-data-source/use-cases/circle-data-source-session";
import type { GoogleSheetCircleClient } from "../apps/webapp/js/features/circle-data-source/use-cases/google-sheet-circle-client";

describe("CircleDataSourceController", () => {
  it("cancels an in-flight request on stop and ignores its result", async () => {
    let resolveRequest: ((value: readonly string[]) => void) | undefined;
    let cancelCount = 0;
    const request: CancelableRequest<readonly string[]> = {
      result: new Promise((resolve) => {
        resolveRequest = resolve;
      }),
      cancel: () => {
        cancelCount += 1;
      },
    };
    const client: GoogleSheetCircleClient = {
      startLoadingSheetNames: vi.fn(() => request),
      startLoadingCircles: vi.fn(() => request),
    };
    const session = createCircleDataSourceSession();
    const controller = new CircleDataSourceController({ client, session });

    const loading = controller.loadGoogleSheetNames(
      "https://script.google.com/macros/s/test/exec",
    );
    controller.stop();
    resolveRequest?.(["day1"]);
    await loading;

    expect(cancelCount).toBe(1);
    expect(session.getSnapshot().sheetNames).toEqual([]);
  });
});
