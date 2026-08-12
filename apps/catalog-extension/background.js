import { normalizeSettings, sendCatalog } from "./lib/catalog-client.js";
import { sendActiveCatalog } from "./lib/catalog-command.js";

function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ gasUrl: "", sheetName: "" }, resolve);
  });
}

function sendConfiguredCatalog(payload) {
  return readSettings().then((settings) =>
    sendCatalog(normalizeSettings(settings), payload),
  );
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function setCommandBadge(tabId, result) {
  chrome.action.setBadgeText({ tabId, text: result.ok ? "OK" : "!" });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }), 2000);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "COMIPATH_SEND_CATALOG") return false;

  (async () => {
    try {
      sendResponse(await sendConfiguredCatalog(message.payload));
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "COMIPATH_SEND_CATALOG_SHORTCUT") return false;
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") return false;

  (async () => {
    try {
      const result = await sendActiveCatalog({
        tabId,
        sendTabMessage,
        sendCatalogPayload: sendConfiguredCatalog,
      });
      setCommandBadge(tabId, result);
      sendResponse(result);
    } catch {
      const result = { ok: false, message: "送信できませんでした" };
      setCommandBadge(tabId, result);
      sendResponse(result);
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "send-catalog" || typeof tab?.id !== "number") return;

  (async () => {
    try {
      const result = await sendActiveCatalog({
        tabId: tab.id,
        sendTabMessage,
        sendCatalogPayload: sendConfiguredCatalog,
      });
      setCommandBadge(tab.id, result);
    } catch {
      setCommandBadge(tab.id, { ok: false });
    }
  })();
});
