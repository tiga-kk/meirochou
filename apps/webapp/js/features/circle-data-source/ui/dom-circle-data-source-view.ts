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
  }
  showPreview(preview: CircleDataPreview): void {
    this.root?.setAttribute("data-state", "preview");
    this.root?.setAttribute("data-preview-id", preview.previewId);
  }
  showError(message: string): void {
    this.root?.setAttribute("data-state", "error");
    this.root?.replaceChildren(message);
  }
  showReady(): void {
    this.root?.removeAttribute("aria-busy");
    this.root?.setAttribute("data-state", "ready");
  }
}
