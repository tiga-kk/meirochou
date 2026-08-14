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

  const listenAsyncAction = (id: string, action: "purchase" | "hold") => {
    let pending = false;
    listen(id, (event) => {
      const button = event.currentTarget as HTMLButtonElement | null;
      if (pending || !button) return;
      pending = true;
      const wasDisabled = button.disabled;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      Promise.resolve(application.handleAction(action)).catch(() => {}).finally(() => {
        pending = false;
        button.disabled = wasDisabled;
        button.removeAttribute("aria-busy");
      });
    });
  };

  listenAsyncAction("btn-purchased", "purchase");
  listenAsyncAction("btn-hold", "hold");
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
