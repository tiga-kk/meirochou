(() => {
  function isSendShortcut(event) {
    return Boolean(
      event?.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.code === "KeyS" ||
          String(event.key || "").toLowerCase() === "s"),
    );
  }

  globalThis.ComiPathCatalogShortcut = Object.freeze({ isSendShortcut });
})();
