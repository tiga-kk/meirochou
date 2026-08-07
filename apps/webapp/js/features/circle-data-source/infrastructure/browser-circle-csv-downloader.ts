import type { CircleRecord } from "../../event-day/public-api";
import { serializeCircleCsv } from "../domain/csv-circle-codec";
import type { CircleCsvDownloader } from "../use-cases/circle-csv-downloader";

export class BrowserCircleCsvDownloader implements CircleCsvDownloader {
  constructor(private readonly windowObj: Window & typeof globalThis) {}

  downloadCirclesAsCsv(
    filename: string,
    circles: readonly CircleRecord[],
    purchasedSpaces: ReadonlySet<string>,
  ): void {
    const csvContent = serializeCircleCsv(circles, purchasedSpaces);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = this.windowObj.URL.createObjectURL(blob);
    try {
      const link = this.windowObj.document.createElement("a");
      link.href = url;
      link.download = filename;
      this.windowObj.document.body.appendChild(link);
      try {
        link.click();
      } finally {
        this.windowObj.document.body.removeChild(link);
      }
    } finally {
      this.windowObj.URL.revokeObjectURL(url);
    }
  }
}
