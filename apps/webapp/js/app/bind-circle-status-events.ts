interface CircleStatusEventApplication {
  readonly ui: {
    readonly statsRenderer: {
      setOnHoldListReset(callback: (() => void) | null): void;
    } | null;
  };
  handleAction(action: "purchase" | "hold"): void | Promise<void>;
  handleReset(): void;
  handleResetHold(): void;
}

export function bindCircleStatusEvents(
  application: CircleStatusEventApplication,
  document: Document,
): () => void {
  const removers: Array<() => void> = [];
  const listen = (id: string, listener: EventListener) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.addEventListener("click", listener);
    removers.push(() => target.removeEventListener("click", listener));
  };

  listen("btn-purchased", () => {
    void application.handleAction("purchase");
  });
  listen("btn-hold", () => {
    void application.handleAction("hold");
  });
  listen("btn-reset-all", () => {
    application.handleReset();
  });

  if (application.ui.statsRenderer) {
    application.ui.statsRenderer.setOnHoldListReset(() => {
      application.handleResetHold();
    });
  }

  return () => {
    for (const remove of removers.splice(0)) remove();
    application.ui.statsRenderer?.setOnHoldListReset?.(null);
  };
}
