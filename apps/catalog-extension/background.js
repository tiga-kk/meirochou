import { normalizeSettings, sendCatalog } from "./lib/catalog-client.js";

function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ gasUrl: "", sheetName: "" }, resolve);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "COMIPATH_SEND_CATALOG") return false;

  (async () => {
    try {
      const settings = normalizeSettings(await readSettings());
      sendResponse(await sendCatalog(settings, message.payload));
    } catch (error) {
      sendResponse({
        ok: false,
        message:
          error instanceof Error ? error.message : "設定を確認してください",
      });
    }
  })();
  return true;
});
