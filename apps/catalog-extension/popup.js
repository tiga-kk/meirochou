(() => {
  const message = document.querySelector("#message");
  const result = document.querySelector("#result");
  const spaceElement = document.querySelector("#space");
  const accountElement = document.querySelector("#account");
  const sendButton = document.querySelector("#send");
  let payload = null;

  function showMessage(text, role = "status") {
    message.textContent = text;
    message.setAttribute("role", role);
  }

  document.querySelector("#options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  sendButton.addEventListener("click", () => {
    if (!payload) return;
    sendButton.disabled = true;
    showMessage("送信中…");
    chrome.runtime.sendMessage(
      { type: "COMIPATH_SEND_CATALOG", payload },
      (response) => {
        if (chrome.runtime.lastError) {
          showMessage("拡張機能の通信に失敗しました", "alert");
          sendButton.disabled = false;
          return;
        }
        if (!response?.ok) {
          showMessage(response?.message || "送信できませんでした", "alert");
          sendButton.disabled = false;
          return;
        }
        showMessage(response.message || "送信しました");
      },
    );
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (typeof tabId !== "number") {
      showMessage("対応するカタログページを開いてください", "alert");
      return;
    }
    chrome.tabs.sendMessage(
      tabId,
      { type: "COMIPATH_EXTRACT_CATALOG" },
      (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          showMessage("対応するカタログページを開いてください", "alert");
          return;
        }
        payload = response.payload;
        spaceElement.textContent = payload.space;
        accountElement.textContent = payload.account || "未登録";
        result.hidden = false;
        sendButton.disabled = false;
        showMessage("内容を確認してから送信してください");
      },
    );
  });
})();
