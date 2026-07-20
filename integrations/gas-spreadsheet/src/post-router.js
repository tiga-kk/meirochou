// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (error) {
    return jsonResponse(errorResponse(`Invalid JSON: ${error.message}`));
  }

  if (data.action === "sale") {
    return doPostSale(data);
  }

  return jsonResponse(errorResponse(`Unknown action: ${data.action}`));
}
