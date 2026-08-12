export async function sendActiveCatalog({
  tabId,
  sendTabMessage,
  sendCatalogPayload,
}) {
  const response = await sendTabMessage(tabId, {
    type: "COMIPATH_EXTRACT_CATALOG",
  });
  if (!response?.ok) {
    return {
      ok: false,
      message: "対応するカタログページを開いてください",
    };
  }
  return sendCatalogPayload(response.payload);
}
