import type { CircleRecord, GasDataSource } from "../../event-day/public-api";
import type { CancelableRequest } from "./cancelable-request";

export interface GoogleSheetCircleSource extends GasDataSource {}

export interface GoogleSheetCircleClient {
  startLoadingSheetNames(
    webAppUrl: string,
  ): CancelableRequest<readonly string[]>;
  startLoadingCircles(
    source: GoogleSheetCircleSource,
  ): CancelableRequest<readonly CircleRecord[]>;
}
