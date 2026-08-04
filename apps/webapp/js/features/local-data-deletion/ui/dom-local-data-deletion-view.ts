import type { LocalDataDeletionOption } from "./local-data-deletion-dialog-model";

export class DomLocalDataDeletionView {
  constructor(private readonly root: HTMLElement | null = null) {}
  render(options: readonly LocalDataDeletionOption[]): void {
    if (!this.root) return;
    this.root.replaceChildren(
      ...options.map((option) => {
        const item = document.createElement("div");
        item.textContent = `${option.label}: ${option.consequence}`;
        item.toggleAttribute("aria-disabled", option.blocked);
        return item;
      }),
    );
  }
  close(): void {
    this.root?.classList.add("hidden");
  }
  focusTrigger(): void {}
  showError(message: string): void {
    this.root?.replaceChildren(message);
  }
}
