(() => {
  const messageType = "COMIPATH_EXTRACT_CATALOG";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== messageType) return false;
    const extractor = globalThis.ComiPathCatalogExtractor;
    const space = extractor?.extractSpace(document);
    const tweet = extractor?.extractCatalogImageUrl(document);
    if (!space || !tweet) {
      sendResponse({
        ok: false,
        message: "対応するカタログ情報を取得できませんでした",
      });
      return false;
    }
    sendResponse({ ok: true, payload: { space, tweet } });
    return false;
  });
})();
