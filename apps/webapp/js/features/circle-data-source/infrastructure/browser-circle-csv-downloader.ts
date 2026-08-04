import type { CircleRecord } from "../../event-day/public-api";
import { serializeCircleCsv } from "../domain/csv-circle-codec";
import type { CircleCsvDownloader } from "../use-cases/circle-csv-downloader";

export class BrowserCircleCsvDownloader implements CircleCsvDownloader {
  downloadCirclesAsCsv(
    filename: string,
    circles: readonly CircleRecord[],
    purchased: ReadonlySet<string> = new Set(),
  ): void {
    const content = serializeCircleCsv(circles, purchased);
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    try {
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
