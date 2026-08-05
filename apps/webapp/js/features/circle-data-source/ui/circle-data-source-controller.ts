import type {
  CircleRecord,
  EventDayRef,
  GasDataSource,
} from "../../event-day/public-api";
import type { CircleDataPreview } from "../domain/circle-data-source-types";
import type { CancelableRequest } from "../use-cases/cancelable-request";
import type { CircleDataSourceSession } from "../use-cases/circle-data-source-session";
import type {
  GoogleSheetCircleClient,
  GoogleSheetCircleSource,
} from "../use-cases/google-sheet-circle-client";
import type { CircleDataSourceView } from "./dom-circle-data-source-view";
import type { PreviewCsvImportUseCase } from "../use-cases/preview-csv-import";
import type { PreviewGoogleSheetImportUseCase } from "../use-cases/preview-google-sheet-import";
import type { ApplyCircleDataPreviewUseCase } from "../use-cases/apply-circle-data-preview";
import type { CancelCircleDataPreviewUseCase } from "../use-cases/cancel-circle-data-preview";
import type { ExportCirclesToCsvUseCase } from "../use-cases/export-circles-to-csv";
import type { RouteGuidanceInvalidation } from "../use-cases/route-guidance-invalidation";

export interface CircleDataSourceControllerDependencies {
  readonly client: GoogleSheetCircleClient;
  readonly session: CircleDataSourceSession;
  readonly view?: CircleDataSourceView;
  readonly previewCsvImport?: PreviewCsvImportUseCase;
  readonly previewGoogleSheetImport?: PreviewGoogleSheetImportUseCase;
  readonly applyCircleDataPreview?: ApplyCircleDataPreviewUseCase;
  readonly cancelCircleDataPreview?: CancelCircleDataPreviewUseCase;
  readonly exportCirclesToCsv?: ExportCirclesToCsvUseCase;
  readonly routeGuidanceInvalidation?: RouteGuidanceInvalidation;
}

function parseGasUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error("Invalid WebApp URL");
  }
  if (
    !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
      value,
    )
  ) {
    throw new Error("Invalid WebApp URL");
  }
  return value;
}

function parseGasSource(value: unknown): GoogleSheetCircleSource {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid GAS source");
  }
  const source = value as Partial<GasDataSource>;
  if (
    source.type !== "gas" ||
    typeof source.sheetName !== "string" ||
    source.sheetName.trim() === ""
  ) {
    throw new Error("Invalid GAS source");
  }
  return {
    type: "gas",
    gasUrl: parseGasUrl(source.gasUrl),
    sheetName: source.sheetName,
  };
}

export class CircleDataSourceController {
  private currentRequest: CancelableRequest<unknown> | null = null;
  private requestSequence = 0;
  private stopped = false;
  private readonly previews = new Map<string, CircleDataPreview>();

  constructor(private readonly deps: CircleDataSourceControllerDependencies) {}

  async handleCsvFile(
    ref: EventDayRef,
    fileName: string,
    text: string,
  ): Promise<CircleDataPreview | null> {
    if (this.stopped || !this.deps.previewCsvImport) return null;
    try {
      this.deps.view?.showLoading();
      const preview = this.deps.previewCsvImport.execute({
        eventDay: ref,
        fileName,
        text,
      });
      this.previews.set(preview.previewId, preview);
      this.deps.session.setPreview(preview);
      this.deps.view?.showPreview(preview);
      return preview;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "CSV preview failed";
      this.deps.view?.showError(message);
      throw err;
    }
  }

  async handleGasPreviewRequest(
    ref: EventDayRef,
    source: GasDataSource,
  ): Promise<CircleDataPreview | null> {
    if (this.stopped || !this.deps.previewGoogleSheetImport) return null;
    try {
      this.deps.view?.showLoading();
      const request = this.deps.previewGoogleSheetImport.start({
        eventDay: ref,
        source,
      });
      let preview: CircleDataPreview | null = null;
      await this.runRequest(request, (value) => {
        preview = value;
        this.previews.set(value.previewId, value);
        this.deps.session.setPreview(value);
        this.deps.view?.showPreview(value);
      });
      return preview;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "GAS preview failed";
      this.deps.view?.showError(message);
      throw err;
    }
  }

  async applyPreview(previewId: string): Promise<void> {
    if (this.stopped || !this.deps.applyCircleDataPreview) return;
    const preview = this.previews.get(previewId);
    if (!preview) throw new Error("Preview not found or expired");
    try {
      this.deps.view?.showLoading();
      await this.deps.applyCircleDataPreview.execute({ previewId, preview });
      this.previews.delete(previewId);
      this.deps.session.setPreview(null);
      this.deps.view?.showReady();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Apply preview failed";
      this.deps.view?.showError(message);
      throw err;
    }
  }

  cancelPreview(previewId: string): void {
    if (this.stopped) return;
    const preview = this.previews.get(previewId);
    if (preview && this.deps.cancelCircleDataPreview) {
      this.deps.cancelCircleDataPreview.execute(preview);
    }
    this.previews.delete(previewId);
    this.deps.session.setPreview(null);
    this.deps.view?.showReady();
  }

  exportCsv(ref: EventDayRef): void {
    if (this.stopped || !this.deps.exportCirclesToCsv) return;
    this.deps.exportCirclesToCsv.execute({ eventDay: ref });
  }

  async loadGoogleSheetNames(webAppUrl: unknown): Promise<void> {
    const url = parseGasUrl(webAppUrl);
    await this.runRequest(
      this.deps.client.startLoadingSheetNames(url),
      (sheets) => this.deps.session.setSheetNames(this.parseStringList(sheets)),
    );
  }

  async loadGoogleSheetCircles(
    source: unknown,
  ): Promise<readonly CircleRecord[]> {
    const parsed = parseGasSource(source);
    let circles: readonly CircleRecord[] = [];
    await this.runRequest(
      this.deps.client.startLoadingCircles(parsed),
      (value) => {
        circles = value;
      },
    );
    return circles;
  }

  cancelCurrentRequest(): void {
    this.requestSequence += 1;
    this.currentRequest?.cancel();
    this.currentRequest = null;
    this.deps.session.setBusy(false);
  }

  stop(): void {
    this.stopped = true;
    this.cancelCurrentRequest();
  }

  private parseStringList(value: unknown): readonly string[] {
    if (
      !Array.isArray(value) ||
      !value.every((item) => typeof item === "string")
    ) {
      throw new Error("Invalid sheet list response");
    }
    return value;
  }

  private async runRequest<T>(
    request: CancelableRequest<T>,
    onSuccess: (value: T) => void,
  ): Promise<void> {
    this.cancelCurrentRequest();
    const sequence = ++this.requestSequence;
    const generation = this.deps.session.beginRequest();
    this.currentRequest = request as CancelableRequest<unknown>;
    try {
      const value = await request.result;
      if (
        !this.stopped &&
        sequence === this.requestSequence &&
        this.deps.session.isCurrentRequest(generation)
      ) {
        onSuccess(value);
      }
    } catch (err: unknown) {
      if (
        !this.stopped &&
        sequence === this.requestSequence &&
        this.deps.session.isCurrentRequest(generation)
      ) {
        this.deps.session.setError("network_error");
        throw err;
      }
    } finally {
      if (this.currentRequest === request) {
        this.currentRequest = null;
      }
    }
  }
}
