import type { CircleRecord } from "../../event-day/public-api";
import type { CancelableRequest } from "./cancelable-request";

export interface GoogleSheetCircleClient {
  startLoadingSheetNames(webAppUrl: string): CancelableRequest<readonly string[]>;
  startLoadingCircles(webAppUrl: string, sheetName: string): CancelableRequest<readonly CircleRecord[]>;
}
