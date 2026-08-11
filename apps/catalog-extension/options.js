import { normalizeSettings } from "./lib/catalog-client.js";

const form = document.querySelector("#settings-form");
const gasUrl = document.querySelector("#gas-url");
const sheetName = document.querySelector("#sheet-name");
const status = document.querySelector("#status");

chrome.storage.sync.get({ gasUrl: "", sheetName: "" }, (settings) => {
  gasUrl.value = settings.gasUrl;
  sheetName.value = settings.sheetName;
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
