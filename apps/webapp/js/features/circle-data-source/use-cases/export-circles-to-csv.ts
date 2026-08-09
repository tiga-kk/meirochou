import { serializeCircleCsv } from "../domain/csv-circle-codec";
import type { EventDayRef, LocalEventDayState } from "../../event-day/public-api";
import type { CircleCsvDownloader } from "./circle-csv-downloader";

export interface ExportCirclesToCsvRepository {
  load(ref: EventDayRef): LocalEventDayState | null;
}

export interface ExportCirclesToCsvInput {
  readonly eventDay: EventDayRef;
}

export interface ExportCirclesToCsvOptions {
  readonly now?: () => Date;
}

function padZero(num: number, length = 2): string {
  return String(num).padStart(length, "0");
}

function formatExportFilename(ref: EventDayRef, now: Date): string {
  const yyyy = now.getFullYear();
  const mm = padZero(now.getMonth() + 1);
  const dd = padZero(now.getDate());
  const hh = padZero(now.getHours());
  const mi = padZero(now.getMinutes());
  const ss = padZero(now.getSeconds());
  return `comipath-${ref.eventId}-${ref.dayId}-${yyyy}${mm}${dd}-${hh}${mi}${ss}.csv`;
}

/** Exports active circles (excluding source-removed ones) as a CSV download. */
export class ExportCirclesToCsvUseCase {
  constructor(
    private readonly repository: ExportCirclesToCsvRepository,
    private readonly downloader: CircleCsvDownloader,
    private readonly options: ExportCirclesToCsvOptions = {},
  ) {}

  execute(input: ExportCirclesToCsvInput): void {
    const state = this.repository.load(input.eventDay);
    if (!state) throw new Error("Event day state not found");

    const now = this.options.now ? this.options.now() : new Date();
    const filename = formatExportFilename(input.eventDay, now);

    const activeCircles = state.circles.filter(
      (circle) => !circle.removedFromSource,
    );
    const purchasedSet = new Set(
      Object.entries(state.circleStates)
        .filter(([_, s]) => s === "purchased")
        .map(([space]) => space),
    );

    this.downloader.downloadCirclesAsCsv(filename, activeCircles, purchasedSet);
  }
}
