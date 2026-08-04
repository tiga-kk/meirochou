import type { EventDayRef } from "../features/event-day/domain/application-contract-types";
import {
  parseDayId,
  parseEventId,
} from "../features/event-day/infrastructure/application-boundary-parsers";

export interface DownloadAdapter {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  click(url: string, filename: string): void;
}

function padZero(num: number, length = 2): string {
  return String(num).padStart(length, "0");
}

export function formatCsvExportFilename(ref: EventDayRef, now: Date): string {
  if (!ref || typeof ref !== "object") {
    throw new Error("Invalid event day ref");
  }

  const validEventId = parseEventId(ref.eventId);
  const validDayId = parseDayId(ref.dayId);

  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("Invalid Date provided for CSV export filename");
  }

  const yyyy = now.getFullYear();
  const mm = padZero(now.getMonth() + 1);
  const dd = padZero(now.getDate());
  const hh = padZero(now.getHours());
  const mi = padZero(now.getMinutes());
  const ss = padZero(now.getSeconds());

  return `comipath-${validEventId}-${validDayId}-${yyyy}${mm}${dd}-${hh}${mi}${ss}.csv`;
}

export function downloadCsv(
  csv: string,
  filename: string,
  adapter: DownloadAdapter,
): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = adapter.createObjectURL(blob);

  try {
    adapter.click(url, filename);
  } finally {
    adapter.revokeObjectURL(url);
  }
}
