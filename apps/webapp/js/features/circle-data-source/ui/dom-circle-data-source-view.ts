export interface CircleDataSourceView {
  showLoading(): void;
  showPreview(): void;
  showError(message: string): void;
  showReady(): void;
}

export class DomCircleDataSourceView implements CircleDataSourceView {
  constructor(private readonly root: HTMLElement | null = null) {}
  showLoading(): void {
    this.root?.setAttribute("aria-busy", "true");
  }
  showPreview(): void {
    this.root?.setAttribute("data-state", "preview");
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
