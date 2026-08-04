import type { GoogleSheetCircleClient } from "../use-cases/google-sheet-circle-client";
import type { CancelableRequest } from "../use-cases/cancelable-request";
import type { CircleRecord } from "../../event-day/public-api";

export class GasGoogleSheetCircleClient implements GoogleSheetCircleClient {
  startLoadingSheetNames(webAppUrl: string): CancelableRequest<readonly string[]> {
    const controller = new AbortController();
    const promise = (async () => {
      const res = await fetch(`${webAppUrl}?action=getSheets`, { signal: controller.signal });
      if (!res.ok) throw new Error("Network error");
      const data = await res.json();
      return data.sheets ?? [];
    })();

    return {
      result: promise,
      cancel: () => controller.abort(),
    };
  }

  startLoadingCircles(webAppUrl: string, sheetName: string): CancelableRequest<readonly CircleRecord[]> {
    const controller = new AbortController();
    const promise = (async () => {
      const res = await fetch(`${webAppUrl}?action=getCircles&sheetName=${encodeURIComponent(sheetName)}`, { signal: controller.signal });
      if (!res.ok) throw new Error("Network error");
      const data = await res.json();
      return data.circles ?? [];
    })();

    return {
      result: promise,
      cancel: () => controller.abort(),
    };
  }
}
