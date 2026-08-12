import { normalizeSettings } from "./lib/catalog-client.js";

const form = document.querySelector("#settings-form");
const gasUrl = document.querySelector("#gas-url");
const sheetName = document.querySelector("#sheet-name");
const checkConnection = document.querySelector("#check-connection");
const status = document.querySelector("#status");

chrome.storage.sync.get({ gasUrl: "", sheetName: "" }, (settings) => {
  gasUrl.value = settings.gasUrl;
  sheetName.value = settings.sheetName;
});

checkConnection.addEventListener("click", () => {
  status.textContent = "接続を確認中…";
  chrome.runtime.sendMessage({ type: "COMIPATH_PROBE_GAS" }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = "GASへの接続に失敗しました。";
      return;
    }
    status.textContent = response?.message || "設定を確認してください";
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const settings = normalizeSettings({
      gasUrl: gasUrl.value,
      sheetName: sheetName.value,
    });
    chrome.storage.sync.set(settings, () => {
      status.textContent = "設定を保存しました";
    });
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : "設定を確認してください";
  }
});
