import type { EventDayRef } from "../features/event-day/domain/application-contract-types";

export type ManagementBusyLane =
  | "transition"
  | "source-request"
  | "preview-apply"
  | "outbox"
  | "delete"
  | "export";

export type ActiveSourcePreview =
  | {
      readonly kind: "csv";
      readonly ref: EventDayRef;
      readonly previewId: string;
      readonly expectedSourceGeneration: string;
    }
  | {
      readonly kind: "gas";
      readonly ref: EventDayRef;
      readonly previewId: string;
      readonly mode: "initial" | "replacement" | "refresh";
      readonly expectedSourceGeneration: string;
    };

/** Copies and freezes an EventDayRef to prevent accidental external mutation. */
function freezeRef(ref: EventDayRef): EventDayRef {
  return Object.freeze({ eventId: ref.eventId, dayId: ref.dayId });
}

/** Copies and freezes an ActiveSourcePreview descriptor. */
function freezePreview(preview: ActiveSourcePreview): ActiveSourcePreview {
  if (preview.kind === "csv") {
    return Object.freeze({
      kind: "csv",
      ref: freezeRef(preview.ref),
      previewId: preview.previewId,
      expectedSourceGeneration: preview.expectedSourceGeneration,
    });
  }
  return Object.freeze({
    kind: "gas",
    ref: freezeRef(preview.ref),
    previewId: preview.previewId,
    mode: preview.mode,
    expectedSourceGeneration: preview.expectedSourceGeneration,
  });
}

/**
 * Pure ComiPathBrowserRuntime-owned session state for managing in-flight requests, abort controllers,
 * busy lanes, and preview lifecycle without importing repositories or services.
 */
export class ManagementSession {
  private busyLanes = new Set<ManagementBusyLane>();
  private requestTokenCounter = 0;
  private currentGasAbortController: AbortController | null = null;
  private activePreview: ActiveSourcePreview | null = null;

  setBusy(lane: ManagementBusyLane, busy: boolean): void {
    if (busy) {
      this.busyLanes.add(lane);
    } else {
      this.busyLanes.delete(lane);
    }
  }

  isBusy(lane: ManagementBusyLane): boolean {
    return this.busyLanes.has(lane);
  }

  isAnyBusy(): boolean {
    return this.busyLanes.size > 0;
  }

  nextRequestToken(): number {
    this.requestTokenCounter += 1;
    return this.requestTokenCounter;
  }

  isLatestRequestToken(token: number): boolean {
    return token === this.requestTokenCounter;
  }

  setGasAbortController(controller: AbortController | null): void {
    this.currentGasAbortController = controller;
  }

  /** Invalidates the previous source request and starts a fresh busy lane. */
  beginSourceRequest(): number {
    this.abortGasRequest();
    this.clearPreview();
    this.setBusy("source-request", true);
    return this.nextRequestToken();
  }

  getGasAbortController(): AbortController | null {
    return this.currentGasAbortController;
  }

  abortGasRequest(): void {
    if (this.currentGasAbortController) {
      this.currentGasAbortController.abort();
      this.currentGasAbortController = null;
    }
  }

  setActivePreview(preview: ActiveSourcePreview | null): void {
    this.activePreview = preview ? freezePreview(preview) : null;
  }

  getActivePreview(): ActiveSourcePreview | null {
    return this.activePreview;
  }

  clearPreview(): void {
    this.activePreview = null;
  }

  /**
   * Resets in-flight source requests, clears previews, and advances the token counter
   * when switching event/day selection.
   */
  onEventDayChange(): void {
    this.nextRequestToken();
    this.abortGasRequest();
    this.clearPreview();
    this.setBusy("source-request", false);
  }

  /**
   * Resets in-flight source requests, clears previews, and clears all busy lanes when closing settings.
   */
  onSettingsClose(): void {
    this.onEventDayChange();
    this.busyLanes.clear();
  }

  stop(): void {
    this.abortGasRequest();
    this.clearPreview();
    this.busyLanes.clear();
    this.nextRequestToken();
  }
}
