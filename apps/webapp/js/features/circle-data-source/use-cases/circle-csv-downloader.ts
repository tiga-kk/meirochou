import type { CircleRecord } from "../../event-day/public-api";

export interface CircleCsvDownloader {
  downloadCirclesAsCsv(filename: string, circles: readonly CircleRecord[]): void;
}
