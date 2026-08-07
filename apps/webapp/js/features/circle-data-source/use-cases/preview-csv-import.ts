import type {
  EventDayRef,
  LocalEventDayState,
} from "../../event-day/public-api";
import type { CircleDataPreview } from "../domain/circle-data-source-types";
import { diffCircleSources } from "../domain/circle-source-diff";
import { parseCircleCsv } from "../domain/csv-circle-codec";

export interface PreviewCsvImportInput {
  readonly eventDay: EventDayRef;
  readonly fileName: string;
  readonly text: string;
}

export interface PreviewCsvImportRepository {
  load(ref: EventDayRef): LocalEventDayState | null;
}

/** Validates CSV text and creates an immutable preview; does not mutate repository. */
export class PreviewCsvImportUseCase {
  private previewSequence = 0;

  constructor(
    private readonly repository: PreviewCsvImportRepository,
    private readonly options: {
      readonly now?: () => string;
      readonly createPreviewId?: () => string;
      readonly previewTtlMs?: number;
    } = {},
  ) {}

  execute(input: PreviewCsvImportInput): CircleDataPreview {
    const now = this.options.now ?? (() => new Date().toISOString());
    const previewTtlMs = this.options.previewTtlMs ?? 5 * 60 * 1000;
    const createPreviewId =
      this.options.createPreviewId ??
      (() => `csv-preview-${Date.now()}-${++this.previewSequence}`);

    const state = this.repository.load(input.eventDay);
    if (!state) {
      throw new Error("Open the event/day before previewing a CSV replacement");
    }

    const result = parseCircleCsv(input.text);
    if (!result.ok) {
      const summary = result.issues
        .map((issue) => this.redactIssueMessage(issue.message))
        .join("; ");
      throw new Error(`CSV validation error: ${summary}`);
    }

    const nowMs = Date.parse(now());
    const preview: CircleDataPreview = Object.freeze({
      previewId: createPreviewId(),
      ref: Object.freeze({ ...input.eventDay }),
      mode:
        state.circles.length === 0
          ? ("initial" as const)
          : ("replacement" as const),
      expectedSourceGeneration: state.sourceGeneration,
      source: { type: "csv" as const, fileName: input.fileName },
      diff: diffCircleSources(state.circles, result.circles),
      newCircles: Object.freeze([...result.circles]),
      fetchedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + previewTtlMs).toISOString(),
    });

    return preview;
  }

  private redactIssueMessage(message: string): string {
    if (message === "Missing required field: space") return message;
    if (message === "Invalid priority value: must be a number") return message;
    if (message.startsWith("Missing required header column")) {
      return "Missing required header column";
    }
    if (message.startsWith("Duplicate space:")) return "Duplicate space";
    if (message.startsWith("Syntax error:")) return "CSV syntax error";
    return "Invalid CSV data";
  }
}
