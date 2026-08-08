interface RouteGuidanceEventApplication {
  searchNext(): void | Promise<void>;
  handleResumeConfirm(): void;
  handleResumeResetStart(): void;
  handleOptimizationTimeLimitChange(detail: unknown): void;
}

export function bindRouteGuidanceEvents(
  application: RouteGuidanceEventApplication,
  document: Document,
  settings: EventTarget | null,
): () => void {
  const removers: Array<() => void> = [];
  const listen = (
    target: EventTarget | null,
    type: string,
    listener: EventListener,
  ) => {
    if (!target) return;
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  };

  listen(document.getElementById("btn-search"), "click", () => {
    void application.searchNext();
  });

  listen(document.getElementById("navigation-resume-dialog"), "resume-confirm", () => {
    application.handleResumeConfirm();
  });
  listen(document.getElementById("navigation-resume-dialog"), "resume-reset-start", () => {
    application.handleResumeResetStart();
  });

  listen(settings, "optimization-time-limit-change", (event) => {
    application.handleOptimizationTimeLimitChange((event as CustomEvent).detail);
  });

  return () => {
    for (const remove of removers.splice(0)) remove();
  };
}
