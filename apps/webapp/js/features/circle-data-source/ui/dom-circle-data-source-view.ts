import { formatSourceDiff } from "../../../shared/ui/management-view-model";
import type { CircleDataPreview } from "../domain/circle-data-source-types";

export interface CircleDataSourceView {
  showLoading(): void;
  showPreview(preview: CircleDataPreview): void;
  showError(message: string): void;
  showReady(): void;
}

export class DomCircleDataSourceView implements CircleDataSourceView {
  constructor(private readonly root: HTMLElement | null = null) {}
  showLoading(): void {
    this.root?.setAttribute("aria-busy", "true");
    if (this.root && "model" in this.root && this.root.model) {
      this.root.model = { ...this.root.model, busy: true };
    }
  }
  showPreview(preview: CircleDataPreview): void {
    this.root?.setAttribute("data-state", "preview");
    this.root?.setAttribute("data-preview-id", preview.previewId);
    if (this.root && "model" in this.root) {
      this.root.model = {
        open: true,
        previewId: preview.previewId,
        sourceLabel:
          preview.source?.type === "gas"
            ? preview.source.sheetName
            : (preview.source?.fileName ?? "CSV"),
        diff: formatSourceDiff(preview.diff),
        busy: false,
        errorMessage: "",
      };
    }
  }
  showError(message: string): void {
    this.root?.setAttribute("data-state", "error");
    if (this.root && "model" in this.root && this.root.model) {
      this.root.model = {
        ...this.root.model,
        busy: false,
        errorMessage: message,
      };
    } else {
      this.root?.replaceChildren(message);
    }
  }
  showReady(): void {
    this.root?.removeAttribute("aria-busy");
    this.root?.setAttribute("data-state", "ready");
    if (this.root && "model" in this.root && this.root.model) {
      this.root.model = {
        ...this.root.model,
        open: false,
        busy: false,
        errorMessage: "",
      };
    }
  }
}
