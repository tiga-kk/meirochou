// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function doPost(e) {
  let data;
  try {
    const contents = e?.postData ? e.postData.contents : undefined;
    if (typeof contents !== "string") throw new Error("invalid body");
    data = JSON.parse(contents);
  } catch {
    return jsonResponse(errorResponse("Invalid JSON.", "INVALID_JSON"));
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return jsonResponse(
      errorResponse("Invalid request body.", "INVALID_INPUT"),
    );
  }

  if (data.action === "sale") {
    return doPostSale(data);
  }

  return jsonResponse(errorResponse("Unknown action.", "UNKNOWN_ACTION"));
}
