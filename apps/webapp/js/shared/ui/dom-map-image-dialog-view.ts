export class DomMapImageDialogView {
  constructor(
    private readonly dialog: HTMLElement | null = null,
    private readonly image: HTMLImageElement | null = null,
  ) {}
  open(source: string): void {
    if (this.image) this.image.src = source;
    this.dialog?.classList.remove("hidden");
  }
  close(): void {
    if (this.image) this.image.removeAttribute("src");
    this.dialog?.classList.add("hidden");
  }
}
