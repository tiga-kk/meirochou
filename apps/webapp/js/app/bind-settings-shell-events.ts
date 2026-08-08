interface SettingsShellEventApplication {
  readonly ui: {
    readonly els: {
      readonly settingsArea: (EventTarget & { open?: boolean }) | null;
    };
    showGallery(name: string, open: boolean): void;
  };
  toggleSettings(target: Element | null): void;
  showGalleryForArea(areaId: string): void;
}

export function bindSettingsShellEvents(
  application: SettingsShellEventApplication,
  document: Document,
  settings: (EventTarget & { open?: boolean }) | null,
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
  const settingsToggle = document.getElementById("toggle-settings");

  if (settings) {
    listen(settingsToggle, "click", () => {
      application.toggleSettings(settingsToggle);
    });

    const onEscape = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (
        keyboardEvent.key !== "Escape" ||
        !settings.open ||
        !settingsToggle
      )
        return;
      keyboardEvent.preventDefault();
      settingsToggle.dispatchEvent(new Event("click"));
      (settingsToggle as HTMLElement).focus();
    };
    listen(document, "keydown", onEscape);
  }

  const gallery = document.getElementById("btn-open-gallery");
  listen(gallery, "click", () => {
    const areaId = (document.getElementById("loc-ewsn") as HTMLInputElement)?.value;
    application.showGalleryForArea(areaId);
  });

  return () => {
    for (const remove of removers.splice(0)) remove();
  };
}
