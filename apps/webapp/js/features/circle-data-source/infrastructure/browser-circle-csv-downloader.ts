import type { CircleRecord } from "../../event-day/public-api";
import type { CircleCsvDownloader } from "../use-cases/circle-csv-downloader";
import { serializeCircleCsv } from "../domain/csv-circle-codec";

export class BrowserCircleCsvDownloader implements CircleCsvDownloader {
  downloadCirclesAsCsv(filename: string, circles: readonly CircleRecord[]): void {
    const content = serializeCircleCsv(circles, new Set());
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
