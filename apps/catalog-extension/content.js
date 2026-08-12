(() => {
  const messageType = "COMIPATH_EXTRACT_CATALOG";
  const toastMessageType = "COMIPATH_SHOW_CATALOG_TOAST";
  const shortcut = globalThis.ComiPathCatalogShortcut;
  let toastTimer;

  // Show a short-lived success message without changing the catalog page layout.
  function showToast(text) {
    const existing = document.querySelector("#comipath-catalog-toast");
    existing?.remove();
    const toast = document.createElement("div");
    toast.id = "comipath-catalog-toast";
    toast.textContent = text;
    toast.style.cssText =
      "position:fixed;right:20px;bottom:20px;z-index:2147483647;padding:12px 18px;border-radius:8px;background:#18794e;color:#fff;font:600 14px sans-serif;box-shadow:0 4px 16px #0004;";
    document.documentElement.append(toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), 2500);
  }

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
    if (message?.type === toastMessageType) {
      showToast(message.text || "成功");
      return false;
    }
    if (message?.type !== messageType) return false;
    const extractor = globalThis.ComiPathCatalogExtractor;
    const space = extractor?.extractSpace(document);
    const account = extractor?.extractTwitterUrl(document);
    if (!space) {
      sendResponse({
        ok: false,
        message: "対応するカタログ情報を取得できませんでした",
      });
      return false;
    }
    sendResponse({
      ok: true,
      payload: { space, ...(account ? { account } : {}) },
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
