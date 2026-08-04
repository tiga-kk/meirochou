export type NotificationSeverity = "info" | "warning" | "error";

export class DomUserNotificationView {
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly element: HTMLElement | null = null) {}
  showNotification(
    message: string,
    severity: NotificationSeverity = "info",
  ): void {
    if (this.timer) clearTimeout(this.timer);
    this.element?.replaceChildren(message);
    this.element?.setAttribute("data-severity", severity);
    this.element?.classList.remove("hidden");
    this.timer = setTimeout(() => this.element?.classList.add("hidden"), 4000);
  }
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
