import { diffCircleSources } from "../domain/circle-source-diff";
import type { CircleDataPreview } from "../domain/circle-data-source-types";
import type {
  EventDayRef,
  GasDataSource,
  LocalEventDayState,
} from "../../event-day/public-api";
import type { CancelableRequest } from "./cancelable-request";
import type { GoogleSheetCircleClient } from "./google-sheet-circle-client";

export interface PreviewGoogleSheetImportInput {
  readonly eventDay: EventDayRef;
  readonly source: GasDataSource;
}

export interface PreviewGoogleSheetImportRepository {
  load(ref: EventDayRef): LocalEventDayState | null;
}

/**
  Fetches circles from a Google Sheet and creates an immutable CircleDataPreview.
  Does not mutate the repository.
 */
export class PreviewGoogleSheetImportUseCase {
  private previewSequence = 0;

  constructor(
    private readonly repository: PreviewGoogleSheetImportRepository,
    private readonly client: GoogleSheetCircleClient,
    private readonly options: {
      readonly now?: () => string;
      readonly createPreviewId?: () => string;
      readonly previewTtlMs?: number;
    } = {},
  ) {}

  start(
    input: PreviewGoogleSheetImportInput,
  ): CancelableRequest<CircleDataPreview> {
    const now = this.options.now ?? (() => new Date().toISOString());
    const previewTtlMs = this.options.previewTtlMs ?? 5 * 60 * 1000;
    const createPreviewId =
      this.options.createPreviewId ??
      (() => `gas-preview-${Date.now()}-${++this.previewSequence}`);

    const state = this.repository.load(input.eventDay);
    if (!state) {
      throw new Error("Open the event/day before previewing a GAS import");
    }

    const request = this.client.startLoadingCircles({
      type: "gas",
      gasUrl: input.source.gasUrl,
      sheetName: input.source.sheetName,
    });

    const result = request.result.then((circles) => {
      const nowMs = Date.parse(now());
      const mode =
        state.circles.length === 0
          ? ("initial" as const)
          : ("replacement" as const);

      const preview: CircleDataPreview = Object.freeze({
        previewId: createPreviewId(),
        ref: Object.freeze({ ...input.eventDay }),
        mode,
        expectedSourceGeneration: state.sourceGeneration,
        diff: diffCircleSources(state.circles, circles),
        newCircles: Object.freeze([...circles]),
        fetchedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + previewTtlMs).toISOString(),
      });

      return preview;
    });

    return {
      result,
      cancel: () => request.cancel(),
    };
  }
}
