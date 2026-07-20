// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function successResponse(payload) {
  return Object.assign(
    {
      ok: true,
      status: "success",
    },
    payload || {},
  );
}

// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function errorResponse(message, payload) {
  return Object.assign(
    {
      ok: false,
      status: "error",
      message,
      error: message,
    },
    payload || {},
  );
}

// biome-ignore lint/correctness/noUnusedVariables: global function exposed to Apps Script environment
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
