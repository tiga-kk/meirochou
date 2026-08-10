import type {
  ActiveEventDaySession,
  CircleRecord,
  EventDayRef,
  GasDataSource,
} from "../../event-day/public-api";
import type { CircleDataPreview } from "../domain/circle-data-source-types";
import type { ApplyCircleDataPreviewUseCase } from "../use-cases/apply-circle-data-preview";
import type { CancelCircleDataPreviewUseCase } from "../use-cases/cancel-circle-data-preview";
import type { CancelableRequest } from "../use-cases/cancelable-request";
import type {
  CircleDataSourceOperation,
  CircleDataSourceSession,
} from "../use-cases/circle-data-source-session";
import type { ExportCirclesToCsvUseCase } from "../use-cases/export-circles-to-csv";
import type {
  GoogleSheetCircleClient,
  GoogleSheetCircleSource,
} from "../use-cases/google-sheet-circle-client";
import type { PreviewCsvImportUseCase } from "../use-cases/preview-csv-import";
import type { PreviewGoogleSheetImportUseCase } from "../use-cases/preview-google-sheet-import";
import type { RouteGuidanceInvalidation } from "../use-cases/route-guidance-invalidation";
import type { CircleDataSourceView } from "./dom-circle-data-source-view";

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
  readonly activeEventDaySession?: ActiveEventDaySession;
  readonly targetElement?: HTMLElement | Window | Document;
  readonly diffDialogElement?: HTMLElement | Window | Document;
  readonly onOperationComplete?: (
    operation: Exclude<CircleDataSourceOperation, "idle">,
  ) => void;
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
  private started = false;
  private activeEventDayUnsubscribe: (() => void) | null = null;
  private activeEventDayKey: string | null = null;
  private listeners: Array<{
    target: HTMLElement | Window | Document;
    type: string;
    handler: (e: Event) => void;
  }> = [];

  constructor(private readonly deps: CircleDataSourceControllerDependencies) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;

    const activeEventDaySession = this.deps.activeEventDaySession;
    if (activeEventDaySession) {
      const active = activeEventDaySession.getActiveEventDay();
      this.activeEventDayKey = active
        ? `${active.ref.eventId}\u0000${active.ref.dayId}`
        : null;
      this.activeEventDayUnsubscribe = activeEventDaySession.subscribe(
        (snapshot) => {
          const nextKey = snapshot
            ? `${snapshot.ref.eventId}\u0000${snapshot.ref.dayId}`
            : null;
          if (nextKey === this.activeEventDayKey) return;
          this.activeEventDayKey = nextKey;
          this.cancelCurrentRequest();
          this.deps.session.reset();
        },
      );
    }

    const target =
      this.deps.targetElement ??
      (typeof document !== "undefined" ? document : null);
    const diffDialog =
      this.deps.diffDialogElement ??
      (typeof document !== "undefined"
        ? (document.getElementById("source-diff-dialog") ?? document)
        : null);

    if (target) {
      this.bindListener(target, "csv-preview-request", (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.file) {
          const ref =
            detail.ref ??
            this.deps.activeEventDaySession?.getActiveEventDay()?.ref;
          if (ref) {
            void this.handleCsvFileFromFile(ref, detail.file);
          }
        }
      });

      this.bindListener(target, "csv-export-request", (e: Event) => {
        const detail = (e as CustomEvent).detail;
        const ref =
          detail?.ref ??
          this.deps.activeEventDaySession?.getActiveEventDay()?.ref;
        if (ref) {
          this.exportCsv(ref);
        }
      });

      this.bindListener(target, "gas-sheets-request", (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.gasUrl) {
          this.deps.session.updateDraft({
            draftWebAppUrl: detail.gasUrl,
            selectedSheetName: "",
          });
          void this.loadGoogleSheetNames(detail.gasUrl);
        }
      });

      this.bindListener(target, "gas-preview-request", (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.source) {
          this.deps.session.updateDraft({
            draftWebAppUrl: detail.source.gasUrl,
            selectedSheetName: detail.source.sheetName,
          });
          const ref =
            detail.ref ??
            this.deps.activeEventDaySession?.getActiveEventDay()?.ref;
          if (ref) {
            void this.handleGasPreviewRequest(ref, detail.source);
          }
        }
      });
    }

    if (diffDialog) {
      this.bindListener(diffDialog, "source-preview-apply", (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.previewId) {
          void this.applyPreview(detail.previewId);
        }
      });

      this.bindListener(diffDialog, "source-preview-cancel", (e: Event) => {
        const detail = (e as CustomEvent).detail;
        this.cancelPreview(detail?.previewId ?? "");
      });
    }
  }

  private bindListener(
    target: HTMLElement | Window | Document,
    type: string,
    handler: (e: Event) => void,
  ): void {
    if (target && typeof target.addEventListener === "function") {
      target.addEventListener(type, handler);
      this.listeners.push({ target, type, handler });
    }
  }

  async handleCsvFileFromFile(
    ref: EventDayRef,
    file: File,
  ): Promise<CircleDataPreview | null> {
    if (this.stopped || !this.deps.previewCsvImport) return null;
    this.cancelCurrentRequest();
    const sequence = ++this.requestSequence;
    const generation = this.deps.session.beginRequest("csv-preview");
    this.deps.view?.showLoading();
    try {
      const text = await file.text();
      return this.executeCsvPreview(ref, file.name, text, sequence, generation);
    } catch (err: unknown) {
      if (this.isCurrent(sequence, generation))
        this.deps.session.setError("invalid_csv");
      const message = err instanceof Error ? err.message : "CSV preview failed";
      this.deps.view?.showError(message);
      throw err;
    }
  }

  async handleCsvFile(
    ref: EventDayRef,
    fileName: string,
    text: string,
  ): Promise<CircleDataPreview | null> {
    if (this.stopped || !this.deps.previewCsvImport) return null;
    this.cancelCurrentRequest();
    const sequence = ++this.requestSequence;
    const generation = this.deps.session.beginRequest("csv-preview");
    this.deps.view?.showLoading();
    try {
      return this.executeCsvPreview(ref, fileName, text, sequence, generation);
    } catch (err: unknown) {
      this.deps.session.setError("invalid_csv");
      const message = err instanceof Error ? err.message : "CSV preview failed";
      this.deps.view?.showError(message);
      throw err;
    }
  }

  private executeCsvPreview(
    ref: EventDayRef,
    fileName: string,
    text: string,
    sequence: number,
    generation: number,
  ): CircleDataPreview | null {
    if (!this.isCurrent(sequence, generation) || !this.deps.previewCsvImport)
      return null;
    const preview = this.deps.previewCsvImport.execute({
      eventDay: ref,
      fileName,
      text,
    });
    this.deps.session.setPreview(preview);
    this.deps.view?.showPreview(preview);
    if (this.isCurrent(sequence, generation)) {
      this.deps.onOperationComplete?.("csv-preview");
    }
    return preview;
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
      await this.runRequest(
        request,
        "gas-preview",
        (value, sequence, generation) => {
          preview = value;
          this.deps.session.setPreview(value);
          this.deps.view?.showPreview(value);
          if (this.isCurrent(sequence, generation)) {
            this.deps.onOperationComplete?.("gas-preview");
          }
        },
      );
      return preview;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "GAS preview failed";
      this.deps.view?.showError(message);
      throw err;
    }
  }

  async applyPreview(previewId: string): Promise<void> {
    if (this.stopped || !this.deps.applyCircleDataPreview) return;
    const preview = this.deps.session.getSnapshot().preview;
    if (!preview || (previewId && preview.previewId !== previewId)) {
      throw new Error("Preview not found or expired");
    }
    try {
      this.deps.view?.showLoading();
      this.cancelCurrentRequest();
      const sequence = ++this.requestSequence;
      const generation = this.deps.session.beginRequest("apply-preview");
      await this.deps.applyCircleDataPreview.execute({
        previewId: preview.previewId,
        preview,
      });
      if (this.isCurrent(sequence, generation)) {
        this.deps.session.setPreview(null);
        this.deps.view?.showReady();
        if (this.isCurrent(sequence, generation)) {
          this.deps.onOperationComplete?.("apply-preview");
        }
      }
    } catch (err: unknown) {
      if (this.deps.session.getSnapshot().operation === "apply-preview") {
        this.deps.session.setError("stale_generation");
      }
      const message =
        err instanceof Error ? err.message : "Apply preview failed";
      this.deps.view?.showError(message);
      throw err;
    }
  }

  cancelPreview(_previewId?: string): void {
    if (this.stopped) return;
    const preview = this.deps.session.getSnapshot().preview;
    if (preview && this.deps.cancelCircleDataPreview) {
      this.deps.cancelCircleDataPreview.execute(preview);
    }
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
      "gas-sheet-list",
      (sheets) => {
        this.deps.session.setSheetNames(this.parseStringList(sheets));
        this.deps.onOperationComplete?.("gas-sheet-list");
      },
    );
  }

  async loadGoogleSheetCircles(
    source: unknown,
  ): Promise<readonly CircleRecord[]> {
    const parsed = parseGasSource(source);
    let circles: readonly CircleRecord[] = [];
    await this.runRequest(
      this.deps.client.startLoadingCircles(parsed),
      "gas-preview",
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
    this.started = false;
    this.activeEventDayUnsubscribe?.();
    this.activeEventDayUnsubscribe = null;
    this.activeEventDayKey = null;
    this.cancelCurrentRequest();
    for (const { target, type, handler } of this.listeners) {
      target.removeEventListener(type, handler);
    }
    this.listeners = [];
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
    operation: Exclude<CircleDataSourceOperation, "idle">,
    onSuccess: (value: T, sequence: number, generation: number) => void,
  ): Promise<void> {
    this.cancelCurrentRequest();
    const sequence = ++this.requestSequence;
    const generation = this.deps.session.beginRequest(operation);
    this.currentRequest = request as CancelableRequest<unknown>;
    try {
      const value = await request.result;
      if (
        !this.stopped &&
        sequence === this.requestSequence &&
        this.deps.session.isCurrentRequest(generation)
      ) {
        onSuccess(value, sequence, generation);
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

  private isCurrent(sequence: number, generation: number): boolean {
    return (
      !this.stopped &&
      sequence === this.requestSequence &&
      this.deps.session.isCurrentRequest(generation)
    );
  }
}
