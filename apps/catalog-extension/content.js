(() => {
  const messageType = "COMIPATH_EXTRACT_CATALOG";
  const shortcut = globalThis.ComiPathCatalogShortcut;

  function isEditableTarget(target) {
    return (
      target instanceof Element &&
      (target.matches("input, textarea, select, [contenteditable='true']") ||
        Boolean(
          target.closest("input, textarea, select, [contenteditable='true']"),
        ))
    );
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== messageType) return false;
    const extractor = globalThis.ComiPathCatalogExtractor;
    const space = extractor?.extractSpace(document);
    const tweet = extractor?.extractCatalogImageUrl(document);
    const account = extractor?.extractTwitterUrl(document);
    if (!space || !tweet) {
      sendResponse({
        ok: false,
        message: "対応するカタログ情報を取得できませんでした",
      });
      return false;
    }
    sendResponse({
      ok: true,
      payload: { space, ...(account ? { account } : {}), tweet },
    });
    return false;
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (!shortcut?.isSendShortcut(event) || isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      chrome.runtime.sendMessage(
        { type: "COMIPATH_SEND_CATALOG_SHORTCUT" },
        () => void chrome.runtime.lastError,
      );
    },
    true,
  );
})();
