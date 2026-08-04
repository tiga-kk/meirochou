import type { RouteGuidanceScreenModel } from "./route-guidance-screen-model";

export interface RouteGuidanceView {
  showCalculatingRoute(): void;
  showRouteGuidance(model: RouteGuidanceScreenModel): void;
  showNoRouteGuidance(): void;
  showResumeDialog(model: unknown): void;
  closeResumeDialog(): void;
}

/** Renders route guidance labels into already-owned DOM nodes. */
export class DomRouteGuidanceView implements RouteGuidanceView {
  constructor(
    private readonly statusElement: HTMLElement | null = null,
    private readonly targetElement: HTMLElement | null = null,
  ) {}

  showCalculatingRoute(): void {
    this.statusElement?.replaceChildren("経路を計算中…");
  }
  showRouteGuidance(model: RouteGuidanceScreenModel): void {
    this.statusElement?.replaceChildren(model.statusLabel);
    this.targetElement?.replaceChildren(model.space);
  }
  showNoRouteGuidance(): void {
    this.statusElement?.replaceChildren("経路なし");
  }
  showResumeDialog(_model: unknown): void {}
  closeResumeDialog(): void {}
}
